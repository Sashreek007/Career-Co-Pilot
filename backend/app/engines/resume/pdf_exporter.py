import json
import os
import re
import shutil
import sqlite3
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

APP_DATA_DIR = Path(__file__).resolve().parents[2] / "data"


class ResumePdfExportError(RuntimeError):
    """Raised when resume PDF export fails."""


def _parse_json(value: Any, fallback: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return fallback
    if value is None:
        return fallback
    return value


def _escape_latex(value: Any) -> str:
    text = str(value or "")
    text = re.sub(r"\s+", " ", text).strip()
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    return "".join(replacements.get(char, char) for char in text)


def _normalise_skill_names(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    names: list[str] = []
    for value in values:
        if isinstance(value, str) and value.strip():
            names.append(value.strip())
            continue
        if isinstance(value, dict):
            name = value.get("name")
            if isinstance(name, str) and name.strip():
                names.append(name.strip())
    return names


def _safe_slug(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return cleaned[:80] or "resume"


def _resolve_export_dir(raw_path: str | None) -> Path:
    configured = (raw_path or "").strip() or "~/Downloads"
    expanded = os.path.expandvars(os.path.expanduser(configured))
    export_dir = Path(expanded)
    if not export_dir.is_absolute():
        export_dir = (APP_DATA_DIR / export_dir).resolve()
    try:
        export_dir.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ResumePdfExportError(
            f"Unable to create export directory: {export_dir}"
        ) from exc
    return export_dir


def _determine_engine() -> tuple[str, list[str]]:
    xelatex = shutil.which("xelatex")
    if xelatex:
        return xelatex, ["-interaction=nonstopmode", "-halt-on-error"]
    pdflatex = shutil.which("pdflatex")
    if pdflatex:
        return pdflatex, ["-interaction=nonstopmode", "-halt-on-error"]
    raise ResumePdfExportError(
        "LaTeX engine not found. Install xelatex or pdflatex in backend runtime."
    )


def _href(url: str, label: str | None = None) -> str:
    clean_url = str(url or "").strip()
    if not clean_url:
        return ""
    display = _escape_latex(label if label is not None else clean_url)
    return rf"\href{{\detokenize{{{clean_url}}}}}{{{display}}}"


def _contact_line(payload: dict[str, Any]) -> str:
    chunks: list[str] = []
    if payload.get("location"):
        chunks.append(_escape_latex(payload["location"]))
    if payload.get("email"):
        chunks.append(_href(f"mailto:{payload['email']}", payload["email"]))
    if payload.get("phone"):
        chunks.append(_escape_latex(payload["phone"]))
    if payload.get("linkedin"):
        chunks.append(_href(payload["linkedin"], "LinkedIn"))
    if payload.get("github"):
        chunks.append(_href(payload["github"], "GitHub"))
    if payload.get("portfolio"):
        chunks.append(_href(payload["portfolio"], "Portfolio"))
    return " \\textbar{} ".join(item for item in chunks if item)


def _render_summary_block(summary: str) -> str:
    if not summary:
        return ""
    return (
        "\\section*{Summary}\n"
        f"{_escape_latex(summary)}\n"
    )


def _render_skills_block(skills: list[str]) -> str:
    cleaned = [_escape_latex(skill) for skill in skills if skill]
    if not cleaned:
        return ""
    joined = " \\textbullet{} ".join(cleaned)
    return (
        "\\section*{Technical Skills}\n"
        f"{joined}\n"
    )


def _render_experience_block(experience: list[dict[str, Any]]) -> str:
    if not experience:
        return ""

    entries: list[str] = ["\\section*{Experience}"]
    for item in experience:
        role = _escape_latex(item.get("role") or "Professional Experience")
        company = _escape_latex(item.get("company") or "")
        text = _escape_latex(item.get("rewritten_text") or item.get("text") or "")
        if not text:
            continue
        header = role
        if company:
            header += f" \\textbar{{}} {company}"
        entries.append(rf"\textbf{{{header}}}")
        entries.append("\\begin{itemize}[leftmargin=*,itemsep=2pt,topsep=2pt]")
        entries.append(rf"\item {text}")
        entries.append("\\end{itemize}")
    return "\n".join(entries)


def _render_projects_block(projects: list[dict[str, Any]]) -> str:
    if not projects:
        return ""

    entries: list[str] = ["\\section*{Projects}"]
    for item in projects:
        name = _escape_latex(item.get("name") or item.get("title") or "Project")
        desc = _escape_latex(item.get("description") or item.get("text") or "")
        impact = _escape_latex(item.get("impact_statement") or "")
        skills = _normalise_skill_names(item.get("skills") or item.get("techStack") or item.get("tech_stack"))
        entries.append(rf"\textbf{{{name}}}")
        entries.append("\\begin{itemize}[leftmargin=*,itemsep=2pt,topsep=2pt]")
        if desc:
            entries.append(rf"\item {desc}")
        if impact:
            entries.append(rf"\item {impact}")
        if skills:
            entries.append(rf"\item \textit{{Tech:}} {_escape_latex(', '.join(skills))}")
        entries.append("\\end{itemize}")
    return "\n".join(entries)


def _render_certifications_block(certifications: list[dict[str, Any]]) -> str:
    if not certifications:
        return ""
    rows = ["\\section*{Certifications}", "\\begin{itemize}[leftmargin=*,itemsep=1pt,topsep=2pt]"]
    for cert in certifications:
        name = _escape_latex(cert.get("name") or "Certification")
        issuer = _escape_latex(cert.get("issuer") or "")
        date_val = _escape_latex(cert.get("dateObtained") or cert.get("date_obtained") or "")
        details = " ".join(part for part in [issuer, date_val] if part)
        if details:
            rows.append(rf"\item \textbf{{{name}}} --- {details}")
        else:
            rows.append(rf"\item \textbf{{{name}}}")
    rows.append("\\end{itemize}")
    return "\n".join(rows)


def _build_common_sections(payload: dict[str, Any]) -> str:
    sections = [
        _render_summary_block(payload.get("summary", "")),
        _render_skills_block(payload.get("skills", [])),
        _render_experience_block(payload.get("experience", [])),
        _render_projects_block(payload.get("projects", [])),
        _render_certifications_block(payload.get("certifications", [])),
    ]
    return "\n\n".join(section for section in sections if section)


def _render_jakes_template(payload: dict[str, Any]) -> str:
    name = _escape_latex(payload.get("name") or "Candidate")
    contact = _contact_line(payload)
    sections = _build_common_sections(payload)
    return rf"""
\documentclass[11pt]{{article}}
\usepackage[a4paper,margin=0.72in]{{geometry}}
\usepackage[hidelinks]{{hyperref}}
\usepackage{{enumitem}}
\usepackage{{titlesec}}
\setlength{{\parindent}}{{0pt}}
\setlength{{\parskip}}{{4pt}}
\pagestyle{{empty}}
\titleformat{{\section}}{{\large\bfseries\scshape\raggedright}}{{}}{{0em}}{{}}[\titlerule]
\begin{{document}}

\begin{{center}}
{{\LARGE \textbf{{{name}}}}}\\[4pt]
{contact}
\end{{center}}

{sections}

\end{{document}}
""".strip()


def _render_minimal_template(payload: dict[str, Any]) -> str:
    name = _escape_latex(payload.get("name") or "Candidate")
    contact = _contact_line(payload)
    sections = _build_common_sections(payload)
    return rf"""
\documentclass[10pt]{{article}}
\usepackage[a4paper,margin=0.7in]{{geometry}}
\usepackage[hidelinks]{{hyperref}}
\usepackage{{enumitem}}
\usepackage{{xcolor}}
\usepackage{{titlesec}}
\setlength{{\parindent}}{{0pt}}
\setlength{{\parskip}}{{3pt}}
\pagestyle{{empty}}
\titleformat{{\section}}{{\normalsize\bfseries\color{{black}}}}{{}}{{0em}}{{}}[\titlerule]
\begin{{document}}

{{\Large \textbf{{{name}}}}}\\[-1pt]
{{\small {contact}}}

{sections}

\end{{document}}
""".strip()


def _render_modern_template(payload: dict[str, Any]) -> str:
    name = _escape_latex(payload.get("name") or "Candidate")
    contact = _contact_line(payload)
    sections = _build_common_sections(payload)
    return rf"""
\documentclass[11pt]{{article}}
\usepackage[a4paper,margin=0.7in]{{geometry}}
\usepackage[hidelinks]{{hyperref}}
\usepackage{{enumitem}}
\usepackage{{xcolor}}
\usepackage{{titlesec}}
\definecolor{{AccentBlue}}{{HTML}}{{1F4F8C}}
\setlength{{\parindent}}{{0pt}}
\setlength{{\parskip}}{{4pt}}
\pagestyle{{empty}}
\titleformat{{\section}}{{\large\bfseries\color{{AccentBlue}}\raggedright}}{{}}{{0em}}{{}}[\color{{AccentBlue}}\titlerule]
\begin{{document}}

{{\LARGE \textbf{{{name}}}}}\\[2pt]
{{\small {contact}}}

\vspace{{2pt}}
\color{{AccentBlue}}\rule{{\linewidth}}{{0.8pt}}\color{{black}}

{sections}

\end{{document}}
""".strip()


def _render_latex(template: str, payload: dict[str, Any]) -> str:
    if template == "minimal":
        return _render_minimal_template(payload)
    if template == "modern":
        return _render_modern_template(payload)
    return _render_jakes_template(payload)


def _build_resume_payload(
    resume: dict[str, Any],
    profile: dict[str, Any],
) -> dict[str, Any]:
    content = _parse_json(resume.get("content_json"), {})
    fragments = content.get("fragments") if isinstance(content, dict) else {}
    fragments = fragments if isinstance(fragments, dict) else {}

    raw_skills = content.get("skills", []) if isinstance(content, dict) else []
    profile_skills = _parse_json(profile.get("skills_json"), [])
    merged_skills = _normalise_skill_names(raw_skills) + _normalise_skill_names(profile_skills)
    deduped_skills: list[str] = []
    seen: set[str] = set()
    for skill in merged_skills:
        key = skill.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped_skills.append(skill)

    experience = fragments.get("experience", []) if isinstance(fragments, dict) else []
    projects = fragments.get("projects", []) if isinstance(fragments, dict) else []
    certifications = _parse_json(profile.get("certifications_json"), [])

    return {
        "name": content.get("profile_name") or profile.get("name") or "",
        "email": content.get("profile_email") or profile.get("email") or "",
        "phone": content.get("profile_phone") or profile.get("phone") or "",
        "location": content.get("profile_location") or profile.get("location") or "",
        "linkedin": content.get("profile_linkedin") or profile.get("linkedin_url") or "",
        "github": content.get("profile_github") or profile.get("github_url") or "",
        "portfolio": profile.get("portfolio_url") or "",
        "summary": content.get("summary") or profile.get("summary") or "",
        "skills": deduped_skills[:24],
        "experience": experience if isinstance(experience, list) else [],
        "projects": projects if isinstance(projects, list) else [],
        "certifications": certifications if isinstance(certifications, list) else [],
    }


def _compile_latex(
    latex_source: str,
    output_tex_path: Path,
    output_pdf_path: Path,
) -> None:
    engine, args = _determine_engine()

    with tempfile.TemporaryDirectory(prefix="resume-export-") as tmp_dir:
        tmp = Path(tmp_dir)
        tex_file = tmp / "resume.tex"
        pdf_file = tmp / "resume.pdf"
        tex_file.write_text(latex_source, encoding="utf-8")

        for _ in range(2):
            result = subprocess.run(
                [engine, *args, tex_file.name],
                cwd=tmp,
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode != 0:
                snippet = (result.stderr or result.stdout or "").strip()
                snippet = snippet[-1200:]
                raise ResumePdfExportError(f"LaTeX compilation failed. {snippet}")

        if not pdf_file.exists():
            raise ResumePdfExportError("LaTeX compilation completed without producing a PDF file.")

        output_tex_path.write_text(latex_source, encoding="utf-8")
        shutil.copy2(pdf_file, output_pdf_path)


def export_resume_pdf(resume_id: str, db: sqlite3.Connection) -> dict[str, str]:
    resume_row = db.execute(
        "SELECT * FROM resume_versions WHERE id = ?",
        (resume_id,),
    ).fetchone()
    if resume_row is None:
        raise ValueError("Resume not found")

    profile_row = db.execute(
        "SELECT * FROM user_profile WHERE id = 'local'",
    ).fetchone()
    profile = dict(profile_row) if profile_row is not None else {}

    settings_row = db.execute(
        "SELECT default_resume_template, export_path FROM settings WHERE id = 1",
    ).fetchone()
    if settings_row is None:
        template = "jakes"
        export_path_raw = "~/Downloads"
    else:
        template = str(settings_row["default_resume_template"] or "jakes")
        export_path_raw = str(settings_row["export_path"] or "~/Downloads")

    if template not in {"jakes", "minimal", "modern"}:
        template = "jakes"

    resume = dict(resume_row)
    payload = _build_resume_payload(resume, profile)
    latex_source = _render_latex(template, payload)

    export_dir = _resolve_export_dir(export_path_raw)
    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    base_name = _safe_slug(f"{payload.get('name') or 'resume'}-{template}-{resume_id}-{timestamp}")
    tex_path = export_dir / f"{base_name}.tex"
    pdf_path = export_dir / f"{base_name}.pdf"

    _compile_latex(latex_source, tex_path, pdf_path)

    return {
        "template": template,
        "export_dir": str(export_dir),
        "tex_path": str(tex_path),
        "pdf_path": str(pdf_path),
        "filename": pdf_path.name,
    }
