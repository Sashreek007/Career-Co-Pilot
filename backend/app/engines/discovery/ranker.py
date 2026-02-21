import json
from typing import Any


def _parse_json_array(raw: Any) -> list[Any]:
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


def _to_skill_names(values: list[Any]) -> set[str]:
    names: set[str] = set()
    for value in values:
        if isinstance(value, str) and value.strip():
            names.add(value.strip().lower())
            continue
        if isinstance(value, dict):
            candidate = value.get("name")
            if isinstance(candidate, str) and candidate.strip():
                names.add(candidate.strip().lower())
    return names


def rank_job(job: dict[str, Any], user_profile: dict[str, Any]) -> tuple[float, str]:
    job_skills = _to_skill_names(_parse_json_array(job.get("skills_required_json")))
    user_skills = _to_skill_names(_parse_json_array(user_profile.get("skills_json")))
    if not job_skills:
        score = 0.0
    else:
        score = len(job_skills & user_skills) / len(job_skills)

    if score >= 0.7:
        tier = "high"
    elif score >= 0.4:
        tier = "medium"
    else:
        tier = "low"
    return round(score, 4), tier


def apply_ranking(job: dict[str, Any], user_profile: dict[str, Any]) -> dict[str, Any]:
    score, tier = rank_job(job, user_profile)
    ranked = dict(job)
    ranked["match_score"] = score
    ranked["match_tier"] = tier
    return ranked
