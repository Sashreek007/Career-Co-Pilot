import json
import re
import sqlite3
from html import unescape
from hashlib import sha256
from typing import Any
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db.database import get_db

router = APIRouter(prefix="", tags=["jobs"])


def db_conn():
    conn = get_db()
    try:
        yield conn
    finally:
        conn.close()


def _row_to_job(row: sqlite3.Row) -> dict[str, Any]:
    job = dict(row)
    raw_skills = job.get("skills_required_json")
    if isinstance(raw_skills, str):
        try:
            job["skills_required_json"] = json.loads(raw_skills)
        except json.JSONDecodeError:
            pass
    return job


class ImportJobRequest(BaseModel):
    source_url: str
    title: str | None = None
    company: str | None = None
    location: str | None = None
    description: str | None = None
    remote: bool = False


def _clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _company_from_host(source_url: str) -> str:
    host = urlparse(source_url).netloc.lower()
    host = host.removeprefix("www.")
    parts = [part for part in host.split(".") if part]
    if len(parts) >= 2:
        return parts[-2].replace("-", " ").title()
    return host.replace("-", " ").title() or "Unknown Company"


def _parse_linkedin_title_parts(source_url: str, metadata_title: str) -> tuple[str, str]:
    if "linkedin.com" not in urlparse(source_url).netloc.lower():
        return "", ""

    cleaned = _clean_text(metadata_title)
    if not cleaned:
        return "", ""

    cleaned = re.sub(r"\|\s*LinkedIn\s*$", "", cleaned, flags=re.IGNORECASE).strip()
    match = re.search(
        r"^(?P<company>.+?)\s+(?:is\s+)?hiring\s+(?P<title>.+?)\s+in\s+.+$",
        cleaned,
        flags=re.IGNORECASE,
    )
    if not match:
        return cleaned, ""
    return _clean_text(match.group("title")), _clean_text(match.group("company"))


def _normalize_source_url(source_url: str) -> str:
    parsed = urlparse(source_url)
    host = parsed.netloc.lower()

    if "linkedin.com" in host:
        if "/jobs/view/" in parsed.path:
            return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"

        current_job_ids = parse_qs(parsed.query).get("currentJobId", [])
        if current_job_ids:
            job_id = str(current_job_ids[0]).strip()
            if job_id.isdigit():
                return f"{parsed.scheme}://{parsed.netloc}/jobs/view/{job_id}/"

        raise HTTPException(
            status_code=400,
            detail=(
                "Please import a specific LinkedIn job URL "
                "(for example: https://www.linkedin.com/jobs/view/<job-id>/)."
            ),
        )

    if "indeed." in host:
        query = parse_qs(parsed.query)
        job_keys = query.get("jk", [])
        if parsed.path.startswith("/viewjob") and job_keys:
            job_key = str(job_keys[0]).strip()
            if job_key:
                return f"{parsed.scheme}://{parsed.netloc}/viewjob?jk={job_key}"

    return source_url


def _fetch_html_metadata(source_url: str) -> dict[str, str]:
    try:
        request = Request(
            source_url,
            headers={
                "User-Agent": "Career-Co-Pilot/0.1 (+https://github.com/Sashreek007/Career-Co-Pilot)",
                "Accept": "text/html,application/xhtml+xml",
            },
        )
        with urlopen(request, timeout=15) as response:  # noqa: S310
            html = response.read(220_000).decode("utf-8", errors="ignore")
    except Exception:
        return {}

    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.IGNORECASE | re.DOTALL)
    title = _clean_text(unescape(title_match.group(1))) if title_match else ""

    meta: dict[str, str] = {}
    for tag_match in re.finditer(r"<meta\s+[^>]*>", html, flags=re.IGNORECASE):
        tag = tag_match.group(0)
        key_match = re.search(
            r'(?:name|property)\s*=\s*["\']([^"\']+)["\']',
            tag,
            flags=re.IGNORECASE,
        )
        value_match = re.search(r'content\s*=\s*["\']([^"\']*)["\']', tag, flags=re.IGNORECASE)
        if not key_match or not value_match:
            continue
        key = _clean_text(key_match.group(1)).lower()
        value = _clean_text(unescape(value_match.group(1)))
        if key and value and key not in meta:
            meta[key] = value

    return {
        "title": _clean_text(meta.get("og:title") or meta.get("twitter:title") or title),
        "description": _clean_text(meta.get("og:description") or meta.get("description")),
        "site_name": _clean_text(meta.get("og:site_name")),
    }


def _source_from_url(source_url: str) -> str:
    host = urlparse(source_url).netloc.lower()
    if "linkedin.com" in host:
        return "linkedin_manual"
    if "indeed." in host:
        return "indeed_manual"
    if "greenhouse.io" in host or "greenhouse" in host:
        return "greenhouse_manual"
    return host or "manual"


@router.get("/jobs")
def get_jobs(db: sqlite3.Connection = Depends(db_conn)):
    rows = db.execute(
        """
        SELECT * FROM jobs
        WHERE is_archived = 0
        ORDER BY match_score DESC, discovered_at DESC
        """
    ).fetchall()
    return [_row_to_job(row) for row in rows]


@router.get("/jobs/{job_id}")
def get_job(job_id: str, db: sqlite3.Connection = Depends(db_conn)):
    row = db.execute(
        "SELECT * FROM jobs WHERE id = ? AND is_archived = 0",
        (job_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return _row_to_job(row)


@router.post("/jobs/import-link")
def import_job_from_link(payload: ImportJobRequest, db: sqlite3.Connection = Depends(db_conn)):
    source_url = payload.source_url.strip()
    parsed = urlparse(source_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="source_url must be a valid http(s) URL")
    source_url = _normalize_source_url(source_url)
    metadata = _fetch_html_metadata(source_url)
    linkedin_title, linkedin_company = _parse_linkedin_title_parts(source_url, metadata.get("title", ""))

    title = _clean_text(payload.title)
    if title.startswith("http://") or title.startswith("https://"):
        title = ""
    if not title:
        title = linkedin_title or metadata.get("title", "")

    company = _clean_text(payload.company)
    if company.startswith("http://") or company.startswith("https://"):
        company = ""
    if not company:
        company = linkedin_company or metadata.get("site_name", "")
    if not company:
        company = _company_from_host(source_url)

    description = _clean_text(payload.description) or metadata.get("description", "")

    if not title:
        linkedin_match = re.search(r"/jobs/view/(\d+)", source_url)
        if linkedin_match:
            title = f"LinkedIn Job {linkedin_match.group(1)}"
        else:
            title = "Imported Job"

    job_id = "manual-" + sha256(source_url.encode("utf-8")).hexdigest()[:16]
    db.execute(
        """
        INSERT OR REPLACE INTO jobs (
            id, title, company, location, remote, description, skills_required_json,
            source, source_url, match_score, match_tier, posted_date, discovered_at, is_archived
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 0)
        """,
        (
            job_id,
            title,
            company,
            (payload.location or "Remote").strip() or "Remote",
            1 if payload.remote else 0,
            description,
            json.dumps([]),
            _source_from_url(source_url),
            source_url,
            0.0,
            "low",
            None,
        ),
    )
    db.commit()

    row = db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=500, detail="Imported job could not be loaded")
    return _row_to_job(row)


@router.delete("/jobs/{job_id}")
def archive_job(job_id: str, db: sqlite3.Connection = Depends(db_conn)):
    result = db.execute(
        "UPDATE jobs SET is_archived = 1 WHERE id = ? AND is_archived = 0",
        (job_id,),
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"ok": True, "job_id": job_id, "is_archived": 1}
