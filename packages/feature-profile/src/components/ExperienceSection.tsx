import type { Experience } from '@career-copilot/core';

export function ExperienceSection({ experiences }: { experiences: Experience[] }) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Experience</h2>
      <div className="space-y-4">
        {experiences.map((exp) => (
          <div key={exp.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-sm font-semibold text-zinc-100">{exp.role}</p>
                <p className="text-xs text-zinc-400">{exp.company}</p>
              </div>
              <span className="text-xs text-zinc-500 shrink-0">
                {exp.startDate.slice(0, 7)} — {exp.current ? 'Present' : exp.endDate?.slice(0, 7)}
              </span>
            </div>
            <ul className="space-y-1 mt-3">
              {exp.bullets.map((b, i) => (
                <li key={i} className="text-sm text-zinc-300 leading-relaxed">• {b}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-1 mt-3">
              {exp.skills.map((s) => (
                <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{s}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
