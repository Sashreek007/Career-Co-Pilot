import type { Skill } from '@career-copilot/core';

const levelColors = {
  expert: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  advanced: 'bg-green-500/15 text-green-400 border-green-500/30',
  intermediate: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  beginner: 'bg-zinc-700/50 text-zinc-400 border-zinc-600/30',
};

export function SkillsSection({ skills }: { skills: Skill[] }) {
  const sorted = [...skills].sort((a, b) => b.confidenceScore - a.confidenceScore);
  return (
    <section>
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Skills</h2>
      <div className="flex flex-wrap gap-2">
        {sorted.map((skill) => (
          <div key={skill.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs ${levelColors[skill.level]}`}>
            <span className="font-medium">{skill.name}</span>
            <span className="opacity-60">{skill.confidenceScore}%</span>
          </div>
        ))}
      </div>
    </section>
  );
}
