"""Resume API router — generate, list, get, and delete resume versions."""

import json
import sqlite3
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from ..db.database import get_db
from ..engines.resume.compiler import compile_resume

router = APIRouter(prefix="", tags=["resumes"])


def db_conn():
    conn = get_db()
    try:
        yield conn
    finally:
        conn.close()


class GenerateRequest(BaseModel):
    job_id: str


def _row_to_resume(row: sqlite3.Row) -> dict[str, Any]:
    resume = dict(row)
    raw = resume.get("content_json")
    if isinstance(raw, str):
        try:
            resume["content_json"] = json.loads(raw)
        except json.JSONDecodeError:
            pass
    return resume


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.post("/resumes/generate")
async def generate_resume(
    body: GenerateRequest,
    db: sqlite3.Connection = Depends(db_conn),
):
    """Trigger resume generation for the given job."""
    try:
        result = await compile_resume(body.job_id, db)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/resumes")
def list_resumes(db: sqlite3.Connection = Depends(db_conn)):
    """Return all resume versions, newest first."""
    rows = db.execute(
        "SELECT * FROM resume_versions ORDER BY created_at DESC"
    ).fetchall()
    return [_row_to_resume(row) for row in rows]


@router.get("/resumes/{resume_id}")
def get_resume(resume_id: str, db: sqlite3.Connection = Depends(db_conn)):
    """Return a single resume version by ID."""
    row = db.execute(
        "SELECT * FROM resume_versions WHERE id = ?",
        (resume_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Resume not found")
    return _row_to_resume(row)


@router.delete("/resumes/{resume_id}")
def delete_resume(resume_id: str, db: sqlite3.Connection = Depends(db_conn)):
    """Hard-delete a resume version (they are regeneratable)."""
    result = db.execute(
        "DELETE FROM resume_versions WHERE id = ?",
        (resume_id,),
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Resume not found")
    return {"ok": True, "deleted_id": resume_id}
