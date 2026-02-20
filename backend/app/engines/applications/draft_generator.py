import json
from typing import Any


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
    return any(token in label_lower for token in ("why", "tell us", "describe"))


def _is_experience_years_prompt(label_lower: str) -> bool:
    has_experience = "experience" in label_lower
    has_year = "year" in label_lower
    return has_experience and has_year


def generate_draft_answers(
    job: dict[str, Any], user_profile: dict[str, Any], form_fields: list[dict[str, Any]]
) -> dict[str, Any]:
    """Populate fields conservatively. Unknown values are explicit review placeholders."""
    _ = job
    answers: dict[str, Any] = {}
    skills = _parse_skills(user_profile.get("skills_json"))

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
            answers[label] = f"[REQUIRES_REVIEW: {label}]"
            continue

        answers[label] = f"[REQUIRES_REVIEW: {label}]"

    return answers
