import asyncio
import sqlite3
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks

from ..db.database import get_db
from ..engines.discovery.orchestrator import run_discovery

router = APIRouter(prefix="/discovery", tags=["discovery"])


def _run_discovery_job() -> None:
    conn = get_db()
    try:
        asyncio.run(run_discovery(conn))
    finally:
        conn.close()


@router.post("/run")
def trigger_discovery(background_tasks: BackgroundTasks):
    background_tasks.add_task(_run_discovery_job)
    return {
        "queued": True,
        "status": "running",
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
