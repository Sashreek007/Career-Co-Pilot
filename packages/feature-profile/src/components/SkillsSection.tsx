import type { Skill } from '@career-copilot/core';

export function SkillsSection({ skills }: { skills: Skill[] }) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Skills</h2>
      <div className="flex flex-wrap gap-2">
        {skills.map((skill) => (
          <span
            key={skill.id}
            className="inline-flex items-center rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200"
          >
            {skill.name}
          </span>
        ))}
      </div>
    </section>
  );
}
