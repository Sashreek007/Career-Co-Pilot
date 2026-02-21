import asyncio
import sqlite3
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from ..db.database import get_db
from ..engines.discovery.adapters.browser_assisted import (
    IndeedUserAssistedAdapter,
    LinkedInUserAssistedAdapter,
)
from ..engines.discovery.deduplicator import deduplicate_jobs
from ..engines.discovery.normalizer import normalize_jobs
from ..engines.discovery.orchestrator import run_discovery
from ..engines.discovery.ranker import apply_ranking

router = APIRouter(prefix="/discovery", tags=["discovery"])
_DEFAULT_SOURCES = ["remotive", "greenhouse"]
_SUPPORTED_SOURCES = ["remotive", "greenhouse", "linkedin_browser", "indeed_browser"]


class DiscoveryRunRequest(BaseModel):
    sources: list[str] | None = None
    max_results_per_query: int = 20


class BrowserAssistDiscoveryRequest(BaseModel):
    source: str = "linkedin"
    query: str = Field(..., min_length=2, max_length=200)
    max_results: int = Field(default=20, ge=1, le=60)
    min_match_score: float = Field(default=0.15, ge=0.0, le=1.0)
    use_visible_browser: bool = True
    cdp_endpoint: str | None = None
    wait_seconds: int = Field(default=25, ge=5, le=180)


def _effective_sources(request: DiscoveryRunRequest) -> list[str]:
    candidate = request.sources or _DEFAULT_SOURCES
    seen: set[str] = set()
    resolved: list[str] = []
    for source in candidate:
        normalized = str(source).strip().lower()
        if normalized not in _SUPPORTED_SOURCES:
            continue
        if normalized in seen:
            continue
        seen.add(normalized)
        resolved.append(normalized)
    return resolved or _DEFAULT_SOURCES


def _run_discovery_job(request: DiscoveryRunRequest) -> None:
    conn = get_db()
    try:
        asyncio.run(
            run_discovery(
                conn,
                sources=request.sources,
                max_results_per_query=request.max_results_per_query,
            )
        )
    finally:
        conn.close()


def _normalize_browser_source(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if normalized in {"linkedin", "linkedin_browser"}:
        return "linkedin_browser"
    if normalized in {"indeed", "indeed_browser"}:
        return "indeed_browser"
    raise HTTPException(status_code=400, detail="source must be linkedin or indeed")


def _build_browser_adapter(payload: BrowserAssistDiscoveryRequest):
    source = _normalize_browser_source(payload.source)
    if source == "linkedin_browser":
        return source, LinkedInUserAssistedAdapter(
            use_visible_browser=payload.use_visible_browser,
            cdp_endpoint=payload.cdp_endpoint,
            manual_wait_seconds=payload.wait_seconds,
        )
    return source, IndeedUserAssistedAdapter(
        use_visible_browser=payload.use_visible_browser,
        cdp_endpoint=payload.cdp_endpoint,
        manual_wait_seconds=payload.wait_seconds,
    )


def _insert_jobs(db_conn: sqlite3.Connection, jobs: list[dict]) -> None:
    if not jobs:
        return
    db_conn.executemany(
        """
        INSERT OR IGNORE INTO jobs (
            id, title, company, location, remote, description, skills_required_json,
            source, source_url, match_score, match_tier, posted_date, discovered_at, is_archived
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                job["id"],
                job["title"],
                job["company"],
                job["location"],
                job["remote"],
                job["description"],
                job["skills_required_json"],
                job["source"],
                job["source_url"],
                job["match_score"],
                job["match_tier"],
                job["posted_date"],
                job["discovered_at"],
                job["is_archived"],
            )
            for job in jobs
        ],
    )
    db_conn.commit()


@router.post("/run")
def trigger_discovery(
    background_tasks: BackgroundTasks,
    request: DiscoveryRunRequest | None = None,
):
    payload = request or DiscoveryRunRequest()
    effective_sources = _effective_sources(payload)
    background_tasks.add_task(_run_discovery_job, payload)
    return {
        "queued": True,
        "status": "running",
        "sources": effective_sources,
        "mode": "bulk_discovery",
        "started_at": datetime.utcnow().isoformat(),
    }


@router.post("/browser-assist")
async def run_browser_assisted_discovery(payload: BrowserAssistDiscoveryRequest):
    source, adapter = _build_browser_adapter(payload)
    query = payload.query.strip()

    conn: sqlite3.Connection = get_db()
    run_id = f"discovery-{uuid4().hex[:10]}"
    started_at = datetime.utcnow().isoformat()
    conn.execute(
        """
        INSERT INTO discovery_runs (id, started_at, source, status)
        VALUES (?, ?, ?, ?)
        """,
        (run_id, started_at, source, "running"),
    )
    conn.commit()

    try:
        profile_row = conn.execute("SELECT * FROM user_profile WHERE id = 'local'").fetchone()
        if profile_row is None:
            raise HTTPException(status_code=404, detail="Profile not found")
        profile = dict(profile_row)

        raw_jobs = await adapter.search(query, max_results=payload.max_results)
        if not raw_jobs and adapter.last_error:
            raise HTTPException(
                status_code=503,
                detail=(
                    "Browser-assisted discovery failed. "
                    f"{adapter.last_error}"
                ),
            )

        normalized = normalize_jobs(raw_jobs)
        existing_rows = conn.execute("SELECT id, title, company FROM jobs").fetchall()
        existing_ids = {str(row["id"]) for row in existing_rows}
        existing_pairs = [
            f"{str(row['title'] or '').strip()} {str(row['company'] or '').strip()}".strip()
            for row in existing_rows
        ]

        deduped = deduplicate_jobs(normalized, existing_ids, existing_pairs)
        ranked = [apply_ranking(job, profile) for job in deduped]
        threshold = max(0.0, min(float(payload.min_match_score), 1.0))
        filtered = [job for job in ranked if float(job.get("match_score") or 0.0) >= threshold]

        _insert_jobs(conn, filtered)

        completed_at = datetime.utcnow().isoformat()
        conn.execute(
            """
            UPDATE discovery_runs
            SET completed_at = ?, jobs_found = ?, jobs_new = ?, status = ?
            WHERE id = ?
            """,
            (completed_at, len(normalized), len(filtered), "completed", run_id),
        )
        conn.commit()

        return {
            "run_id": run_id,
            "status": "completed",
            "mode": "browser_assisted_visible" if payload.use_visible_browser else "browser_assisted_managed",
            "source": source,
            "query": query,
            "jobs_found": len(normalized),
            "jobs_new": len(filtered),
            "min_match_score": threshold,
            "started_at": started_at,
            "completed_at": completed_at,
        }
    except HTTPException as exc:
        completed_at = datetime.utcnow().isoformat()
        conn.execute(
            """
            UPDATE discovery_runs
            SET completed_at = ?, jobs_found = 0, jobs_new = 0, status = ?
            WHERE id = ?
            """,
            (completed_at, "failed", run_id),
        )
        conn.commit()
        raise exc
    except Exception:
        completed_at = datetime.utcnow().isoformat()
        conn.execute(
            """
            UPDATE discovery_runs
            SET completed_at = ?, jobs_found = 0, jobs_new = 0, status = ?
            WHERE id = ?
            """,
            (completed_at, "failed", run_id),
        )
        conn.commit()
        raise
    finally:
        conn.close()


@router.get("/status")
def get_discovery_status():
    conn: sqlite3.Connection = get_db()
    try:
        row = conn.execute(
            """
            SELECT *
            FROM discovery_runs
            ORDER BY started_at DESC
            LIMIT 1
            """
        ).fetchone()
        if row is None:
            return {"status": "idle"}
        return dict(row)
    finally:
        conn.close()


@router.get("/sources")
def get_discovery_sources():
    return {
        "defaults": _DEFAULT_SOURCES,
        "supported": _SUPPORTED_SOURCES,
        "note": (
            "Bulk discovery uses public sources. "
            "LinkedIn/Indeed are available in browser-assisted mode with user session."
        ),
    }
