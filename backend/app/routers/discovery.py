import asyncio
import sqlite3
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

from ..db.database import get_db
from ..engines.discovery.orchestrator import run_discovery

router = APIRouter(prefix="/discovery", tags=["discovery"])
_DEFAULT_SOURCES = ["greenhouse"]
_SUPPORTED_SOURCES = ["greenhouse"]


class DiscoveryRunRequest(BaseModel):
    sources: list[str] | None = None
    max_results_per_query: int = 20


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
async def run_browser_assisted_discovery():
    raise HTTPException(
        status_code=410,
        detail=(
            "In-app browser-assisted discovery has been retired. "
            "Use the Browser Helper extension to capture jobs from your local Chrome tab and import them."
        ),
    )


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


@router.get("/browser-status")
def get_browser_status():
    return {
        "connected": False,
        "endpoint": "",
        "configured_endpoint": "",
        "browser_info": {},
        "error": (
            "In-app browser status checks are retired. "
            "Use Browser Helper extension popup (Check Backend + Detect Page) instead."
        ),
        "how_to_start": (
            "Load browser-helper-extension in Chrome and use extension controls for detection/capture."
        ),
    }


@router.get("/sources")
def get_discovery_sources():
    return {
        "defaults": _DEFAULT_SOURCES,
        "supported": _SUPPORTED_SOURCES,
        "note": (
            "Bulk discovery uses public sources only. "
            "For LinkedIn/Indeed, use Browser Helper extension capture/import."
        ),
    }
