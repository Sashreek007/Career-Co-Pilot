import asyncio
import logging
import os
import re
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

from playwright.async_api import async_playwright

from .base import JobSourceAdapter, RawJobData

logger = logging.getLogger(__name__)

_STATE_DIR = Path(__file__).resolve().parents[4] / "data" / "browser_state"


def _browser_headless() -> bool:
    value = os.environ.get("DISCOVERY_BROWSER_HEADLESS", "").strip().lower()
    return value in {"1", "true", "yes"}


def _manual_wait_ms() -> int:
    raw = os.environ.get("DISCOVERY_USER_ASSISTED_WAIT_SECONDS", "20").strip()
    try:
        seconds = int(raw)
    except ValueError:
        seconds = 20
    return max(seconds, 5) * 1000


def _discovery_cdp_endpoint() -> str:
    value = os.environ.get("DISCOVERY_BROWSER_CDP_ENDPOINT", "").strip()
    if value:
        return value
    return "http://browser:9222"


def _discovery_visible_browser_default() -> bool:
    value = os.environ.get("DISCOVERY_USE_VISIBLE_BROWSER", "").strip().lower()
    if value in {"0", "false", "no"}:
        return False
    if value in {"1", "true", "yes"}:
        return True
    return True


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _absolute_url(base: str, href: str) -> str:
    candidate = href.strip()
    if not candidate:
        return ""
    if candidate.startswith("http://") or candidate.startswith("https://"):
        return candidate
    if candidate.startswith("/"):
        return f"{base}{candidate}"
    return f"{base}/{candidate}"


class _UserAssistedBrowserAdapter(JobSourceAdapter):
    site_name: str = ""
    base_url: str = ""
    search_template: str = ""
    source_label: str = ""
    last_error: str | None = None

    def __init__(
        self,
        *,
        use_visible_browser: bool | None = None,
        cdp_endpoint: str | None = None,
        manual_wait_seconds: int | None = None,
    ) -> None:
        self.use_visible_browser = (
            _discovery_visible_browser_default() if use_visible_browser is None else bool(use_visible_browser)
        )
        self.cdp_endpoint = cdp_endpoint.strip() if isinstance(cdp_endpoint, str) and cdp_endpoint.strip() else _discovery_cdp_endpoint()
        if manual_wait_seconds is None:
            self.manual_wait_ms = _manual_wait_ms()
        else:
            try:
                seconds = int(manual_wait_seconds)
            except (TypeError, ValueError):
                seconds = 20
            self.manual_wait_ms = max(5, min(seconds, 180)) * 1000

    def _state_file(self) -> Path:
        _STATE_DIR.mkdir(parents=True, exist_ok=True)
        return _STATE_DIR / f"{self.site_name}.json"

    def _build_search_url(self, query: str) -> str:
        return self.search_template.format(query=quote_plus(query))

    async def _extract_rows(self, page) -> list[dict[str, str]]:  # pragma: no cover - adapter specific
        raise NotImplementedError

    async def search(self, query: str, max_results: int = 20) -> list[RawJobData]:
        self.last_error = None
        if not query.strip():
            return []

        state_file = self._state_file()
        context_state: str | None = str(state_file) if state_file.exists() else None
        search_url = self._build_search_url(query)
        wait_ms = self.manual_wait_ms

        playwright = None
        browser = None
        context = None
        page = None
        close_browser = True
        close_context = True

        try:
            playwright = await async_playwright().start()

            if self.use_visible_browser:
                browser = await playwright.chromium.connect_over_cdp(self.cdp_endpoint)
                close_browser = False
                if browser.contexts:
                    context = browser.contexts[0]
                    close_context = False
                else:
                    context = await browser.new_context()
                    close_context = True
            else:
                browser = await playwright.chromium.launch(headless=_browser_headless())
                context_kwargs: dict[str, Any] = {}
                if context_state:
                    context_kwargs["storage_state"] = context_state
                context = await browser.new_context(**context_kwargs)
                close_browser = True
                close_context = True

            if context is None:
                raise RuntimeError("Could not create browser context for discovery.")
            page = await context.new_page()

            logger.info(
                "User-assisted discovery opening %s. Complete login/search review in browser (%ds).",
                self.site_name,
                wait_ms // 1000,
            )

            await page.goto(search_url, wait_until="domcontentloaded")
            await page.wait_for_timeout(wait_ms)

            # Scroll to load more rows before extraction.
            for _ in range(3):
                await page.mouse.wheel(0, 1800)
                await page.wait_for_timeout(600)

            rows = await self._extract_rows(page)
            if close_context:
                await context.storage_state(path=str(state_file))

            parsed: list[RawJobData] = []
            for row in rows:
                title = _clean_text(row.get("title"))
                source_url = _clean_text(row.get("source_url"))
                if not title or not source_url:
                    continue
                parsed.append(
                    RawJobData(
                        title=title,
                        company=_clean_text(row.get("company")) or self.site_name.title(),
                        location=_clean_text(row.get("location")) or "Remote",
                        description=_clean_text(row.get("description")),
                        source_url=_absolute_url(self.base_url, source_url),
                        source=self.source_label,
                        posted_date=_clean_text(row.get("posted_date")) or None,
                    )
                )
                if len(parsed) >= max_results:
                    return parsed[:max_results]
            return parsed[:max_results]
        except Exception as exc:
            self.last_error = str(exc)
            logger.exception("User-assisted %s discovery failed for query=%s", self.site_name, query)
            return []
        finally:
            if page is not None:
                await page.close()
            if context is not None and close_context:
                await context.close()
            if browser is not None and close_browser:
                await browser.close()
            if playwright is not None:
                await playwright.stop()


class LinkedInUserAssistedAdapter(_UserAssistedBrowserAdapter):
    site_name = "linkedin"
    base_url = "https://www.linkedin.com"
    search_template = "https://www.linkedin.com/jobs/search/?keywords={query}"
    source_label = "linkedin_browser"

    async def _extract_rows(self, page) -> list[dict[str, str]]:
        return await page.evaluate(
            """
            () => {
              const rows = [];
              const seen = new Set();
              const anchors = Array.from(document.querySelectorAll('a[href*="/jobs/view/"]'));
              for (const anchor of anchors) {
                const href = (anchor.getAttribute('href') || '').split('?')[0];
                if (!href || seen.has(href)) continue;
                seen.add(href);
                const container = anchor.closest('li, article, div');
                const companyNode =
                  container?.querySelector('.base-search-card__subtitle') ||
                  container?.querySelector('.job-card-container__company-name') ||
                  container?.querySelector('h4');
                const locationNode =
                  container?.querySelector('.job-search-card__location') ||
                  container?.querySelector('.job-card-container__metadata-item');
                const dateNode =
                  container?.querySelector('time') ||
                  container?.querySelector('.job-search-card__listdate');
                rows.push({
                  title: (anchor.textContent || '').trim(),
                  company: (companyNode?.textContent || '').trim(),
                  location: (locationNode?.textContent || '').trim(),
                  description: (container?.innerText || '').trim(),
                  source_url: href,
                  posted_date: (dateNode?.textContent || '').trim(),
                });
              }
              return rows;
            }
            """
        )


class IndeedUserAssistedAdapter(_UserAssistedBrowserAdapter):
    site_name = "indeed"
    base_url = "https://www.indeed.com"
    search_template = "https://www.indeed.com/jobs?q={query}"
    source_label = "indeed_browser"

    async def _extract_rows(self, page) -> list[dict[str, str]]:
        return await page.evaluate(
            """
            () => {
              const rows = [];
              const seen = new Set();
              const anchors = Array.from(document.querySelectorAll('a[href*="/viewjob"]'));
              for (const anchor of anchors) {
                const href = anchor.getAttribute('href') || '';
                if (!href || seen.has(href)) continue;
                seen.add(href);
                const card = anchor.closest('[data-jk], [data-testid="slider_item"], .job_seen_beacon, article, div');
                const companyNode =
                  card?.querySelector('[data-testid="company-name"]') ||
                  card?.querySelector('.companyName');
                const locationNode =
                  card?.querySelector('[data-testid="text-location"]') ||
                  card?.querySelector('.companyLocation');
                const snippetNode =
                  card?.querySelector('.job-snippet') ||
                  card?.querySelector('.summary');
                const dateNode =
                  card?.querySelector('.date') ||
                  card?.querySelector('[data-testid="myJobsStateDate"]');
                rows.push({
                  title: (anchor.textContent || '').trim(),
                  company: (companyNode?.textContent || '').trim(),
                  location: (locationNode?.textContent || '').trim(),
                  description: (snippetNode?.textContent || card?.innerText || '').trim(),
                  source_url: href,
                  posted_date: (dateNode?.textContent || '').trim(),
                });
              }
              return rows;
            }
            """
        )
