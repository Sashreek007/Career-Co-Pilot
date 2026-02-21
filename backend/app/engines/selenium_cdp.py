import json
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


def _normalize_remote_url(endpoint: str) -> str:
    value = endpoint.strip()
    if not value:
        return ""
    if "://" not in value:
        value = f"http://{value}"
    parsed = urlparse(value)
    host = parsed.hostname
    if not host:
        return ""

    scheme = parsed.scheme or "http"
    if scheme == "ws":
        scheme = "http"
    elif scheme == "wss":
        scheme = "https"

    port = parsed.port
    if port is None:
        if scheme == "https":
            port = 443
        else:
            port = 80
    if port == 9222:
        port = 4444

    return f"{scheme}://{host}:{port}"


def _request_json(
    url: str,
    *,
    method: str = "GET",
    payload: dict[str, Any] | None = None,
    timeout_seconds: int = 8,
) -> dict[str, Any]:
    body = None
    headers: dict[str, str] = {}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = Request(url, data=body, method=method, headers=headers)
    with urlopen(request, timeout=timeout_seconds) as response:  # noqa: S310
        raw = response.read().decode("utf-8", errors="ignore")
    parsed = json.loads(raw) if raw else {}
    return parsed if isinstance(parsed, dict) else {}


def bootstrap_selenium_cdp_session(
    *,
    cdp_endpoint: str,
    selenium_remote_url: str = "",
    timeout_seconds: int = 8,
) -> tuple[str | None, str | None, str | None]:
    """
    Create a Selenium session and return its CDP websocket endpoint.

    Returns: (cdp_ws_endpoint, delete_session_url, error_message)
    """

    remote_url = _normalize_remote_url(selenium_remote_url) or _normalize_remote_url(cdp_endpoint)
    if not remote_url:
        return None, None, "Could not derive Selenium remote URL."

    try:
        status_payload = _request_json(f"{remote_url}/status", timeout_seconds=timeout_seconds)
        status_value = status_payload.get("value")
        if isinstance(status_value, dict):
            ready = status_value.get("ready")
            if ready is False:
                return None, None, "Selenium Grid is not ready."
    except Exception:
        # Continue anyway; some servers do not expose /status in the same shape.
        pass

    payload = {
        "capabilities": {
            "alwaysMatch": {
                "browserName": "chrome",
                "goog:chromeOptions": {
                    "args": ["--no-sandbox", "--disable-dev-shm-usage"],
                },
            }
        }
    }

    try:
        created = _request_json(
            f"{remote_url}/session",
            method="POST",
            payload=payload,
            timeout_seconds=timeout_seconds,
        )
    except (HTTPError, URLError, TimeoutError) as exc:
        return None, None, f"Failed creating Selenium session: {exc}"
    except Exception as exc:
        return None, None, str(exc)

    value = created.get("value")
    if isinstance(value, dict) and value.get("error"):
        message = str(value.get("message") or value.get("error"))
        return None, None, message

    session_id = ""
    capabilities: dict[str, Any] = {}
    if isinstance(value, dict):
        session_id = str(value.get("sessionId") or "").strip()
        caps = value.get("capabilities")
        capabilities = caps if isinstance(caps, dict) else {}
    if not session_id:
        session_id = str(created.get("sessionId") or "").strip()

    if not session_id:
        return None, None, "Selenium session created without sessionId."

    cdp_ws = str(capabilities.get("se:cdp") or "").strip()
    if not cdp_ws:
        chrome_options = capabilities.get("goog:chromeOptions")
        if isinstance(chrome_options, dict):
            debugger_address = str(chrome_options.get("debuggerAddress") or "").strip()
            if debugger_address:
                base_host = urlparse(remote_url).hostname or "localhost"
                debugger_host = debugger_address
                if debugger_host.startswith("localhost:"):
                    debugger_host = debugger_host.replace("localhost:", f"{base_host}:", 1)
                cdp_ws = f"http://{debugger_host}"

    delete_url = f"{remote_url}/session/{session_id}"
    if not cdp_ws:
        return None, delete_url, "Selenium session missing se:cdp endpoint."
    return cdp_ws, delete_url, None


def close_selenium_session(delete_session_url: str | None, *, timeout_seconds: int = 5) -> None:
    url = str(delete_session_url or "").strip()
    if not url:
        return
    try:
        request = Request(url, method="DELETE")
        with urlopen(request, timeout=timeout_seconds):  # noqa: S310
            return
    except Exception:
        return
