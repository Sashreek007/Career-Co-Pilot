import json
import sqlite3
from hashlib import sha256
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

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


class ImportJobRequest(BaseModel):
    source_url: str
    title: str
    company: str
    location: str | None = None
    description: str | None = None
    remote: bool = False


def _source_from_url(source_url: str) -> str:
    host = urlparse(source_url).netloc.lower()
    if "linkedin.com" in host:
        return "linkedin_manual"
    if "indeed." in host:
        return "indeed_manual"
    if "greenhouse.io" in host or "greenhouse" in host:
        return "greenhouse_manual"
    return host or "manual"


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


@router.post("/jobs/import-link")
def import_job_from_link(payload: ImportJobRequest, db: sqlite3.Connection = Depends(db_conn)):
    source_url = payload.source_url.strip()
    parsed = urlparse(source_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="source_url must be a valid http(s) URL")

    title = payload.title.strip()
    company = payload.company.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    if not company:
        raise HTTPException(status_code=400, detail="company is required")

    job_id = "manual-" + sha256(source_url.encode("utf-8")).hexdigest()[:16]
    db.execute(
        """
        INSERT OR REPLACE INTO jobs (
            id, title, company, location, remote, description, skills_required_json,
            source, source_url, match_score, match_tier, posted_date, discovered_at, is_archived
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 0)
        """,
        (
            job_id,
            title,
            company,
            (payload.location or "Remote").strip() or "Remote",
            1 if payload.remote else 0,
            (payload.description or "").strip(),
            json.dumps([]),
            _source_from_url(source_url),
            source_url,
            0.0,
            "low",
            None,
        ),
    )
    db.commit()

    row = db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=500, detail="Imported job could not be loaded")
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
