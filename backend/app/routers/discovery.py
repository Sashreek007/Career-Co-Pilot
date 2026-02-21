import asyncio
import sqlite3
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from ..db.database import get_db
from ..engines.discovery.orchestrator import run_discovery

router = APIRouter(prefix="/discovery", tags=["discovery"])
_DEFAULT_SOURCES = ["remotive", "greenhouse"]
_BROWSER_SOURCES = {"linkedin_browser", "indeed_browser"}
_SUPPORTED_SOURCES = ["remotive", "greenhouse", "linkedin_browser", "indeed_browser"]


class DiscoveryRunRequest(BaseModel):
    sources: list[str] | None = None
    user_assisted: bool = False
    max_results_per_query: int = 20
    browser_query_limit: int = 2


def _effective_sources(request: DiscoveryRunRequest) -> list[str]:
    candidate = request.sources or _DEFAULT_SOURCES
    seen: set[str] = set()
    resolved: list[str] = []
    for source in candidate:
        normalized = str(source).strip().lower()
        if normalized not in _SUPPORTED_SOURCES:
            continue
        if normalized in _BROWSER_SOURCES and not request.user_assisted:
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
                user_assisted=request.user_assisted,
                max_results_per_query=request.max_results_per_query,
                browser_query_limit=request.browser_query_limit,
            )
        )
    finally:
        conn.close()


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
        "user_assisted": payload.user_assisted,
        "started_at": datetime.utcnow().isoformat(),
    }


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
        "note": "Browser sources are user-assisted and should be run with user_assisted=true.",
    }
