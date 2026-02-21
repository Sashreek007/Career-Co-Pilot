from datetime import datetime
import json
import sqlite3
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from ..db.database import get_db
from ..engines.profile.resume_ingestion import (
    extract_resume_data,
    merge_resume_into_profile,
    save_resume_file,
)

router = APIRouter(prefix="", tags=["profile"])

JSON_COLUMNS = {
    "skills_json",
    "experience_json",
    "projects_json",
    "certifications_json",
    "role_interests_json",
    "resume_parsed_json",
}
PROFILE_COLUMNS = {
    "id",
    "name",
    "email",
    "phone",
    "location",
    "linkedin_url",
    "github_url",
    "portfolio_url",
    "summary",
    "skills_json",
    "experience_json",
    "projects_json",
    "certifications_json",
    "role_interests_json",
    "resume_file_name",
    "resume_file_path",
    "resume_uploaded_at",
    "resume_text",
    "resume_parsed_json",
    "updated_at",
}


def db_conn():
    conn = get_db()
    try:
        yield conn
    finally:
        conn.close()


def _row_to_profile(row: sqlite3.Row) -> dict[str, Any]:
    profile = dict(row)
    for col in JSON_COLUMNS:
        value = profile.get(col)
        if isinstance(value, str):
            try:
                profile[col] = json.loads(value)
            except json.JSONDecodeError:
                pass
    parsed_resume = profile.get("resume_parsed_json")
    if isinstance(parsed_resume, dict):
        parsed_resume.pop("raw_text", None)
    profile.pop("resume_text", None)
    profile.pop("resume_file_path", None)
    return profile


def _upsert_profile_row(data: dict[str, Any], db: sqlite3.Connection) -> dict[str, Any]:
    columns = list(data.keys())
    placeholders = ", ".join("?" for _ in columns)
    update_expr = ", ".join(f"{col} = excluded.{col}" for col in columns if col != "id")
    db.execute(
        f"""
        INSERT INTO user_profile ({", ".join(columns)})
        VALUES ({placeholders})
        ON CONFLICT(id) DO UPDATE SET {update_expr}
        """,
        tuple(data[col] for col in columns),
    )
    db.commit()
    row = db.execute("SELECT * FROM user_profile WHERE id = ?", (data["id"],)).fetchone()
    if row is None:
        raise HTTPException(status_code=500, detail="Failed to fetch updated profile")
    return _row_to_profile(row)


@router.get("/profile")
def get_profile(db: sqlite3.Connection = Depends(db_conn)):
    row = db.execute("SELECT * FROM user_profile WHERE id = 'local'").fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return _row_to_profile(row)


@router.put("/profile")
def upsert_profile(payload: dict[str, Any], db: sqlite3.Connection = Depends(db_conn)):
    data = {k: v for k, v in payload.items() if k in PROFILE_COLUMNS}
    data["id"] = "local"
    data["updated_at"] = datetime.utcnow().isoformat()

    for col in JSON_COLUMNS:
        if col in data and data[col] is not None and not isinstance(data[col], str):
            data[col] = json.dumps(data[col])

    return _upsert_profile_row(data, db)


@router.post("/profile/resume")
async def upload_resume(file: UploadFile = File(...), db: sqlite3.Connection = Depends(db_conn)):
    file_name = str(file.filename or "").strip()
    if not file_name:
        raise HTTPException(status_code=400, detail="Resume file name is required")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Resume file is empty")

    try:
        parsed = extract_resume_data(file_name, file.content_type, raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    stored = save_resume_file("local", file_name, raw)
    existing_row = db.execute("SELECT * FROM user_profile WHERE id = 'local'").fetchone()
    existing = dict(existing_row) if existing_row is not None else {"id": "local"}

    updates, extracted = merge_resume_into_profile(
        existing_profile=existing,
        parsed_resume=parsed,
        stored_file_name=stored["file_name"],
        stored_file_path=stored["file_path"],
    )

    data = {
        **{k: v for k, v in existing.items() if k in PROFILE_COLUMNS},
        **{k: v for k, v in updates.items() if k in PROFILE_COLUMNS},
        "id": "local",
        "updated_at": datetime.utcnow().isoformat(),
    }
    for col in JSON_COLUMNS:
        if col in data and data[col] is not None and not isinstance(data[col], str):
            data[col] = json.dumps(data[col])

    profile = _upsert_profile_row(data, db)
    return {"profile": profile, "extracted": extracted}
