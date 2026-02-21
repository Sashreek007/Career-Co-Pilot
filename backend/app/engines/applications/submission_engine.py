import asyncio
import json
import logging
import os
import random
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

from playwright.async_api import async_playwright

from ...clients.gemini import get_gemini_client

logger = logging.getLogger(__name__)

SCREENSHOT_DIR = Path(__file__).resolve().parents[3] / "data" / "screenshots"
AI_AGENT_MAX_TURNS = 3
AI_AGENT_MAX_ACTIONS_PER_TURN = 6
AI_AGENT_MAX_CONTROLS = 120


class RateLimitError(ValueError):
    """Raised when daily submission cap is reached."""


class BrowserUnavailableError(RuntimeError):
    """Raised when Playwright browser runtime is unavailable."""


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


def _normalize_space(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _strip_code_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        text = text.rsplit("```", 1)[0]
    return text.strip()


def _summarize_answer_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, dict):
        if "resume_file_path" in value:
            return "[FILE_PATH]"
        return "[OBJECT]"
    return _normalize_space(value)


def _build_answer_targets(form_fields: list[dict[str, Any]], answers: dict[str, Any]) -> list[dict[str, str]]:
    targets: list[dict[str, str]] = []
    for field in form_fields:
        label = _normalize_space(field.get("label"))
        if not label:
            continue
        value = answers.get(label)
        if value is None:
            continue
        if isinstance(value, str) and value.startswith("[REQUIRES_REVIEW:"):
            continue

        field_type = _normalize_space(field.get("type")).lower() or "text"
        if field_type == "file":
            continue
        targets.append(
            {
                "label": label,
                "type": field_type,
                "value": _summarize_answer_value(value),
            }
        )
    return targets


async def _snapshot_form_controls(page) -> list[dict[str, Any]]:
    try:
        controls = await page.evaluate(
            """
            () => {
              const rows = [];
              const nodes = Array.from(document.querySelectorAll('input, textarea, select, button, [role="button"]'));
              for (const el of nodes) {
                const tag = (el.tagName || '').toLowerCase();
                const type = (el.getAttribute('type') || '').toLowerCase();
                if (tag === 'input' && ['hidden', 'submit', 'reset', 'button', 'image'].includes(type)) continue;

                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) continue;

                const id = el.getAttribute('id');
                let label = '';
                if (id) {
                  const bound = document.querySelector(`label[for="${id}"]`);
                  if (bound) label = bound.textContent || '';
                }
                if (!label) {
                  const parentLabel = el.closest('label');
                  if (parentLabel) label = parentLabel.textContent || '';
                }
                if (!label) {
                  label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || '';
                }

                const text = tag === 'button' || el.getAttribute('role') === 'button'
                  ? (el.textContent || '')
                  : '';

                rows.push({
                  tag,
                  type,
                  label: (label || '').replace(/\\s+/g, ' ').trim(),
                  text: (text || '').replace(/\\s+/g, ' ').trim(),
                  required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true'
                });
                if (rows.length >= 150) break;
              }
              return rows;
            }
            """
        )
        if isinstance(controls, list):
            return [item for item in controls if isinstance(item, dict)][:AI_AGENT_MAX_CONTROLS]
        return []
    except Exception:
        logger.debug("Failed to snapshot form controls for AI agent", exc_info=True)
        return []


def _sanitize_ai_actions(raw_payload: Any) -> list[dict[str, Any]]:
    if isinstance(raw_payload, dict):
        raw_actions = raw_payload.get("actions")
    elif isinstance(raw_payload, list):
        raw_actions = raw_payload
    else:
        raw_actions = []

    if not isinstance(raw_actions, list):
        return []

    allowed = {"fill", "select", "check", "uncheck", "click_button", "wait"}
    actions: list[dict[str, Any]] = []
    for item in raw_actions:
        if not isinstance(item, dict):
            continue
        action_type = _normalize_space(item.get("type")).lower()
        if action_type not in allowed:
            continue

        action: dict[str, Any] = {"type": action_type}
        if action_type == "click_button":
            button_text = _normalize_space(item.get("button_text") or item.get("text"))
            if not button_text:
                continue
            action["button_text"] = button_text
        elif action_type == "wait":
            try:
                ms = int(item.get("milliseconds", 900))
            except (TypeError, ValueError):
                ms = 900
            action["milliseconds"] = max(200, min(ms, 5000))
        else:
            label = _normalize_space(item.get("label"))
            if not label:
                continue
            action["label"] = label
            if action_type in {"fill", "select"}:
                action["value"] = _summarize_answer_value(item.get("value"))
        actions.append(action)
        if len(actions) >= AI_AGENT_MAX_ACTIONS_PER_TURN:
            break
    return actions


async def _plan_ai_actions(
    client: Any,
    page,
    *,
    job: dict[str, Any],
    answer_targets: list[dict[str, str]],
    turn: int,
    allow_submit_click: bool,
) -> list[dict[str, Any]]:
    controls = await _snapshot_form_controls(page)
    if not controls or not answer_targets:
        return []

    prompt = (
        "You are an assistant controlling a job-application form in user-assisted mode.\n"
        "Choose the next browser actions as JSON only.\n"
        "Output format: {\"actions\":[...]}.\n"
        "Allowed action types: fill, select, check, uncheck, click_button, wait.\n"
        "Rules:\n"
        "- Prefer filling known answers by matching labels.\n"
        "- Use click_button for navigation only (Next, Continue, Review).\n"
        "- Never invent new answer values.\n"
        "- Keep actions concise and practical.\n"
        f"- Final submit clicks allowed: {str(allow_submit_click).lower()}.\n\n"
        f"Job context: {json.dumps({'title': job.get('title'), 'company': job.get('company')})}\n"
        f"Known answers: {json.dumps(answer_targets)}\n"
        f"Visible controls (turn {turn}): {json.dumps(controls)}\n"
    )

    try:
        response = await client.generate_content_async(prompt)
        raw = _strip_code_fences(_normalize_space(response.text))
        if not raw:
            return []
        parsed = json.loads(raw)
        actions = _sanitize_ai_actions(parsed)
        if not allow_submit_click:
            actions = [
                action
                for action in actions
                if not (
                    action.get("type") == "click_button"
                    and re.search(r"submit|apply|send", str(action.get("button_text") or ""), re.IGNORECASE)
                )
            ]
        return actions
    except Exception:
        logger.debug("AI planning step failed", exc_info=True)
        return []


async def _execute_ai_action(page, action: dict[str, Any], *, allow_submit_click: bool) -> bool:
    action_type = str(action.get("type") or "").strip().lower()
    try:
        if action_type == "wait":
            ms = int(action.get("milliseconds", 900))
            await page.wait_for_timeout(max(200, min(ms, 5000)))
            return True

        if action_type == "click_button":
            button_text = _normalize_space(action.get("button_text"))
            if not button_text:
                return False
            if not allow_submit_click and re.search(r"submit|apply|send", button_text, re.IGNORECASE):
                return False

            locator = page.get_by_role("button", name=re.compile(re.escape(button_text), re.IGNORECASE)).first
            if await locator.count() == 0:
                locator = page.get_by_text(button_text, exact=False).first
            if await locator.count() == 0:
                return False
            await locator.scroll_into_view_if_needed()
            await locator.click()
            return True

        label = _normalize_space(action.get("label"))
        if not label:
            return False
        locator = page.get_by_label(label, exact=False).first
        if await locator.count() == 0 and action_type == "fill":
            locator = page.get_by_placeholder(label, exact=False).first
        if await locator.count() == 0:
            return False

        await locator.scroll_into_view_if_needed()

        if action_type == "fill":
            await locator.fill(str(action.get("value") or ""))
            return True
        if action_type == "select":
            value = str(action.get("value") or "").strip()
            if not value:
                return False
            try:
                await locator.select_option(label=value)
            except Exception:
                await locator.select_option(value=value)
            return True
        if action_type == "check":
            await locator.check()
            return True
        if action_type == "uncheck":
            await locator.uncheck()
            return True
    except Exception:
        logger.debug("AI action execution failed: %s", action, exc_info=True)
        return False
    return False


async def _run_ai_assisted_fill(
    page,
    *,
    job: dict[str, Any],
    form_fields: list[dict[str, Any]],
    answers: dict[str, Any],
    allow_submit_click: bool = False,
) -> None:
    client = get_gemini_client()
    if client is None:
        return

    answer_targets = _build_answer_targets(form_fields, answers)
    if not answer_targets:
        return

    logger.info("Running AI-assisted apply operator for %s @ %s", job.get("title"), job.get("company"))
    seen_actions: set[str] = set()

    for turn in range(1, AI_AGENT_MAX_TURNS + 1):
        actions = await _plan_ai_actions(
            client,
            page,
            job=job,
            answer_targets=answer_targets,
            turn=turn,
            allow_submit_click=allow_submit_click,
        )
        if not actions:
            return

        executed = 0
        for action in actions:
            signature = json.dumps(action, sort_keys=True)
            if signature in seen_actions:
                continue
            seen_actions.add(signature)

            ok = await _execute_ai_action(page, action, allow_submit_click=allow_submit_click)
            if ok:
                executed += 1
                await asyncio.sleep(random.uniform(0.2, 0.8))

        if executed == 0:
            return

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


def _should_launch_headless() -> bool:
    value = os.environ.get("APPLICATION_BROWSER_HEADLESS", "").strip().lower()
    if value in {"1", "true", "yes"}:
        return True
    if value in {"0", "false", "no"}:
        return False
    return not bool(os.environ.get("DISPLAY", "").strip())


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
        try:
            browser = await playwright.chromium.launch(headless=_should_launch_headless())
        except Exception as exc:
            message = str(exc)
            if "Executable doesn't exist" in message:
                raise BrowserUnavailableError(
                    "Playwright Chromium is missing in backend container. Rebuild backend image."
                ) from exc
            if "Missing X server" in message or "missing x server" in message.lower():
                raise BrowserUnavailableError(
                    "Headed browser launch is unavailable in this environment. "
                    "Set APPLICATION_BROWSER_HEADLESS=true."
                ) from exc
            raise
        context = await browser.new_context()
        page = await context.new_page()
        await page.goto(job_url, wait_until="networkidle")

        await _fill_known_fields(page, form_fields, filled_answers)
        await _run_ai_assisted_fill(
            page,
            job=job,
            form_fields=form_fields,
            answers=filled_answers,
            allow_submit_click=False,
        )
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
