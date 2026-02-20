import type { Project } from '@career-copilot/core';

export function ProjectsSection({ projects }: { projects: Project[] }) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Projects</h2>
      <div className="space-y-3">
        {projects.map((proj) => (
          <div key={proj.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 mb-1">
              <p className="text-sm font-semibold text-zinc-100">{proj.name}</p>
              {proj.url && (
                <a href={proj.url} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300 shrink-0">
                  View →
                </a>
              )}
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed mb-2">{proj.description}</p>
            <p className="text-xs text-zinc-300 italic mb-3">"{proj.impactStatement}"</p>
            <div className="flex flex-wrap gap-1">
              {proj.techStack.map((t) => (
                <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{t}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
