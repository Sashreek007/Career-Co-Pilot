"""Interview Kit Generator — produces tailored interview prep material.

Triggered when an application moves to status='interview'.

Pipeline:
1. Load application + job + resume_version from DB
2. Classify interview type from job description keywords
3. Call Gemini to generate 10-12 questions (JSON)
4. Generate STAR answer drafts for top 3 behavioral questions
5. INSERT into interview_kits table
6. Return the kit
"""

import hashlib
import json
import logging
import sqlite3
from datetime import datetime
from typing import Any

from ..resume.jd_analyzer import _extract_skills  # reuse skill extraction
from ...clients.gemini import get_gemini_client

logger = logging.getLogger(__name__)


# ── Interview type classification ─────────────────────────────────────────

_TYPE_KEYWORDS: dict[str, list[str]] = {
    "technical_coding": ["algorithm", "leetcode", "coding", "data structure", "whiteboard"],
    "system_design": ["architecture", "scalability", "distributed", "system design", "high availability"],
    "behavioral": ["stakeholder", "collaboration", "leadership", "teamwork", "conflict"],
}


def classify_interview_type(description: str) -> str:
    """Return the most likely interview type based on keyword matching."""
    text_lower = description.lower()
    scores: dict[str, int] = {}
    for itype, keywords in _TYPE_KEYWORDS.items():
        scores[itype] = sum(1 for kw in keywords if kw in text_lower)

    best = max(scores, key=scores.get)  # type: ignore[arg-type]
    if scores[best] == 0:
        return "mixed"
    return best


# ── Question generation ───────────────────────────────────────────────────

_QUESTION_PROMPT = (
    "You are an expert technical interviewer. Generate {count} interview questions "
    "for a {interview_type} interview for the role of {job_title} at {company}.\n\n"
    "Return ONLY valid JSON — an array of objects, each with keys:\n"
    "  text (string), category ('technical'|'behavioral'|'company_specific'), "
    "  difficulty ('easy'|'medium'|'hard'), context_notes (string), skills_tested (array of strings)\n\n"
    "Mix categories roughly: 50% technical, 30% behavioral, 20% company-specific.\n"
    "Job description excerpt:\n{description}\n\n"
    "Return ONLY the JSON array, no markdown, no explanation."
)


async def _generate_questions(
    job: dict[str, Any],
    interview_type: str,
    count: int = 12,
) -> list[dict[str, Any]]:
    """Call Gemini to generate interview questions, or return defaults."""
    client = get_gemini_client()
    if client is None:
        return _fallback_questions(interview_type)

    try:
        prompt = _QUESTION_PROMPT.format(
            count=count,
            interview_type=interview_type.replace("_", " "),
            job_title=job.get("title", "Software Engineer"),
            company=job.get("company", "the company"),
            description=(job.get("description", ""))[:3000],
        )
        response = await client.generate_content_async(prompt)
        raw = response.text.strip()

        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            raw = raw.rsplit("```", 1)[0]

        questions = json.loads(raw)
        if isinstance(questions, list):
            # Normalise keys to match our schema
            normalised: list[dict[str, Any]] = []
            for i, q in enumerate(questions):
                normalised.append({
                    "id": f"q-{i+1:02d}",
                    "text": q.get("text", ""),
                    "category": q.get("category", "technical"),
                    "difficulty": q.get("difficulty", "medium"),
                    "contextNotes": q.get("context_notes", ""),
                    "skills": q.get("skills_tested", []),
                })
            return normalised

        return _fallback_questions(interview_type)
    except Exception:
        logger.exception("Gemini question generation failed — using fallback")
        return _fallback_questions(interview_type)


def _fallback_questions(interview_type: str) -> list[dict[str, Any]]:
    """Static fallback questions when Gemini is unavailable."""
    base: list[dict[str, Any]] = [
        {"id": "q-01", "text": "Tell me about yourself and your background.", "category": "behavioral", "difficulty": "easy", "contextNotes": "Opening question — keep under 2 minutes.", "skills": []},
        {"id": "q-02", "text": "Describe a challenging technical problem you solved.", "category": "technical", "difficulty": "medium", "contextNotes": "Use the STAR method.", "skills": ["problem solving"]},
        {"id": "q-03", "text": "How do you handle disagreements with team members?", "category": "behavioral", "difficulty": "medium", "contextNotes": "Focus on communication and resolution.", "skills": ["teamwork"]},
        {"id": "q-04", "text": "Walk me through the architecture of a system you built.", "category": "technical", "difficulty": "hard", "contextNotes": "Discuss trade-offs and scalability.", "skills": ["system design"]},
        {"id": "q-05", "text": "Why are you interested in this company?", "category": "company_specific", "difficulty": "easy", "contextNotes": "Research the company beforehand.", "skills": []},
        {"id": "q-06", "text": "Describe a time you led a project or initiative.", "category": "behavioral", "difficulty": "medium", "contextNotes": "Highlight leadership and ownership.", "skills": ["leadership"]},
        {"id": "q-07", "text": "How would you optimise a slow database query?", "category": "technical", "difficulty": "medium", "contextNotes": "Discuss indexing, query plans, denormalisation.", "skills": ["databases", "performance"]},
        {"id": "q-08", "text": "Explain a concept you know well to a non-technical audience.", "category": "behavioral", "difficulty": "easy", "contextNotes": "Tests communication clarity.", "skills": ["communication"]},
        {"id": "q-09", "text": "Design a URL shortener service.", "category": "technical", "difficulty": "hard", "contextNotes": "Classic system design question.", "skills": ["system design", "distributed systems"]},
        {"id": "q-10", "text": "Where do you see yourself in 3-5 years?", "category": "company_specific", "difficulty": "easy", "contextNotes": "Align with role growth path.", "skills": []},
    ]
    return base


# ── STAR answer drafts ────────────────────────────────────────────────────

_STAR_PROMPT = (
    "Generate a STAR-format answer draft for this interview question, "
    "using the candidate's background.\n\n"
    "Question: {question}\n\n"
    "Candidate background:\n"
    "- Skills: {skills}\n"
    "- Recent role: {recent_role}\n\n"
    "Return ONLY valid JSON with keys: situation, task, action, result, reflection.\n"
    "Each value should be 1-2 sentences. Do NOT invent facts — use generic phrasing "
    "that the candidate can customise.\n"
    "Return ONLY the JSON object, no markdown."
)


async def _generate_star_drafts(
    questions: list[dict[str, Any]],
    profile: dict[str, Any],
) -> list[dict[str, Any]]:
    """Generate STAR drafts for the top 3 behavioral questions."""
    behavioral = [q for q in questions if q.get("category") == "behavioral"][:3]
    if not behavioral:
        return []

    client = get_gemini_client()
    drafts: list[dict[str, Any]] = []

    skills_str = ", ".join((profile.get("skills_json") or [])[:15])
    experience = profile.get("experience_json") or []
    recent_role = ""
    if experience:
        first = experience[0] if isinstance(experience, list) else {}
        recent_role = f"{first.get('role', '')} at {first.get('company', '')}"

    for q in behavioral:
        draft: dict[str, Any] = {
            "questionId": q["id"],
            "situation": "Describe the context and setting.",
            "task": "Explain what you needed to accomplish.",
            "action": "Detail the specific steps you took.",
            "result": "Share the measurable outcome.",
            "reflection": "What did you learn from this experience?",
        }

        if client is not None:
            try:
                prompt = _STAR_PROMPT.format(
                    question=q["text"],
                    skills=skills_str,
                    recent_role=recent_role,
                )
                response = await client.generate_content_async(prompt)
                raw = response.text.strip()
                if raw.startswith("```"):
                    raw = raw.split("\n", 1)[1]
                    raw = raw.rsplit("```", 1)[0]
                parsed = json.loads(raw)
                draft = {"questionId": q["id"], **parsed}
            except Exception:
                logger.exception("STAR draft generation failed for q=%s", q["id"])

        drafts.append(draft)

    return drafts


# ── Public API ────────────────────────────────────────────────────────────

async def generate_interview_kit(
    application_id: str,
    db: sqlite3.Connection,
) -> dict[str, Any]:
    """Generate a full interview kit for an application.

    Expects the application to reference a valid job. Inserts the kit
    into ``interview_kits`` and returns it.
    """
    # Load application
    app_row = db.execute(
        "SELECT * FROM application_drafts WHERE id = ?",
        (application_id,),
    ).fetchone()
    if app_row is None:
        raise ValueError(f"Application {application_id!r} not found")
    application = dict(app_row)

    # Load job
    job_id = application.get("job_id")
    job_row = db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if job_row is None:
        raise ValueError(f"Job {job_id!r} not found for application")
    job = dict(job_row)

    # Load user profile
    profile_row = db.execute("SELECT * FROM user_profile WHERE id = 'local'").fetchone()
    profile: dict[str, Any] = {}
    if profile_row:
        profile = dict(profile_row)
        for col in ("skills_json", "experience_json", "projects_json"):
            raw = profile.get(col)
            if isinstance(raw, str):
                try:
                    profile[col] = json.loads(raw)
                except json.JSONDecodeError:
                    profile[col] = []

    # Classify interview type
    interview_type = classify_interview_type(job.get("description", ""))

    # Generate questions
    questions = await _generate_questions(job, interview_type)

    # Generate STAR drafts
    answer_drafts = await _generate_star_drafts(questions, profile)

    # Build kit ID
    now = datetime.utcnow().isoformat()
    kit_id = "kit-" + hashlib.sha256(f"{application_id}{now}".encode()).hexdigest()[:8]

    # INSERT into interview_kits
    db.execute(
        """INSERT INTO interview_kits
           (id, application_id, interview_type, company_profile_json,
            question_bank_json, answer_drafts_json, mock_scores_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            kit_id,
            application_id,
            interview_type,
            json.dumps({"company": job.get("company", ""), "title": job.get("title", "")}),
            json.dumps(questions),
            json.dumps(answer_drafts),
            json.dumps([]),  # no mock scores yet
            now,
        ),
    )
    db.commit()

    logger.info("Created interview kit %s (type=%s, questions=%d)", kit_id, interview_type, len(questions))

    return {
        "id": kit_id,
        "applicationId": application_id,
        "jobTitle": job.get("title", ""),
        "company": job.get("company", ""),
        "interviewType": interview_type,
        "questions": questions,
        "answerDrafts": answer_drafts,
        "mockScores": [],
        "createdAt": now,
    }
