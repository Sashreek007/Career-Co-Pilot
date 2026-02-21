import io
import json
import re
from datetime import datetime
from functools import lru_cache
from pathlib import Path
from typing import Any
from uuid import uuid4

from ...clients.gemini import get_gemini_client

APP_DATA_DIR = Path(__file__).resolve().parents[2] / "data"
RESUME_UPLOAD_DIR = APP_DATA_DIR / "resumes"
SKILL_TAXONOMY_PATH = APP_DATA_DIR / "skill_taxonomy.json"

MAX_RESUME_SIZE_BYTES = 8 * 1024 * 1024

EMAIL_RE = re.compile(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", re.IGNORECASE)
PHONE_RE = re.compile(r"(?:\+?\d[\d()\-\s]{7,}\d)")
URL_RE = re.compile(r"https?://[^\s)]+", re.IGNORECASE)
DATE_TOKEN_RE = re.compile(r"(20\d{2}|19\d{2})(?:[-/](0[1-9]|1[0-2]))?")
NON_WORD_SKILL_CHARS_RE = re.compile(r"[^a-z0-9+#]+")
HEADING_RE = re.compile(
    r"^(summary|objective|skills|technical skills|experience|work experience|projects|certifications?)\s*:?\s*$",
    re.IGNORECASE,
)


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _ensure_json_obj(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _ensure_json_list(raw: Any) -> list[Any]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


@lru_cache(maxsize=1)
def _skill_taxonomy() -> list[str]:
    if not SKILL_TAXONOMY_PATH.exists():
        return []
    try:
        payload = json.loads(SKILL_TAXONOMY_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    if not isinstance(payload, list):
        return []
    return [_clean_text(item) for item in payload if _clean_text(item)]


def _normalise_skill_token(value: str) -> str:
    cleaned = NON_WORD_SKILL_CHARS_RE.sub(" ", value.lower()).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    alias_map = {
        "node js": "nodejs",
        "react js": "react",
        "next js": "nextjs",
        "rest apis": "rest api",
        "postgre sql": "postgresql",
        "postgres": "postgresql",
    }
    return alias_map.get(cleaned, cleaned)


def _skill_forms(value: str) -> set[str]:
    token = _normalise_skill_token(value)
    if not token:
        return set()
    forms = {token, token.replace(" ", "")}
    if token.endswith("s") and len(token) > 3:
        singular = token[:-1]
        forms.add(singular)
        forms.add(singular.replace(" ", ""))
    return {form for form in forms if form}


def _extract_text_from_pdf(raw: bytes) -> str:
    from pypdf import PdfReader  # type: ignore[import-untyped]

    reader = PdfReader(io.BytesIO(raw))
    pages: list[str] = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    return "\n".join(pages)


def _extract_text_from_docx(raw: bytes) -> str:
    from docx import Document  # type: ignore[import-untyped]

    document = Document(io.BytesIO(raw))
    return "\n".join(paragraph.text for paragraph in document.paragraphs)


def extract_resume_text(file_name: str, content_type: str | None, raw: bytes) -> str:
    if len(raw) > MAX_RESUME_SIZE_BYTES:
        raise ValueError("Resume file is too large (max 8MB)")

    suffix = Path(file_name).suffix.lower()
    try:
        if suffix == ".pdf":
            text = _extract_text_from_pdf(raw)
        elif suffix == ".docx":
            text = _extract_text_from_docx(raw)
        elif suffix in {".txt", ".md", ".rtf"}:
            text = raw.decode("utf-8", errors="ignore")
        else:
            if content_type and "text" in content_type.lower():
                text = raw.decode("utf-8", errors="ignore")
            else:
                raise ValueError("Unsupported resume format. Use PDF, DOCX, or TXT.")
    except ValueError:
        raise
    except Exception as exc:  # pragma: no cover - parser fallback
        raise ValueError(f"Failed to read resume file ({suffix or 'unknown'}).") from exc

    cleaned = _clean_text(text)
    if not cleaned:
        raise ValueError("Resume appears empty or unreadable.")
    return text


def _candidate_lines(text: str, limit: int = 40) -> list[str]:
    lines = []
    for line in text.splitlines():
        cleaned = _clean_text(line)
        if cleaned:
            lines.append(cleaned)
        if len(lines) >= limit:
            break
    return lines


def _extract_name(lines: list[str]) -> str:
    for line in lines[:8]:
        if "@" in line or "http://" in line.lower() or "https://" in line.lower():
            continue
        if len(line.split()) < 2 or len(line.split()) > 5:
            continue
        if any(token in line.lower() for token in ("resume", "curriculum", "profile")):
            continue
        return line
    return ""


def _extract_location(lines: list[str]) -> str:
    location_hint = re.compile(
        r"\b([A-Za-z .'-]{2,},\s*(?:[A-Z]{2}|[A-Za-z .'-]{3,}))\b"
    )
    for line in lines[:16]:
        if "@" in line or "http" in line.lower():
            continue
        match = location_hint.search(line)
        if match:
            return _clean_text(match.group(1))
    return ""


def _extract_summary(text: str) -> str:
    lines = text.splitlines()
    for idx, line in enumerate(lines):
        if re.match(r"^\s*(summary|objective)\s*:?\s*$", line, re.IGNORECASE):
            buffer: list[str] = []
            for nxt in lines[idx + 1 : idx + 7]:
                cleaned = _clean_text(nxt)
                if not cleaned:
                    continue
                if HEADING_RE.match(cleaned):
                    break
                buffer.append(cleaned)
            if buffer:
                return _clean_text(" ".join(buffer))[:500]
    return ""


def _extract_section_tokens(text: str, section_names: tuple[str, ...], limit: int = 30) -> list[str]:
    lines = text.splitlines()
    captured: list[str] = []
    capture_mode = False
    for line in lines:
        cleaned = _clean_text(line)
        if not cleaned:
            continue
        lowered = cleaned.lower().rstrip(":")
        if lowered in section_names:
            capture_mode = True
            continue
        if capture_mode and HEADING_RE.match(cleaned):
            break
        if capture_mode:
            parts = re.split(r"[,\u2022|/;]+", cleaned)
            for part in parts:
                token = _clean_text(part)
                if token:
                    captured.append(token)
                if len(captured) >= limit:
                    return captured
    return captured


def _extract_skills(text: str) -> list[str]:
    lowered = text.lower()
    found: set[str] = set()
    for skill in _skill_taxonomy():
        pattern = r"(?<![a-z0-9])" + re.escape(skill.lower()) + r"(?![a-z0-9])"
        if re.search(pattern, lowered):
            found.add(skill)

    section_tokens = _extract_section_tokens(text, ("skills", "technical skills", "core skills"), limit=60)
    taxonomy_forms: list[tuple[str, set[str]]] = [(skill, _skill_forms(skill)) for skill in _skill_taxonomy()]
    for token in section_tokens:
        token_forms = _skill_forms(token)
        if not token_forms:
            continue
        matched = False
        for canonical, forms in taxonomy_forms:
            if token_forms & forms:
                found.add(canonical)
                matched = True
                break
        if not matched and len(token.split()) <= 4:
            found.add(token)

    return sorted(found)[:80]


def _extract_structured_with_ai(text: str) -> dict[str, Any]:
    client = get_gemini_client()
    if client is None:
        return {}

    excerpt = text[:16000]
    prompt = (
        "Extract structured resume data from this resume text.\n"
        "Return JSON only. No markdown.\n"
        "Schema:\n"
        "{\n"
        '  "name": string,\n'
        '  "email": string,\n'
        '  "phone": string,\n'
        '  "location": string,\n'
        '  "linkedin_url": string,\n'
        '  "github_url": string,\n'
        '  "portfolio_url": string,\n'
        '  "summary": string,\n'
        '  "skills": string[],\n'
        '  "skill_years": { "Skill Name": number },\n'
        '  "experiences": [\n'
        "    {\n"
        '      "role": string,\n'
        '      "company": string,\n'
        '      "description": string,\n'
        '      "skills": string[],\n'
        '      "start_date": "YYYY-MM",\n'
        '      "end_date": "YYYY-MM" | "present",\n'
        '      "bullets": string[]\n'
        "    }\n"
        "  ],\n"
        '  "projects": [\n'
        "    {\n"
        '      "name": string,\n'
        '      "description": string,\n'
        '      "tech_stack": string[],\n'
        '      "skills": string[],\n'
        '      "impact_statement": string,\n'
        '      "url": string,\n'
        '      "start_date": "YYYY-MM",\n'
        '      "end_date": "YYYY-MM"\n'
        "    }\n"
        "  ],\n"
        '  "certifications": [\n'
        '    { "name": string, "issuer": string, "date_obtained": "YYYY-MM", "url": string }\n'
        "  ]\n"
        "}\n\n"
        "Rules:\n"
        "- Do not invent missing values.\n"
        "- Omit unknown fields or use empty string/list.\n"
        "- Keep dates in YYYY-MM when possible.\n\n"
        f"Resume text:\n{excerpt}"
    )
    try:
        response = client.generate_content(prompt)
        raw = _clean_text(getattr(response, "text", ""))
        if not raw:
            return {}
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw
            raw = raw.rsplit("```", 1)[0]
        start = raw.find("{")
        end = raw.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return {}
        parsed = json.loads(raw[start : end + 1])
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _safe_file_name(file_name: str) -> str:
    base = Path(file_name or "resume").name
    base = re.sub(r"[^A-Za-z0-9._-]+", "_", base).strip("._")
    if not base:
        base = "resume"
    return base[:120]


def save_resume_file(profile_id: str, file_name: str, raw: bytes) -> dict[str, str]:
    RESUME_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    safe_name = _safe_file_name(file_name)
    suffix = Path(safe_name).suffix.lower()
    ts = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    stored_name = f"{profile_id}-{ts}-{uuid4().hex[:8]}{suffix}"
    file_path = RESUME_UPLOAD_DIR / stored_name
    file_path.write_bytes(raw)
    return {"file_name": safe_name, "file_path": str(file_path)}


def _merge_skills(existing: list[Any], parsed_skills: list[str], parsed_skill_years: dict[str, Any]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    index_by_form: dict[str, int] = {}

    def add_skill(item: dict[str, Any]) -> None:
        idx = len(merged)
        merged.append(item)
        for form in _skill_forms(str(item.get("name") or "")):
            index_by_form[form] = idx

    for item in existing:
        if isinstance(item, str):
            name = _clean_text(item)
            if not name:
                continue
            add_skill(
                {
                    "id": f"sk-{uuid4().hex[:8]}",
                    "name": name,
                    "level": "intermediate",
                    "confidenceScore": 65,
                    "yearsOfExperience": 1,
                    "tags": [],
                }
            )
            continue
        if isinstance(item, dict):
            name = _clean_text(item.get("name"))
            if not name:
                continue
            add_skill(
                {
                    "id": _clean_text(item.get("id")) or f"sk-{uuid4().hex[:8]}",
                    "name": name,
                    "level": _clean_text(item.get("level")) or "intermediate",
                    "confidenceScore": int(item.get("confidenceScore") or item.get("confidence_score") or 65),
                    "yearsOfExperience": float(
                        item.get("yearsOfExperience") or item.get("years_of_experience") or item.get("years") or 1
                    ),
                    "tags": item.get("tags") if isinstance(item.get("tags"), list) else [],
                }
            )

    for skill_name in parsed_skills:
        forms = _skill_forms(skill_name)
        if not forms:
            continue
        existing_idx = next((index_by_form[form] for form in forms if form in index_by_form), None)
        guessed_years = parsed_skill_years.get(skill_name) or parsed_skill_years.get(skill_name.lower())
        try:
            years_value = max(0.0, float(guessed_years))
        except (TypeError, ValueError):
            years_value = 1.0
        if existing_idx is None:
            add_skill(
                {
                    "id": f"sk-{uuid4().hex[:8]}",
                    "name": skill_name,
                    "level": "intermediate",
                    "confidenceScore": 72,
                    "yearsOfExperience": years_value,
                    "tags": ["resume"],
                }
            )
        else:
            current = merged[existing_idx]
            if years_value > float(current.get("yearsOfExperience") or 0):
                current["yearsOfExperience"] = years_value

    return merged


def extract_resume_data(file_name: str, content_type: str | None, raw: bytes) -> dict[str, Any]:
    text = extract_resume_text(file_name, content_type, raw)
    lines = _candidate_lines(text)
    ai = _extract_structured_with_ai(text)

    found_urls = URL_RE.findall(text)
    email = _clean_text(ai.get("email")) or (EMAIL_RE.search(text).group(0) if EMAIL_RE.search(text) else "")
    phone = _clean_text(ai.get("phone")) or (PHONE_RE.search(text).group(0) if PHONE_RE.search(text) else "")
    linkedin_url = _clean_text(ai.get("linkedin_url")) or next(
        (url for url in found_urls if "linkedin.com" in url.lower()),
        "",
    )
    github_url = _clean_text(ai.get("github_url")) or next(
        (url for url in found_urls if "github.com" in url.lower()),
        "",
    )
    portfolio_url = _clean_text(ai.get("portfolio_url")) or next(
        (url for url in found_urls if "linkedin.com" not in url.lower() and "github.com" not in url.lower()),
        "",
    )

    ai_skill_years = ai.get("skill_years")
    parsed = {
        "name": _clean_text(ai.get("name")) or _extract_name(lines),
        "email": _clean_text(email),
        "phone": _clean_text(phone),
        "location": _clean_text(ai.get("location")) or _extract_location(lines),
        "linkedin_url": _clean_text(linkedin_url),
        "github_url": _clean_text(github_url),
        "portfolio_url": _clean_text(portfolio_url),
        "summary": _clean_text(ai.get("summary")) or _extract_summary(text),
        "skills": sorted(
            {
                _clean_text(skill)
                for skill in (_ensure_json_list(ai.get("skills")) + _extract_skills(text))
                if _clean_text(skill)
            }
        )[:100],
        "skill_years": ai_skill_years if isinstance(ai_skill_years, dict) else {},
        "experiences": _ensure_json_list(ai.get("experiences")),
        "projects": _ensure_json_list(ai.get("projects")),
        "certifications": _ensure_json_list(ai.get("certifications")),
        "raw_text": text,
        "used_ai": bool(ai),
    }
    return parsed


def merge_resume_into_profile(
    *,
    existing_profile: dict[str, Any],
    parsed_resume: dict[str, Any],
    stored_file_name: str,
    stored_file_path: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    existing_skills = _ensure_json_list(existing_profile.get("skills_json"))

    updates: dict[str, Any] = {
        "resume_file_name": stored_file_name,
        "resume_file_path": stored_file_path,
        "resume_uploaded_at": datetime.utcnow().isoformat(),
        "resume_text": parsed_resume.get("raw_text", ""),
        "resume_parsed_json": parsed_resume,
    }

    def set_if_present(target_key: str, candidate: Any) -> None:
        value = _clean_text(candidate)
        if not value:
            return
        updates[target_key] = value

    set_if_present("name", parsed_resume.get("name"))
    set_if_present("email", parsed_resume.get("email"))
    set_if_present("phone", parsed_resume.get("phone"))
    set_if_present("location", parsed_resume.get("location"))
    set_if_present("linkedin_url", parsed_resume.get("linkedin_url"))
    set_if_present("github_url", parsed_resume.get("github_url"))
    set_if_present("portfolio_url", parsed_resume.get("portfolio_url"))
    set_if_present("summary", parsed_resume.get("summary"))

    merged_skills = _merge_skills(
        existing_skills,
        parsed_resume.get("skills") if isinstance(parsed_resume.get("skills"), list) else [],
        parsed_resume.get("skill_years") if isinstance(parsed_resume.get("skill_years"), dict) else {},
    )
    if merged_skills:
        updates["skills_json"] = merged_skills

    extracted_summary = {
        "file_name": stored_file_name,
        "skills_extracted": len(parsed_resume.get("skills") or []),
        "experiences_extracted": len(parsed_resume.get("experiences") or []),
        "projects_extracted": len(parsed_resume.get("projects") or []),
        "certifications_extracted": len(parsed_resume.get("certifications") or []),
        "used_ai": bool(parsed_resume.get("used_ai")),
    }
    return updates, extracted_summary
