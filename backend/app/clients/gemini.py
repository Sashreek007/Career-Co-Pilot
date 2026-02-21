"""Thin wrapper around the Google Generative AI SDK (Gemini)."""

import logging
import os
import sqlite3
from typing import Optional

from ..db.database import DB_PATH

logger = logging.getLogger(__name__)

_client = None  # module-level cache
_client_api_key: str | None = None


def _read_api_key_from_settings() -> str | None:
    conn: sqlite3.Connection | None = None
    try:
        conn = sqlite3.connect(DB_PATH)
        row = conn.execute(
            "SELECT llm_provider, llm_api_key FROM settings WHERE id = 1"
        ).fetchone()
        if row is None:
            return None

        provider, key = row
        provider_value = str(provider or "").strip().lower()
        key_value = str(key or "").strip()
        if provider_value and provider_value != "gemini":
            return None
        return key_value or None
    except sqlite3.Error:
        return None
    finally:
        if conn is not None:
            conn.close()


def _resolve_api_key() -> str | None:
    env_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if env_key:
        return env_key
    return _read_api_key_from_settings()


def get_gemini_client() -> Optional[object]:
    """Return a configured ``GenerativeModel('gemini-1.5-flash')`` instance.

    The API key is read from the ``GEMINI_API_KEY`` environment variable.
    If the key is not set the function logs a warning and returns ``None``.
    All callers **must** handle a ``None`` return gracefully (fall back to
    rule-based logic).
    """
    global _client, _client_api_key  # noqa: PLW0603

    api_key = _resolve_api_key()
    if not api_key:
        _client = None
        _client_api_key = None
        logger.warning(
            "GEMINI_API_KEY is not set — Gemini features will be disabled. "
            "Set the key in your environment or in Settings."
        )
        return None

    if _client is not None and _client_api_key == api_key:
        return _client

    try:
        import google.generativeai as genai  # type: ignore[import-untyped]

        genai.configure(api_key=api_key)
        _client = genai.GenerativeModel("gemini-1.5-flash")
        _client_api_key = api_key
        logger.info("Gemini client initialised (model=gemini-1.5-flash)")
        return _client
    except Exception:
        _client = None
        _client_api_key = None
        logger.exception("Failed to initialise Gemini client")
        return None
