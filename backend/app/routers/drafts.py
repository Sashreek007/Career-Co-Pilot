import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db.database import get_db
from ..engines.applications.draft_generator import generate_draft_answers
from ..engines.applications.form_analyzer import analyze_form
from ..engines.applications.submission_engine import (
    BrowserUnavailableError,
    RateLimitError,
    confirm_submit_application,
    get_submission_progress,
    submit_application,
)

router = APIRouter(prefix="/drafts", tags=["drafts"])

JSON_COLUMNS = {"form_structure_json", "filled_answers_json", "screening_answers_json"}


class PrepareDraftRequest(BaseModel):
    job_id: str
    resume_version_id: str | None = None


class UpdateDraftRequest(BaseModel):
    filled_answers_json: dict[str, Any]


class AssistedFillRequest(BaseModel):
    confirm_user_assisted: bool = False
    acknowledge_platform_terms: bool = False
    use_visible_browser: bool = False
    pause_for_manual_input_seconds: int = 0


class AssistedFinalSubmitRequest(BaseModel):
    confirm_user_assisted: bool = False
    acknowledge_platform_terms: bool = False
    confirm_final_submit: bool = False
    use_visible_browser: bool = False


def db_conn():
    conn = get_db()
    try:
        yield conn
    finally:
        conn.close()


def _assert_assisted_consent(confirm_user_assisted: bool, acknowledge_platform_terms: bool) -> None:
    if not confirm_user_assisted:
        raise HTTPException(status_code=400, detail="User-assisted mode confirmation is required")
    if not acknowledge_platform_terms:
        raise HTTPException(status_code=400, detail="Platform terms acknowledgement is required")


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


def _artifact_url_for_screenshot_path(path: str | None) -> str | None:
    if not path:
        return None
    filename = Path(path).name.strip()
    if not filename:
        return None
    return f"/api/artifacts/screenshots/{quote(filename)}"


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
async def submit_draft(
    draft_id: str,
    payload: AssistedFillRequest,
    db: sqlite3.Connection = Depends(db_conn),
):
    _assert_assisted_consent(payload.confirm_user_assisted, payload.acknowledge_platform_terms)
    try:
        result = await submit_application(
            draft_id,
            db,
            use_visible_browser=payload.use_visible_browser,
            pause_for_manual_input_seconds=payload.pause_for_manual_input_seconds,
        )
        screenshot_path = result.get("screenshot_path")
        return {
            "status": result.get("status", "ready_for_final_approval"),
            "screenshot_path": screenshot_path,
            "screenshot_url": _artifact_url_for_screenshot_path(screenshot_path),
            "mode": result.get("mode"),
            "requires_explicit_final_submit": True,
        }
    except RateLimitError as err:
        raise HTTPException(status_code=429, detail=str(err)) from err
    except BrowserUnavailableError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.post("/{draft_id}/confirm-submit")
async def confirm_submit_draft(
    draft_id: str,
    payload: AssistedFinalSubmitRequest,
    db: sqlite3.Connection = Depends(db_conn),
):
    _assert_assisted_consent(payload.confirm_user_assisted, payload.acknowledge_platform_terms)
    if not payload.confirm_final_submit:
        raise HTTPException(status_code=400, detail="Final submit confirmation is required")
    try:
        result = await confirm_submit_application(
            draft_id,
            db,
            use_visible_browser=payload.use_visible_browser,
        )
    except RateLimitError as err:
        raise HTTPException(status_code=429, detail=str(err)) from err
    except BrowserUnavailableError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
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
    screenshot_path = result.get("screenshot_path")
    return {
        "status": result.get("status", "submitted"),
        "screenshot_path": screenshot_path,
        "screenshot_url": _artifact_url_for_screenshot_path(screenshot_path),
        "mode": result.get("mode"),
        "draft": draft,
    }


@router.get("/{draft_id}/progress")
def get_draft_progress(
    draft_id: str,
    db: sqlite3.Connection = Depends(db_conn),
):
    _get_draft_or_404(draft_id, db)
    progress = get_submission_progress(draft_id)
    screenshot_path = progress.get("latest_screenshot_path")
    return {
        **progress,
        "latest_screenshot_url": _artifact_url_for_screenshot_path(
            screenshot_path if isinstance(screenshot_path, str) else None
        ),
    }
