import asyncio
import json
import logging
import random
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from playwright.async_api import async_playwright

logger = logging.getLogger(__name__)

SCREENSHOT_DIR = Path(__file__).resolve().parents[3] / "data" / "screenshots"


class RateLimitError(ValueError):
    """Raised when daily submission cap is reached."""


def _parse_json_obj(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _parse_json_list(raw: Any) -> list[dict[str, Any]]:
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return [item for item in parsed if isinstance(item, dict)] if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


def _load_draft_and_job(draft_id: str, db_conn: sqlite3.Connection) -> tuple[dict[str, Any], dict[str, Any]]:
    row = db_conn.execute(
        """
        SELECT
            a.*,
            j.id AS job_id_joined,
            j.source_url AS job_source_url,
            j.title AS job_title,
            j.company AS job_company
        FROM application_drafts a
        JOIN jobs j ON j.id = a.job_id
        WHERE a.id = ?
        """,
        (draft_id,),
    ).fetchone()
    if row is None:
        raise ValueError("Application draft not found")

    draft = dict(row)
    job = {
        "id": draft.get("job_id_joined"),
        "source_url": draft.get("job_source_url"),
        "title": draft.get("job_title"),
        "company": draft.get("job_company"),
    }
    return draft, job


def _get_daily_cap(db_conn: sqlite3.Connection) -> int:
    row = db_conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='settings'"
    ).fetchone()
    if row is None:
        return 10

    try:
        candidate = db_conn.execute("SELECT daily_submission_cap FROM settings LIMIT 1").fetchone()
    except sqlite3.Error:
        return 10
    if not candidate:
        return 10
    try:
        value = int(candidate[0])
    except (TypeError, ValueError):
        return 10
    return value if value > 0 else 10


def _assert_daily_cap(db_conn: sqlite3.Connection) -> None:
    daily_cap = _get_daily_cap(db_conn)
    count = db_conn.execute(
        """
        SELECT COUNT(*) FROM application_drafts
        WHERE submitted_at IS NOT NULL
          AND date(submitted_at) = date('now')
        """
    ).fetchone()[0]
    if int(count or 0) >= daily_cap:
        raise RateLimitError(f"Daily submission cap reached ({daily_cap})")


def _assert_can_submit(draft: dict[str, Any]) -> None:
    if draft.get("status") != "approved":
        raise ValueError("Draft must be approved before submission")


async def _fill_known_fields(
    page, form_fields: list[dict[str, Any]], answers: dict[str, Any]
) -> None:
    for field in form_fields:
        label = str(field.get("label") or "").strip()
        if not label:
            continue

        value = answers.get(label)
        if value is None:
            continue
        if isinstance(value, str) and value.startswith("[REQUIRES_REVIEW:"):
            raise ValueError(f"Draft still has unresolved review placeholders ({label})")

        field_type = str(field.get("type") or "").lower()
        await asyncio.sleep(random.uniform(0.3, 1.2))

        try:
            locator = page.get_by_label(label, exact=False).first
            await locator.scroll_into_view_if_needed()
            if field_type == "dropdown":
                await locator.select_option(label=str(value))
            elif field_type == "checkbox":
                if bool(value):
                    await locator.check()
                else:
                    await locator.uncheck()
            elif field_type == "file":
                if isinstance(value, dict):
                    file_path = value.get("resume_file_path")
                    if file_path and Path(file_path).exists():
                        await locator.set_input_files(file_path)
            else:
                await locator.fill(str(value))
        except Exception:
            logger.warning("Skipping unfillable field label=%s", label)


async def _click_submit_button(page) -> None:
    submit_btn = page.get_by_role("button", name=re.compile("submit|apply|send", re.IGNORECASE)).first
    if await submit_btn.count() == 0:
        raise ValueError("Could not find submit button for final confirmation")
    await submit_btn.click()


async def _run_submission(
    draft_id: str,
    db_conn: sqlite3.Connection,
    *,
    click_submit: bool,
) -> dict[str, Any]:
    draft, job = _load_draft_and_job(draft_id, db_conn)
    _assert_can_submit(draft)
    _assert_daily_cap(db_conn)

    job_url = str(job.get("source_url") or "").strip()
    if not job_url:
        raise ValueError("Job source URL is required for submission")

    form_fields = _parse_json_list(draft.get("form_structure_json"))
    filled_answers = _parse_json_obj(draft.get("filled_answers_json"))

    playwright = None
    browser = None
    context = None
    page = None
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    screenshot_path = SCREENSHOT_DIR / f"{draft_id}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.png"

    try:
        playwright = await async_playwright().start()
        browser = await playwright.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        await page.goto(job_url, wait_until="networkidle")

        await _fill_known_fields(page, form_fields, filled_answers)
        await page.screenshot(path=str(screenshot_path), full_page=True)

        if click_submit:
            await _click_submit_button(page)
            return {"status": "submitted", "screenshot_path": str(screenshot_path)}

        return {"status": "ready_for_final_approval", "screenshot_path": str(screenshot_path)}
    except Exception:
        logger.exception("Submission engine failed for draft_id=%s", draft_id)
        raise
    finally:
        if page is not None:
            await page.close()
        if context is not None:
            await context.close()
        if browser is not None:
            await browser.close()
        if playwright is not None:
            await playwright.stop()


async def submit_application(draft_id: str, db_conn: sqlite3.Connection) -> dict[str, Any]:
    return await _run_submission(draft_id, db_conn, click_submit=False)


async def confirm_submit_application(draft_id: str, db_conn: sqlite3.Connection) -> dict[str, Any]:
    return await _run_submission(draft_id, db_conn, click_submit=True)
