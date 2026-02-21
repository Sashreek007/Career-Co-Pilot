"""Thin wrapper around the Google Generative AI SDK (Gemini)."""

import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

_client = None  # module-level cache


def get_gemini_client() -> Optional[object]:
    """Return a configured ``GenerativeModel('gemini-1.5-flash')`` instance.

    The API key is read from the ``GEMINI_API_KEY`` environment variable.
    If the key is not set the function logs a warning and returns ``None``.
    All callers **must** handle a ``None`` return gracefully (fall back to
    rule-based logic).
    """
    global _client  # noqa: PLW0603

    if _client is not None:
        return _client

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        logger.warning(
            "GEMINI_API_KEY is not set — Gemini features will be disabled. "
            "Set the key in your environment or .env file."
        )
        return None

    try:
        import google.generativeai as genai  # type: ignore[import-untyped]

        genai.configure(api_key=api_key)
        _client = genai.GenerativeModel("gemini-1.5-flash")
        logger.info("Gemini client initialised (model=gemini-1.5-flash)")
        return _client
    except Exception:
        logger.exception("Failed to initialise Gemini client")
        return None
