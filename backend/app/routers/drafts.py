import json
import sqlite3
from datetime import datetime
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db.database import get_db
from ..engines.applications.draft_generator import generate_draft_answers
from ..engines.applications.form_analyzer import analyze_form
from ..engines.applications.submission_engine import (
    RateLimitError,
    confirm_submit_application,
    submit_application,
)

router = APIRouter(prefix="/drafts", tags=["drafts"])

JSON_COLUMNS = {"form_structure_json", "filled_answers_json", "screening_answers_json"}


class PrepareDraftRequest(BaseModel):
    job_id: str
    resume_version_id: str | None = None


class UpdateDraftRequest(BaseModel):
    filled_answers_json: dict[str, Any]


def db_conn():
    conn = get_db()
    try:
        yield conn
    finally:
        conn.close()


def _row_to_draft(row: sqlite3.Row) -> dict[str, Any]:
    item = dict(row)
    for col in JSON_COLUMNS:
        raw = item.get(col)
        if isinstance(raw, str):
            try:
                item[col] = json.loads(raw)
            except json.JSONDecodeError:
                pass
    return item


def _get_draft_or_404(draft_id: str, db: sqlite3.Connection) -> dict[str, Any]:
    row = db.execute("SELECT * FROM application_drafts WHERE id = ?", (draft_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _row_to_draft(row)


@router.post("/prepare")
async def prepare_draft(payload: PrepareDraftRequest, db: sqlite3.Connection = Depends(db_conn)):
    job = db.execute(
        "SELECT * FROM jobs WHERE id = ? AND is_archived = 0",
        (payload.job_id,),
    ).fetchone()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")

    profile = db.execute("SELECT * FROM user_profile WHERE id = 'local'").fetchone()
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")

    if payload.resume_version_id:
        resume = db.execute("SELECT id FROM resume_versions WHERE id = ?", (payload.resume_version_id,)).fetchone()
        if resume is None:
            raise HTTPException(status_code=404, detail="Resume version not found")

    job_dict = dict(job)
    profile_dict = dict(profile)

    form_fields = await analyze_form(str(job_dict.get("source_url") or ""))
    filled_answers = generate_draft_answers(job_dict, profile_dict, form_fields)

    draft_id = f"app-{uuid4().hex[:8]}"
    db.execute(
        """
        INSERT INTO application_drafts (
            id,
            job_id,
            resume_version_id,
            status,
            form_structure_json,
            filled_answers_json,
            created_at
        )
        VALUES (?, ?, ?, 'drafted', ?, ?, ?)
        """,
        (
            draft_id,
            payload.job_id,
            payload.resume_version_id,
            json.dumps(form_fields),
            json.dumps(filled_answers),
            datetime.utcnow().isoformat(),
        ),
    )
    db.commit()
    return _get_draft_or_404(draft_id, db)


@router.get("/{draft_id}")
def get_draft(draft_id: str, db: sqlite3.Connection = Depends(db_conn)):
    return _get_draft_or_404(draft_id, db)


@router.patch("/{draft_id}")
def update_draft(draft_id: str, payload: UpdateDraftRequest, db: sqlite3.Connection = Depends(db_conn)):
    result = db.execute(
        "UPDATE application_drafts SET filled_answers_json = ? WHERE id = ?",
        (json.dumps(payload.filled_answers_json), draft_id),
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _get_draft_or_404(draft_id, db)


@router.post("/{draft_id}/approve")
def approve_draft(draft_id: str, db: sqlite3.Connection = Depends(db_conn)):
    result = db.execute(
        "UPDATE application_drafts SET status = 'approved', approved_at = ? WHERE id = ?",
        (datetime.utcnow().isoformat(), draft_id),
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _get_draft_or_404(draft_id, db)


@router.post("/{draft_id}/reject")
def reject_draft(draft_id: str, db: sqlite3.Connection = Depends(db_conn)):
    result = db.execute(
        "UPDATE application_drafts SET status = 'rejected' WHERE id = ?",
        (draft_id,),
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Draft not found")
    return _get_draft_or_404(draft_id, db)


@router.post("/{draft_id}/submit")
async def submit_draft(draft_id: str, db: sqlite3.Connection = Depends(db_conn)):
    try:
        result = await submit_application(draft_id, db)
        return result
    except RateLimitError as err:
        raise HTTPException(status_code=429, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.post("/{draft_id}/confirm-submit")
async def confirm_submit_draft(draft_id: str, db: sqlite3.Connection = Depends(db_conn)):
    try:
        result = await confirm_submit_application(draft_id, db)
    except RateLimitError as err:
        raise HTTPException(status_code=429, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err

    submitted_at = datetime.utcnow().isoformat()
    db.execute(
        """
        UPDATE application_drafts
        SET status = 'submitted', submitted_at = ?
        WHERE id = ?
        """,
        (submitted_at, draft_id),
    )

    run_id = f"submission-{uuid4().hex[:10]}"
    db.execute(
        """
        INSERT INTO discovery_runs (id, started_at, completed_at, jobs_found, jobs_new, source, status)
        VALUES (?, ?, ?, 0, 0, 'submission_engine', 'submitted')
        """,
        (run_id, submitted_at, submitted_at),
    )
    db.commit()

    draft = _get_draft_or_404(draft_id, db)
    return {
        "status": result.get("status", "submitted"),
        "screenshot_path": result.get("screenshot_path"),
        "draft": draft,
    }
