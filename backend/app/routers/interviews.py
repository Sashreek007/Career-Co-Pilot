"""Interview Kit API router — get, generate, and update interview kits."""

import json
import sqlite3
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from ..db.database import get_db
from ..engines.interviews.kit_generator import generate_interview_kit

router = APIRouter(prefix="", tags=["interviews"])


def db_conn():
    conn = get_db()
    try:
        yield conn
    finally:
        conn.close()


def _row_to_kit(row: sqlite3.Row) -> dict[str, Any]:
    """Convert a DB row into a client-friendly dict with parsed JSON."""
    kit = dict(row)
    for col in ("company_profile_json", "question_bank_json",
                "answer_drafts_json", "mock_scores_json"):
        raw = kit.get(col)
        if isinstance(raw, str):
            try:
                kit[col] = json.loads(raw)
            except json.JSONDecodeError:
                pass
    return kit


class PatchAnswersBody(BaseModel):
    answers: list[dict[str, Any]]


# ── Endpoints ─────────────────────────────────────────────────────────────

@router.get("/interviews/{application_id}")
def get_interview_kit(
    application_id: str,
    db: sqlite3.Connection = Depends(db_conn),
):
    """Return the interview kit for a given application."""
    row = db.execute(
        "SELECT * FROM interview_kits WHERE application_id = ? ORDER BY created_at DESC LIMIT 1",
        (application_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Interview kit not found")
    return _row_to_kit(row)


@router.post("/interviews/{application_id}/generate")
async def trigger_kit_generation(
    application_id: str,
    db: sqlite3.Connection = Depends(db_conn),
):
    """Manually trigger interview kit generation for an application."""
    try:
        kit = await generate_interview_kit(application_id, db)
        return kit
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.patch("/interviews/{kit_id}/answers")
def update_answers(
    kit_id: str,
    body: PatchAnswersBody,
    db: sqlite3.Connection = Depends(db_conn),
):
    """Update the answer drafts for an existing interview kit."""
    row = db.execute(
        "SELECT id FROM interview_kits WHERE id = ?",
        (kit_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Interview kit not found")

    db.execute(
        "UPDATE interview_kits SET answer_drafts_json = ? WHERE id = ?",
        (json.dumps(body.answers), kit_id),
    )
    db.commit()
    return {"ok": True, "kit_id": kit_id, "answers_count": len(body.answers)}
