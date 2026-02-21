"""Fragment Selector — picks the most relevant experience and project bullets.

Given a JD analysis and user profile, each bullet/project is scored and the
top fragments are returned along with a human-readable ``selection_reason``.
"""

import logging
from datetime import date, datetime
from typing import Any

logger = logging.getLogger(__name__)


# ── Scoring helpers ───────────────────────────────────────────────────────

def _skill_overlap(item_skills: list[str], target_skills: list[str]) -> float:
    """Fraction of *target_skills* covered by *item_skills* (0.0–1.0)."""
    if not target_skills:
        return 0.0
    item_set = {s.lower() for s in item_skills}
    target_set = {s.lower() for s in target_skills}
    overlap = item_set & target_set
    return len(overlap) / len(target_set)


def _impact_score(bullet: dict[str, Any]) -> float:
    """Heuristic impact score based on presence of quantitative metrics.

    Returns a float 0.0–1.0. Bullets containing numbers/percentages score
    higher because they demonstrate measurable impact.
    """
    text: str = bullet.get("text", "")
    score = 0.0

    # Contains a number or percentage → likely quantified impact
    import re
    if re.search(r"\d+%", text):
        score += 0.5
    if re.search(r"\b\d{2,}\b", text):
        score += 0.3

    # Contains strong action verbs
    strong_verbs = {"led", "built", "designed", "architected", "reduced",
                    "increased", "improved", "launched", "migrated", "optimised",
                    "optimized", "scaled", "automated", "delivered"}
    first_word = text.split()[0].lower() if text else ""
    if first_word in strong_verbs:
        score += 0.2

    return min(score, 1.0)


def _recency_score(end_date_str: str | None) -> float:
    """Score 0.0–1.0 based on how recent the experience is.

    ``None`` or ``'present'`` → 1.0 (current role).
    """
    if not end_date_str or end_date_str.lower() == "present":
        return 1.0

    try:
        end = datetime.fromisoformat(end_date_str).date()
    except (ValueError, TypeError):
        return 0.5  # can't parse → mid-range default

    days_ago = (date.today() - end).days
    if days_ago <= 365:
        return 0.9
    if days_ago <= 730:
        return 0.7
    if days_ago <= 1460:
        return 0.4
    return 0.2


def _score_bullet(
    bullet: dict[str, Any],
    required_skills: list[str],
    end_date: str | None,
) -> float:
    """Composite score: skill_overlap×0.6 + impact×0.3 + recency×0.1."""
    bullet_skills = bullet.get("skills", [])
    return (
        _skill_overlap(bullet_skills, required_skills) * 0.6
        + _impact_score(bullet) * 0.3
        + _recency_score(end_date) * 0.1
    )


def _build_reason(
    bullet: dict[str, Any],
    required_skills: list[str],
    score: float,
) -> str:
    """Generate a short human-readable reason for selecting this fragment."""
    matched = {s for s in bullet.get("skills", [])
                if s.lower() in {r.lower() for r in required_skills}}
    parts: list[str] = []
    if matched:
        parts.append(f"matches skills: {', '.join(sorted(matched))}")
    parts.append(f"relevance score {score:.0%}")
    return "; ".join(parts) if parts else "general relevance"


# ── Public API ────────────────────────────────────────────────────────────

def select_fragments(
    jd_analysis: dict[str, Any],
    user_profile: dict[str, Any],
) -> dict[str, list[dict[str, Any]]]:
    """Return the most relevant experience bullets and projects.

    Parameters
    ----------
    jd_analysis : dict
        Output of ``analyze_job_description`` — must contain
        ``required_skills``.
    user_profile : dict
        User profile dict — expected keys ``experience_json`` (list of
        experience entries, each with ``bullets`` list, ``end_date``) and
        ``projects_json`` (list of project entries, each with ``skills``).

    Returns
    -------
    dict with keys ``experience`` and ``projects``, each a list of selected
    fragment dicts augmented with ``selection_reason`` and ``score``.
    """
    required_skills: list[str] = jd_analysis.get("required_skills", [])

    # ── Score & select experience bullets ──────────────────────────────
    scored_experience: list[dict[str, Any]] = []
    for entry in user_profile.get("experience_json", []):
        end_date = entry.get("end_date")
        bullets = entry.get("bullets", [])
        for bullet in bullets:
            score = _score_bullet(bullet, required_skills, end_date)
            scored_experience.append({
                **bullet,
                "company": entry.get("company", ""),
                "role": entry.get("role", ""),
                "score": round(score, 4),
                "selection_reason": _build_reason(bullet, required_skills, score),
            })

    scored_experience.sort(key=lambda b: b["score"], reverse=True)
    selected_experience = scored_experience[:4]  # top 3–4

    # ── Score & select projects ────────────────────────────────────────
    scored_projects: list[dict[str, Any]] = []
    for project in user_profile.get("projects_json", []):
        proj_skills = project.get("skills", [])
        score = _skill_overlap(proj_skills, required_skills)
        scored_projects.append({
            **project,
            "score": round(score, 4),
            "selection_reason": _build_reason(project, required_skills, score),
        })

    scored_projects.sort(key=lambda p: p["score"], reverse=True)
    selected_projects = scored_projects[:3]  # top 2–3

    logger.info(
        "Selected %d experience bullets and %d projects",
        len(selected_experience),
        len(selected_projects),
    )

    return {
        "experience": selected_experience,
        "projects": selected_projects,
    }
