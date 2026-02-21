import asyncio
import json
import logging
import os
import random
import re
import sqlite3
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any

from playwright.async_api import async_playwright

from ...clients.gemini import get_gemini_client
from ..browser_cdp import (
    get_chrome_executable_path,
    get_chrome_user_profile_dir,
    load_browser_storage_state,
    normalize_cdp_endpoint,
    save_browser_storage_state,
)

logger = logging.getLogger(__name__)

SCREENSHOT_DIR = Path(__file__).resolve().parents[3] / "data" / "screenshots"
AI_AGENT_MAX_TURNS = 3
AI_AGENT_MAX_ACTIONS_PER_TURN = 6
AI_AGENT_MAX_CONTROLS = 120
PROGRESS_EVENT_LIMIT = 160

_PROGRESS_LOCK = Lock()
_SUBMISSION_PROGRESS: dict[str, dict[str, Any]] = {}
_OPERATOR_GUIDANCE: dict[str, str] = {}

# --- Chat message store ---
# Each draft has a list of {"role": "ai"|"user", "text": str, "at": ISO str}
_CHAT_MESSAGES: dict[str, list[dict[str, str]]] = {}
_CHAT_LOCK = Lock()
CHAT_MESSAGE_LIMIT = 200


def _chat_push_ai(draft_id: str, text: str) -> None:
    """Push an AI message into the chat thread for this draft."""
    normalized = _normalize_space(text)
    if not normalized:
        return
    with _CHAT_LOCK:
        msgs = _CHAT_MESSAGES.setdefault(draft_id, [])
        msgs.append({"role": "ai", "text": normalized, "at": _utc_now_iso()})
        if len(msgs) > CHAT_MESSAGE_LIMIT:
            del msgs[: len(msgs) - CHAT_MESSAGE_LIMIT]


def get_chat_messages(draft_id: str) -> list[dict[str, str]]:
    """Return the full chat thread for this draft (safe copy)."""
    with _CHAT_LOCK:
        return list(_CHAT_MESSAGES.get(draft_id, []))


def post_user_chat_message(draft_id: str, text: str) -> str:
    """
    Append a user message to the chat thread and apply it as operator guidance.
    Returns the normalized text.
    """
    normalized = _normalize_space(text)[:1200]
    if not normalized:
        return ""
    with _CHAT_LOCK:
        msgs = _CHAT_MESSAGES.setdefault(draft_id, [])
        msgs.append({"role": "user", "text": normalized, "at": _utc_now_iso()})
        if len(msgs) > CHAT_MESSAGE_LIMIT:
            del msgs[: len(msgs) - CHAT_MESSAGE_LIMIT]
    # Also feed it into the operator guidance so the running agent picks it up
    set_submission_guidance(draft_id, normalized)
    return normalized


def clear_chat_messages(draft_id: str) -> None:
    with _CHAT_LOCK:
        _CHAT_MESSAGES.pop(draft_id, None)


class RateLimitError(ValueError):
    """Raised when daily submission cap is reached."""


class BrowserUnavailableError(RuntimeError):
    """Raised when Playwright browser runtime is unavailable."""


def _utc_now_iso() -> str:
    return datetime.utcnow().isoformat()


def _progress_start(draft_id: str, *, mode: str) -> None:
    clear_chat_messages(draft_id)
    with _PROGRESS_LOCK:
        _SUBMISSION_PROGRESS[draft_id] = {
            "draft_id": draft_id,
            "status": "running",
            "mode": mode,
            "started_at": _utc_now_iso(),
            "updated_at": _utc_now_iso(),
            "latest_screenshot_path": None,
            "events": [],
            "error": None,
        }
    _chat_push_ai(draft_id, f"Starting AI-assisted application ({mode} mode). I'll let you know when I need input.")


def _progress_event(draft_id: str, message: str, *, level: str = "info") -> None:
    text = _normalize_space(message)
    if not text:
        return
    with _PROGRESS_LOCK:
        state = _SUBMISSION_PROGRESS.get(draft_id)
        if state is None:
            state = {
                "draft_id": draft_id,
                "status": "running",
                "mode": "unknown",
                "started_at": _utc_now_iso(),
                "updated_at": _utc_now_iso(),
                "latest_screenshot_path": None,
                "events": [],
                "error": None,
            }
            _SUBMISSION_PROGRESS[draft_id] = state

        events = state.get("events", [])
        if not isinstance(events, list):
            events = []
            state["events"] = events
        events.append({"at": _utc_now_iso(), "level": level, "message": text})
        if len(events) > PROGRESS_EVENT_LIMIT:
            del events[: len(events) - PROGRESS_EVENT_LIMIT]
        state["updated_at"] = _utc_now_iso()


def _progress_snapshot(draft_id: str, screenshot_path: str | None) -> None:
    if not screenshot_path:
        return
    with _PROGRESS_LOCK:
        state = _SUBMISSION_PROGRESS.get(draft_id)
        if state is None:
            return
        state["latest_screenshot_path"] = screenshot_path
        state["updated_at"] = _utc_now_iso()


def _progress_mode(draft_id: str, mode: str) -> None:
    with _PROGRESS_LOCK:
        state = _SUBMISSION_PROGRESS.get(draft_id)
        if state is None:
            return
        state["mode"] = mode
        state["updated_at"] = _utc_now_iso()


def _progress_finish(draft_id: str, *, status: str, error: str | None = None) -> None:
    with _PROGRESS_LOCK:
        state = _SUBMISSION_PROGRESS.get(draft_id)
        if state is None:
            state = {
                "draft_id": draft_id,
                "started_at": _utc_now_iso(),
                "mode": "unknown",
                "events": [],
            }
            _SUBMISSION_PROGRESS[draft_id] = state
        state["status"] = status
        state["error"] = _normalize_space(error) if error else None
        state["updated_at"] = _utc_now_iso()


def get_submission_progress(draft_id: str) -> dict[str, Any]:
    with _PROGRESS_LOCK:
        state = _SUBMISSION_PROGRESS.get(draft_id)
        if state is None:
            return {
                "draft_id": draft_id,
                "status": "idle",
                "mode": "none",
                "started_at": None,
                "updated_at": _utc_now_iso(),
                "latest_screenshot_path": None,
                "events": [],
                "error": None,
            }
        events = state.get("events", [])
        safe_events = [dict(item) for item in events] if isinstance(events, list) else []
        return {
            "draft_id": state.get("draft_id", draft_id),
            "status": state.get("status", "running"),
            "mode": state.get("mode", "unknown"),
            "started_at": state.get("started_at"),
            "updated_at": state.get("updated_at", _utc_now_iso()),
            "latest_screenshot_path": state.get("latest_screenshot_path"),
            "events": safe_events,
            "error": state.get("error"),
        }


def set_submission_guidance(draft_id: str, guidance: str) -> str:
    normalized = _normalize_space(guidance)[:1200]
    with _PROGRESS_LOCK:
        _OPERATOR_GUIDANCE[draft_id] = normalized
    if normalized:
        _progress_event(draft_id, f"Operator guidance updated: {normalized[:220]}")
    else:
        _progress_event(draft_id, "Operator guidance cleared.")
    return normalized


def get_submission_guidance(draft_id: str) -> str:
    with _PROGRESS_LOCK:
        return _OPERATOR_GUIDANCE.get(draft_id, "")


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


def _int_env(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(minimum, min(value, maximum))


def _submission_page_timeout_seconds() -> int:
    return _int_env("APPLICATION_PAGE_TIMEOUT_SECONDS", default=45, minimum=10, maximum=180)


def _ai_planning_timeout_seconds() -> int:
    return _int_env("APPLICATION_AI_PLANNING_TIMEOUT_SECONDS", default=12, minimum=3, maximum=45)


def _action_timeout_ms() -> int:
    return _int_env("APPLICATION_ACTION_TIMEOUT_MS", default=1500, minimum=250, maximum=10000)


def _strip_code_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else ""
        text = text.rsplit("```", 1)[0]
    return text.strip()


async def _run_hook(hook: Any, *args: Any) -> None:
    if hook is None:
        return
    try:
        result = hook(*args)
        if asyncio.iscoroutine(result):
            await result
    except Exception:
        logger.debug("Progress hook failed", exc_info=True)


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


def _describe_ai_action(action: dict[str, Any]) -> str:
    action_type = _normalize_space(action.get("type")).lower()
    if action_type == "fill":
        return f"Fill '{_normalize_space(action.get('label'))}'"
    if action_type == "select":
        return f"Select '{_normalize_space(action.get('value'))}' for '{_normalize_space(action.get('label'))}'"
    if action_type == "check":
        return f"Check '{_normalize_space(action.get('label'))}'"
    if action_type == "uncheck":
        return f"Uncheck '{_normalize_space(action.get('label'))}'"
    if action_type == "click_button":
        return f"Click button '{_normalize_space(action.get('button_text'))}'"
    if action_type == "wait":
        return f"Wait {int(action.get('milliseconds') or 0)}ms"
    return "Run AI action"


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
    operator_guidance: str = "",
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
        "- If operator guidance is provided, follow it when possible.\n"
        "- If guidance conflicts with safety rules, prefer safety rules.\n"
        "- Keep actions concise and practical.\n"
        f"- Final submit clicks allowed: {str(allow_submit_click).lower()}.\n\n"
        f"Job context: {json.dumps({'title': job.get('title'), 'company': job.get('company')})}\n"
        f"Operator guidance: {json.dumps(operator_guidance or '')}\n"
        f"Known answers: {json.dumps(answer_targets)}\n"
        f"Visible controls (turn {turn}): {json.dumps(controls)}\n"
    )

    try:
        response = await asyncio.wait_for(
            client.generate_content_async(prompt),
            timeout=_ai_planning_timeout_seconds(),
        )
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
    on_event: Any = None,
    on_action_executed: Any = None,
    guidance_provider: Any = None,
) -> None:
    client = get_gemini_client()
    if client is None:
        await _run_hook(on_event, "Gemini client unavailable; skipping AI-assisted step.")
        return

    answer_targets = _build_answer_targets(form_fields, answers)
    if not answer_targets:
        await _run_hook(on_event, "No known draft answers found for AI-assisted fill.")
        return

    logger.info("Running AI-assisted apply operator for %s @ %s", job.get("title"), job.get("company"))
    await _run_hook(on_event, "AI operator started.")
    seen_actions: set[str] = set()

    for turn in range(1, AI_AGENT_MAX_TURNS + 1):
        operator_guidance = ""
        if guidance_provider is not None:
            try:
                operator_guidance = _normalize_space(guidance_provider())
            except Exception:
                operator_guidance = ""
        actions = await _plan_ai_actions(
            client,
            page,
            job=job,
            answer_targets=answer_targets,
            turn=turn,
            allow_submit_click=allow_submit_click,
            operator_guidance=operator_guidance,
        )
        if not actions:
            await _run_hook(on_event, f"AI operator stopped: no actions planned on turn {turn}.")
            return

        await _run_hook(on_event, f"AI planned {len(actions)} actions on turn {turn}.")
        executed = 0
        for action in actions:
            signature = json.dumps(action, sort_keys=True)
            if signature in seen_actions:
                continue
            seen_actions.add(signature)

            await _run_hook(on_event, f"AI step: {_describe_ai_action(action)}")
            ok = await _execute_ai_action(page, action, allow_submit_click=allow_submit_click)
            if ok:
                executed += 1
                await _run_hook(on_action_executed, action)
                await asyncio.sleep(random.uniform(0.2, 0.8))

        if executed == 0:
            await _run_hook(on_event, f"AI operator paused: all planned actions were skipped on turn {turn}.")
            return
    await _run_hook(on_event, "AI operator finished planned turns.")

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


def _cdp_endpoint() -> str:
    value = os.environ.get("APPLICATION_CDP_ENDPOINT", "").strip()
    if value:
        return normalize_cdp_endpoint(value)
    return normalize_cdp_endpoint("http://host.docker.internal:9222")


def _normalize_manual_pause_seconds(value: int | None) -> int:
    try:
        seconds = int(value or 0)
    except (TypeError, ValueError):
        return 0
    return max(0, min(seconds, 300))


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
            if bool(field.get("required", False)):
                raise ValueError(f"Draft still has unresolved review placeholders ({label})")
            continue

        field_type = str(field.get("type") or "").lower()
        await asyncio.sleep(random.uniform(0.3, 1.2))

        try:
            locator = page.get_by_label(label, exact=False).first
            if await locator.count() == 0:
                logger.warning("Skipping unfillable field label=%s", label)
                continue
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


def _site_key_from_url(url: str) -> str:
    """Derive a per-site cookie state key from the job URL so sessions stay separate."""
    if "linkedin.com" in url:
        return "linkedin"
    if "indeed.com" in url:
        return "indeed"
    if "greenhouse.io" in url:
        return "greenhouse"
    if "lever.co" in url:
        return "lever"
    if "workday.com" in url:
        return "workday"
    return "visible_session"


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
    use_visible_browser: bool = False,
    pause_for_manual_input_seconds: int = 0,
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
    close_page = True
    close_context = True
    close_browser = True
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    screenshot_path = SCREENSHOT_DIR / f"{draft_id}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.png"
    live_screenshot_path = SCREENSHOT_DIR / f"{draft_id}-live.png"
    manual_pause_seconds = _normalize_manual_pause_seconds(pause_for_manual_input_seconds)
    run_mode = "visible_browser_cdp" if use_visible_browser else ("headless" if _should_launch_headless() else "headed")
    _progress_start(draft_id, mode=run_mode)
    set_submission_guidance(draft_id, "")
    _progress_event(draft_id, f"Starting operator in {run_mode} mode.")

    # Derive site-specific state key so linkedin/indeed/greenhouse cookies stay separate
    _site_state_key = _site_key_from_url(job_url)

    async def _restore_visible_state() -> None:
        if context is None:
            return
        state = load_browser_storage_state(_site_state_key)
        cookies = state.get("cookies")
        if isinstance(cookies, list) and cookies:
            try:
                await context.add_cookies(cookies)
                _progress_event(draft_id, f"Loaded persisted {_site_state_key} login state.")
            except Exception:
                logger.debug("Could not restore persisted browser state", exc_info=True)

    async def _persist_visible_state() -> None:
        if context is None:
            return
        try:
            cookies = await context.cookies()
            if isinstance(cookies, list):
                save_browser_storage_state({"cookies": cookies}, _site_state_key)
                _progress_event(draft_id, f"Persisted {_site_state_key} login cookies.")
        except Exception:
            logger.debug("Could not persist visible browser state", exc_info=True)

    async def _capture_live_screenshot(label: str) -> None:
        if page is None:
            return
        try:
            await page.screenshot(path=str(live_screenshot_path), full_page=True)
            _progress_snapshot(draft_id, str(live_screenshot_path))
            _progress_event(draft_id, f"Captured browser snapshot ({label}).")
        except Exception:
            logger.debug("Live screenshot capture failed for %s", draft_id, exc_info=True)

    try:
        playwright = await async_playwright().start()
        if use_visible_browser:
            cdp_endpoint = _cdp_endpoint()
            _progress_event(draft_id, f"Connecting to your Chrome browser via CDP ({cdp_endpoint}).")
            try:
                browser = await playwright.chromium.connect_over_cdp(cdp_endpoint)
            except Exception as cdp_exc:
                raise BrowserUnavailableError(
                    f"Could not connect to your Chrome browser at {cdp_endpoint}. "
                    "Start Chrome with remote debugging enabled:\n"
                    "  macOS/Linux: google-chrome --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --no-first-run\n"
                    "  Windows:     chrome.exe --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0\n"
                    "If backend runs in Docker, set APPLICATION_CDP_ENDPOINT=http://host.docker.internal:9222. "
                    "If backend runs on your host directly, set APPLICATION_CDP_ENDPOINT=http://localhost:9222."
                ) from cdp_exc

            close_browser = False
            if browser.contexts:
                context = browser.contexts[0]
                close_context = False
                _progress_event(draft_id, "Attached to existing browser context.")
            else:
                context = await browser.new_context()
                close_context = True
                _progress_event(draft_id, "Created a new browser context.")
            await _restore_visible_state()
            page = await context.new_page()
            close_page = False
        else:
            user_data_dir = get_chrome_user_profile_dir()
            executable = get_chrome_executable_path()
            try:
                if user_data_dir:
                    # Launch with user's real Chrome profile — inherits all saved logins/sessions
                    _progress_event(draft_id, f"Launching Chrome with user profile from {user_data_dir}.")
                    launch_kwargs: dict[str, Any] = {
                        "headless": _should_launch_headless(),
                        "args": ["--no-first-run", "--no-default-browser-check", "--no-sandbox"],
                    }
                    if executable:
                        launch_kwargs["executable_path"] = executable
                    context = await playwright.chromium.launch_persistent_context(
                        user_data_dir,
                        **launch_kwargs,
                    )
                    browser = None
                    close_browser = False
                    close_context = True
                else:
                    # No Chrome profile found — use cookie injection fallback
                    _progress_event(draft_id, "No Chrome profile found; using managed Chromium with saved cookies.")
                    browser = await playwright.chromium.launch(headless=_should_launch_headless())
                    context = await browser.new_context()
                    await _restore_visible_state()
                    close_browser = True
                    close_context = True
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
            page = await context.new_page()
            close_page = True

        page.set_default_timeout(_action_timeout_ms())
        _progress_event(draft_id, "Navigating to job page.")
        await asyncio.wait_for(
            page.goto(job_url, wait_until="domcontentloaded"),
            timeout=_submission_page_timeout_seconds(),
        )
        await _capture_live_screenshot("page-loaded")

        if use_visible_browser and manual_pause_seconds > 0:
            _progress_event(
                draft_id,
                (
                    f"Waiting {manual_pause_seconds}s for manual intervention "
                    "(you can type in the browser now)."
                ),
            )
            await page.wait_for_timeout(manual_pause_seconds * 1000)
            await _capture_live_screenshot("after-manual-pause")

        _progress_event(draft_id, "Filling known draft fields.")
        await _fill_known_fields(page, form_fields, filled_answers)
        await _capture_live_screenshot("after-known-fields")
        await _run_ai_assisted_fill(
            page,
            job=job,
            form_fields=form_fields,
            answers=filled_answers,
            allow_submit_click=False,
            on_event=lambda msg: _progress_event(draft_id, msg),
            on_action_executed=lambda action: _capture_live_screenshot(
                f"action:{_describe_ai_action(action)}"
            ),
            guidance_provider=lambda: get_submission_guidance(draft_id),
        )
        _progress_event(draft_id, "AI-assisted fill stage completed.")
        await page.screenshot(path=str(screenshot_path), full_page=True)
        _progress_snapshot(draft_id, str(screenshot_path))
        _progress_event(draft_id, "Captured review screenshot for final confirmation.")

        if click_submit:
            _progress_event(draft_id, "Attempting final submit click.")
            await _click_submit_button(page)
            _progress_finish(draft_id, status="submitted")
            _chat_push_ai(draft_id, "✅ Application submitted successfully!")
            return {
                "status": "submitted",
                "screenshot_path": str(screenshot_path),
                "mode": run_mode,
            }

        _progress_finish(draft_id, status="ready_for_final_approval")
        _chat_push_ai(
            draft_id,
            "✅ I've finished filling the form. Please review the screenshot above — "
            "check that all fields look correct. When you're ready, click **Final Submit** "
            "to submit the application, or type here if anything needs fixing."
        )
        return {
            "status": "ready_for_final_approval",
            "screenshot_path": str(screenshot_path),
            "mode": run_mode,
        }
    except asyncio.TimeoutError as exc:
        _progress_event(draft_id, "Submission timed out.", level="error")
        _progress_finish(draft_id, status="failed", error="Timed out loading or operating on the job page")
        _chat_push_ai(draft_id, "❌ Timed out while loading or operating on the job page. Please try again.")
        raise ValueError("Timed out loading or operating on the job page") from exc
    except BrowserUnavailableError as exc:
        _progress_event(draft_id, str(exc), level="error")
        _progress_finish(draft_id, status="failed", error=str(exc))
        _chat_push_ai(draft_id, f"❌ Browser connection failed: {exc}")
        raise
    except Exception:
        _progress_event(draft_id, "Submission engine failed.", level="error")
        _progress_finish(draft_id, status="failed", error="Submission engine failed")
        _chat_push_ai(draft_id, "❌ Something went wrong during the application process. Check the agent log for details.")
        logger.exception("Submission engine failed for draft_id=%s", draft_id)
        raise
    finally:
        # Always persist cookies so next session reuses the login state
        await _persist_visible_state()
        if page is not None and close_page:
            await page.close()
        if context is not None and close_context:
            await context.close()
        if browser is not None and close_browser:
            await browser.close()
        if playwright is not None:
            await playwright.stop()


async def submit_application(
    draft_id: str,
    db_conn: sqlite3.Connection,
    *,
    use_visible_browser: bool = False,
    pause_for_manual_input_seconds: int = 0,
) -> dict[str, Any]:
    return await _run_submission(
        draft_id,
        db_conn,
        click_submit=False,
        use_visible_browser=use_visible_browser,
        pause_for_manual_input_seconds=pause_for_manual_input_seconds,
    )


async def confirm_submit_application(
    draft_id: str,
    db_conn: sqlite3.Connection,
    *,
    use_visible_browser: bool = False,
) -> dict[str, Any]:
    return await _run_submission(
        draft_id,
        db_conn,
        click_submit=True,
        use_visible_browser=use_visible_browser,
        pause_for_manual_input_seconds=0,
    )
