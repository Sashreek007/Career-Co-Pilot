import type { Skill } from '@career-copilot/core';

const levelColors = {
  expert: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  advanced: 'bg-green-500/15 text-green-400 border-green-500/30',
  intermediate: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  beginner: 'bg-zinc-700/50 text-zinc-400 border-zinc-600/30',
};

function getBarColor(score: number): string {
  if (score >= 75) return 'bg-green-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-zinc-500';
}

export function SkillsSection({ skills }: { skills: Skill[] }) {
  const sorted = [...skills].sort((a, b) => b.confidenceScore - a.confidenceScore);

  return (
    <section>
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Skills</h2>
      <div className="flex flex-wrap gap-2">
        {sorted.map((skill) => (
          <div key={skill.id} className={`min-w-[140px] px-2.5 py-1.5 rounded-md border text-xs ${levelColors[skill.level]}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium truncate">{skill.name}</span>
              <span className="opacity-70">{skill.confidenceScore}%</span>
            </div>
            <div className="mt-1.5 h-0.5 w-full rounded bg-zinc-700/70 overflow-hidden">
              <div
                className={`h-full rounded ${getBarColor(skill.confidenceScore)}`}
                style={{ width: `${skill.confidenceScore}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
