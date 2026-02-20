import json
import sqlite3
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..db.database import get_db

router = APIRouter(prefix="", tags=["jobs"])


def db_conn():
    conn = get_db()
    try:
        yield conn
    finally:
        conn.close()


def _row_to_job(row: sqlite3.Row) -> dict[str, Any]:
    job = dict(row)
    raw_skills = job.get("skills_required_json")
    if isinstance(raw_skills, str):
        try:
            job["skills_required_json"] = json.loads(raw_skills)
        except json.JSONDecodeError:
            pass
    return job


@router.get("/jobs")
def get_jobs(db: sqlite3.Connection = Depends(db_conn)):
    rows = db.execute(
        """
        SELECT * FROM jobs
        WHERE is_archived = 0
        ORDER BY match_score DESC, discovered_at DESC
        """
    ).fetchall()
    return [_row_to_job(row) for row in rows]


@router.get("/jobs/{job_id}")
def get_job(job_id: str, db: sqlite3.Connection = Depends(db_conn)):
    row = db.execute(
        "SELECT * FROM jobs WHERE id = ? AND is_archived = 0",
        (job_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return _row_to_job(row)


@router.delete("/jobs/{job_id}")
def archive_job(job_id: str, db: sqlite3.Connection = Depends(db_conn)):
    result = db.execute(
        "UPDATE jobs SET is_archived = 1 WHERE id = ? AND is_archived = 0",
        (job_id,),
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"ok": True, "job_id": job_id, "is_archived": 1}
