import json
import logging
import re
from typing import Any

from ...clients.gemini import get_gemini_client

logger = logging.getLogger(__name__)


def _as_lower(value: Any) -> str:
    return str(value or "").strip().lower()


def _parse_skills(raw_skills: Any) -> list[dict[str, Any]]:
    if raw_skills is None:
        return []
    if isinstance(raw_skills, str):
        try:
            parsed = json.loads(raw_skills)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    if isinstance(raw_skills, list):
        return raw_skills
    return []


def _extract_skill_years(skill: dict[str, Any]) -> int | None:
    for key in ("yearsOfExperience", "years_of_experience", "years"):
        value = skill.get(key)
        if isinstance(value, (int, float)):
            return int(value)
    return None


def _is_essay_prompt(label_lower: str) -> bool:
    if any(token in label_lower for token in ("why", "tell us", "describe", "how are you", "explain")):
        return True
    return "?" in label_lower and len(label_lower) > 25


def _is_experience_years_prompt(label_lower: str) -> bool:
    has_experience = "experience" in label_lower
    has_year = "year" in label_lower
    return has_experience and has_year


def _clean_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _split_name(full_name: Any) -> tuple[str, str]:
    cleaned = _clean_text(full_name)
    if not cleaned:
        return "", ""
    parts = cleaned.split(" ")
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], " ".join(parts[1:])


def _infer_country(location: Any) -> str:
    loc = _clean_text(location).lower()
    if not loc:
        return "United States"
    if "india" in loc:
        return "India"
    if "canada" in loc:
        return "Canada"
    if "uk" in loc or "united kingdom" in loc:
        return "United Kingdom"
    if "germany" in loc:
        return "Germany"
    if "france" in loc:
        return "France"
    if "australia" in loc:
        return "Australia"
    return "United States"


def _profile_context_snippet(user_profile: dict[str, Any]) -> dict[str, Any]:
    raw_skills = _parse_skills(user_profile.get("skills_json"))
    skill_names: list[str] = []
    for skill in raw_skills:
        if isinstance(skill, dict):
            name = _clean_text(skill.get("name"))
            if name:
                skill_names.append(name)
        elif isinstance(skill, str):
            name = _clean_text(skill)
            if name:
                skill_names.append(name)

    experience = user_profile.get("experience_json")
    role_snippets: list[str] = []
    if isinstance(experience, str):
        try:
            experience = json.loads(experience)
        except json.JSONDecodeError:
            experience = []
    if isinstance(experience, list):
        for item in experience[:3]:
            if not isinstance(item, dict):
                continue
            title = _clean_text(item.get("title"))
            company = _clean_text(item.get("company"))
            if title and company:
                role_snippets.append(f"{title} at {company}")

    return {
        "name": _clean_text(user_profile.get("name")),
        "summary": _clean_text(user_profile.get("summary")),
        "skills": skill_names[:10],
        "experience": role_snippets,
    }


def _generate_ai_answer(
    client: Any,
    *,
    label: str,
    job: dict[str, Any],
    user_profile: dict[str, Any],
) -> str | None:
    if client is None:
        return None

    prompt = (
        "You are drafting a job application field answer.\n"
        "Return only plain text for the field, no markdown.\n"
        "Rules:\n"
        "- Use only the profile/job context below.\n"
        "- Do not invent facts, names, numbers, or achievements.\n"
        "- Keep concise (1-4 sentences).\n\n"
        f"Field label: {label}\n"
        f"Job: {json.dumps({'title': job.get('title'), 'company': job.get('company')})}\n"
        f"Profile: {json.dumps(_profile_context_snippet(user_profile))}\n"
    )

    try:
        response = client.generate_content(prompt)
        text = _clean_text(getattr(response, "text", ""))
        if not text:
            return None
        if text.startswith("[REQUIRES_REVIEW:"):
            return None
        return text[:600]
    except Exception:
        logger.debug("AI draft answer generation failed for label=%s", label, exc_info=True)
        return None


def _fallback_required_essay_answer(
    *,
    label: str,
    job: dict[str, Any],
    user_profile: dict[str, Any],
) -> str:
    summary = _clean_text(user_profile.get("summary"))
    if not summary:
        summary = "I focus on building reliable, maintainable software and learning quickly."

    location = _clean_text(user_profile.get("location"))
    role = _clean_text(job.get("title")) or "this role"
    label_lower = _as_lower(label)

    if "ai" in label_lower:
        return (
            "I use AI tools to research options, draft implementation ideas, and speed up documentation "
            "while validating outputs before production use."
        )

    if "why" in label_lower:
        return (
            f"I'm interested in {role} because it aligns with my background and growth goals. "
            f"{summary}"
        )

    if location:
        return f"{summary} I'm based in {location} and excited about the opportunity."
    return summary


def generate_draft_answers(
    job: dict[str, Any], user_profile: dict[str, Any], form_fields: list[dict[str, Any]]
) -> dict[str, Any]:
    """Populate fields conservatively. Unknown values are explicit review placeholders."""
    answers: dict[str, Any] = {}
    skills = _parse_skills(user_profile.get("skills_json"))
    ai_client = get_gemini_client()
    first_name, last_name = _split_name(user_profile.get("name"))

    for field in form_fields:
        label = str(field.get("label") or "").strip() or "Unknown Field"
        label_lower = _as_lower(label)
        field_type = _as_lower(field.get("type"))

        if field_type == "file":
            answers[label] = {"resume_upload_required": True}
            continue

        if "full name" in label_lower or label_lower == "name":
            answers[label] = user_profile.get("name") or "[REQUIRES_REVIEW: Name]"
            continue
        if "first name" in label_lower:
            answers[label] = first_name or "[REQUIRES_REVIEW: First Name]"
            continue
        if "last name" in label_lower or "surname" in label_lower:
            answers[label] = last_name or "[REQUIRES_REVIEW: Last Name]"
            continue
        if "email" in label_lower:
            answers[label] = user_profile.get("email") or "[REQUIRES_REVIEW: Email]"
            continue
        if "phone" in label_lower:
            answers[label] = user_profile.get("phone") or "[REQUIRES_REVIEW: Phone]"
            continue
        if "linkedin" in label_lower:
            answers[label] = user_profile.get("linkedin_url") or "[REQUIRES_REVIEW: LinkedIn]"
            continue
        if "github" in label_lower:
            answers[label] = user_profile.get("github_url") or "[REQUIRES_REVIEW: GitHub]"
            continue
        if "country" in label_lower:
            answers[label] = _infer_country(user_profile.get("location"))
            continue
        if "location" in label_lower or "city" in label_lower:
            answers[label] = user_profile.get("location") or "[REQUIRES_REVIEW: Location]"
            continue

        if _is_experience_years_prompt(label_lower):
            skill_years: int | None = None
            for skill in skills:
                if not isinstance(skill, dict):
                    continue
                name = _as_lower(skill.get("name"))
                if name and name in label_lower:
                    skill_years = _extract_skill_years(skill)
                    break
            answers[label] = str(skill_years) if skill_years is not None else f"[REQUIRES_REVIEW: {label}]"
            continue

        if _is_essay_prompt(label_lower):
            ai_answer = _generate_ai_answer(ai_client, label=label, job=job, user_profile=user_profile)
            if ai_answer:
                answers[label] = ai_answer
            elif bool(field.get("required", False)):
                answers[label] = _fallback_required_essay_answer(
                    label=label,
                    job=job,
                    user_profile=user_profile,
                )
            else:
                answers[label] = f"[REQUIRES_REVIEW: {label}]"
            continue

        answers[label] = f"[REQUIRES_REVIEW: {label}]"

    return answers
