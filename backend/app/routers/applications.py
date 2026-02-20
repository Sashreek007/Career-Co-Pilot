import json
import sqlite3
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db.database import get_db

router = APIRouter(prefix="", tags=["applications"])

ALLOWED_STATUSES = {
    "drafted",
    "approved",
    "submitted",
    "interview",
    "offer",
    "rejected",
}
JSON_COLUMNS = {"form_structure_json", "filled_answers_json", "screening_answers_json"}


class CreateApplicationRequest(BaseModel):
    job_id: str
    resume_version_id: str | None = None


class UpdateApplicationStatusRequest(BaseModel):
    status: str


def db_conn():
    conn = get_db()
    try:
        yield conn
    finally:
        conn.close()


def _row_to_application(row: sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    for col in JSON_COLUMNS:
        value = item.get(col)
        if isinstance(value, str):
            try:
                item[col] = json.loads(value)
            except json.JSONDecodeError:
                pass
    return item


@router.get("/applications")
def get_applications(db: sqlite3.Connection = Depends(db_conn)):
    rows = db.execute(
        """
        SELECT
            a.*,
            j.title AS job_title,
            j.company AS company
        FROM application_drafts a
        LEFT JOIN jobs j ON j.id = a.job_id
        ORDER BY a.created_at DESC
        """
    ).fetchall()
    return [_row_to_application(row) for row in rows]


@router.get("/applications/{draft_id}")
def get_application(draft_id: str, db: sqlite3.Connection = Depends(db_conn)):
    row = db.execute(
        """
        SELECT
            a.*,
            j.title AS job_title,
            j.company AS company
        FROM application_drafts a
        LEFT JOIN jobs j ON j.id = a.job_id
        WHERE a.id = ?
        """,
        (draft_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Application draft not found")
    return _row_to_application(row)


@router.post("/applications")
def create_application(payload: CreateApplicationRequest, db: sqlite3.Connection = Depends(db_conn)):
    job_exists = db.execute(
        "SELECT 1 FROM jobs WHERE id = ? AND is_archived = 0",
        (payload.job_id,),
    ).fetchone()
    if job_exists is None:
        raise HTTPException(status_code=404, detail="Job not found")

    if payload.resume_version_id:
        resume_exists = db.execute(
            "SELECT 1 FROM resume_versions WHERE id = ?",
            (payload.resume_version_id,),
        ).fetchone()
        if resume_exists is None:
            raise HTTPException(status_code=404, detail="Resume version not found")

    draft_id = f"app-{uuid4().hex[:8]}"
    db.execute(
        """
        INSERT INTO application_drafts (id, job_id, resume_version_id, status)
        VALUES (?, ?, ?, 'drafted')
        """,
        (draft_id, payload.job_id, payload.resume_version_id),
    )
    db.commit()
    return get_application(draft_id, db)


@router.patch("/applications/{draft_id}/status")
def update_application_status(
    draft_id: str,
    payload: UpdateApplicationStatusRequest,
    db: sqlite3.Connection = Depends(db_conn),
):
    if payload.status not in ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")

    result = db.execute(
        "UPDATE application_drafts SET status = ? WHERE id = ?",
        (payload.status, draft_id),
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Application draft not found")
    return get_application(draft_id, db)
