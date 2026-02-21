"""Resume Compiler — orchestrates the full resume generation pipeline.

Pipeline:
1. Load job from DB
2. Load user profile from DB
3. Analyse job description   (jd_analyzer)
4. Select relevant fragments (fragment_selector)
5. Rewrite bullets           (bullet_rewriter)
6. Compute strength_score
7. Generate resume_version_id
8. INSERT into resume_versions
9. Return the complete resume version dict
"""

import hashlib
import json
import logging
import sqlite3
from datetime import datetime
from typing import Any

from .jd_analyzer import analyze_job_description
from .fragment_selector import select_fragments
from .bullet_rewriter import rewrite_bullet

logger = logging.getLogger(__name__)


def _load_job(job_id: str, db: sqlite3.Connection) -> dict[str, Any] | None:
    row = db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if row is None:
        return None
    job = dict(row)
    if isinstance(job.get("skills_required_json"), str):
        try:
            job["skills_required_json"] = json.loads(job["skills_required_json"])
        except json.JSONDecodeError:
            job["skills_required_json"] = []
    return job


def _load_profile(db: sqlite3.Connection) -> dict[str, Any] | None:
    row = db.execute("SELECT * FROM user_profile WHERE id = 'local'").fetchone()
    if row is None:
        return None
    profile = dict(row)
    # Deserialise JSON columns
    for col in ("skills_json", "experience_json", "projects_json",
                "certifications_json", "role_interests_json"):
        raw = profile.get(col)
        if isinstance(raw, str):
            try:
                profile[col] = json.loads(raw)
            except json.JSONDecodeError:
                profile[col] = []
    return profile


def _compute_strength(jd_analysis: dict, resume_skills: list[str]) -> float:
    """strength_score = |required ∩ resume| / |required|."""
    required = {s.lower() for s in jd_analysis.get("required_skills", [])}
    if not required:
        return 0.0
    present = {s.lower() for s in resume_skills}
    return round(len(required & present) / len(required), 4)


async def compile_resume(
    job_id: str,
    db: sqlite3.Connection,
) -> dict[str, Any]:
    """Generate a tailored resume version for the given job.

    Returns a dict with all ``resume_versions`` columns plus
    ``fragments`` and ``jd_analysis`` for transparency.
    """
    # 1. Load job
    job = _load_job(job_id, db)
    if job is None:
        raise ValueError(f"Job {job_id!r} not found")

    # 2. Load user profile
    profile = _load_profile(db)
    if profile is None:
        raise ValueError("No user profile found — create one first")

    # 3. Analyse job description
    jd_analysis = await analyze_job_description(job.get("description", ""))

    # 4. Select fragments
    fragments = select_fragments(jd_analysis, profile)

    # 5. Rewrite bullets
    domain = jd_analysis.get("domain", "software engineering")
    required_skills = jd_analysis.get("required_skills", [])
    for frag in fragments.get("experience", []):
        original = frag.get("text", "")
        frag["rewritten_text"] = await rewrite_bullet(
            original, required_skills, domain
        )

    # 6. Compute strength score
    all_resume_skills: list[str] = []
    for frag in fragments.get("experience", []):
        all_resume_skills.extend(frag.get("skills", []))
    for frag in fragments.get("projects", []):
        all_resume_skills.extend(frag.get("skills", []))
    # Add user's declared skills
    all_resume_skills.extend(profile.get("skills_json", []))
    strength_score = _compute_strength(jd_analysis, all_resume_skills)

    # 7. Generate resume_version_id
    now = datetime.utcnow().isoformat()
    raw_id = f"{job_id}{now}"
    version_id = "rv-" + hashlib.sha256(raw_id.encode()).hexdigest()[:8]

    # 8. Build content JSON
    content = {
        "profile_name": profile.get("name", ""),
        "profile_email": profile.get("email", ""),
        "profile_phone": profile.get("phone", ""),
        "profile_location": profile.get("location", ""),
        "profile_linkedin": profile.get("linkedin_url", ""),
        "profile_github": profile.get("github_url", ""),
        "summary": profile.get("summary", ""),
        "fragments": fragments,
        "skills": list(set(all_resume_skills)),
        "jd_analysis": jd_analysis,
    }
    label = f"{job.get('title', 'Unknown')} @ {job.get('company', 'Unknown')}"

    # 9. INSERT into resume_versions
    db.execute(
        """INSERT INTO resume_versions
           (id, label, type, job_id, content_json, strength_score, keyword_coverage, skill_alignment, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            version_id,
            label,
            "tailored",
            job_id,
            json.dumps(content),
            strength_score,
            strength_score,   # keyword_coverage ≈ strength for now
            strength_score,   # skill_alignment  ≈ strength for now
            now,
        ),
    )
    db.commit()

    logger.info("Created resume version %s (strength=%.0f%%)", version_id, strength_score * 100)

    return {
        "id": version_id,
        "label": label,
        "type": "tailored",
        "job_id": job_id,
        "content": content,
        "strength_score": strength_score,
        "created_at": now,
    }
