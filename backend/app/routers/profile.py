from datetime import datetime
import json
import sqlite3
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..db.database import get_db

router = APIRouter(prefix="", tags=["profile"])

JSON_COLUMNS = {
    "skills_json",
    "experience_json",
    "projects_json",
    "certifications_json",
    "role_interests_json",
}
PROFILE_COLUMNS = {
    "id",
    "name",
    "email",
    "phone",
    "location",
    "linkedin_url",
    "github_url",
    "summary",
    "skills_json",
    "experience_json",
    "projects_json",
    "certifications_json",
    "role_interests_json",
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
    return profile


@router.get("/profile")
def get_profile(db: sqlite3.Connection = Depends(db_conn)):
    row = db.execute("SELECT * FROM user_profile WHERE id = 'local'").fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return _row_to_profile(row)


@router.put("/profile")
def upsert_profile(payload: dict[str, Any], db: sqlite3.Connection = Depends(db_conn)):
    data = {k: v for k, v in payload.items() if k in PROFILE_COLUMNS}
    data["id"] = str(data.get("id", "local"))
    data["updated_at"] = datetime.utcnow().isoformat()

    for col in JSON_COLUMNS:
        if col in data and data[col] is not None and not isinstance(data[col], str):
            data[col] = json.dumps(data[col])

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
