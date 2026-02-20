import type { ResumeVersion } from '@career-copilot/core';

interface ResumePreviewProps {
  version: ResumeVersion;
}

export function ResumePreview({ version }: ResumePreviewProps) {
  const scoreBarColor =
    version.strengthScore >= 80
      ? 'bg-green-500'
      : version.strengthScore >= 65
        ? 'bg-amber-500'
        : 'bg-zinc-500';

  return (
    <div className="p-6">
      <div className="max-w-2xl mx-auto bg-zinc-900 border border-zinc-800 rounded-xl p-8 space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Resume Match</span>
            <span className="font-medium text-zinc-300">{version.strengthScore}%</span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`${scoreBarColor} h-full transition-all duration-300`}
              style={{ width: `${Math.max(0, Math.min(100, version.strengthScore))}%` }}
            />
          </div>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span>Keyword coverage: {version.keywordCoverage}%</span>
            <span>Skill alignment: {version.skillAlignment}%</span>
          </div>
        </div>

        {/* Header */}
        <div className="border-b border-zinc-800 pb-4">
          <h2 className="text-xl font-bold text-zinc-100">Alex Chen</h2>
          <p className="text-sm text-zinc-400 mt-1">alex.chen@university.edu · github.com/alexchen-dev · alexchen.dev</p>
          {version.type === 'tailored' && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded-full px-2 py-0.5">
                Tailored for {version.company}
              </span>
              <span className="text-xs text-zinc-500">{version.strengthScore}% match strength</span>
            </div>
          )}
        </div>

        {/* Fragments */}
        {version.fragments.length > 0 ? (
          <div className="space-y-5">
            {['experience', 'project', 'achievement'].map((section) => {
              const items = version.fragments.filter((f) => f.section === section);
              if (items.length === 0) return null;
              return (
                <div key={section}>
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
                    {section === 'experience' ? 'Experience' : section === 'project' ? 'Projects' : 'Achievements'}
                  </h3>
                  <ul className="space-y-3">
                    {items.map((frag) => (
                      <li key={frag.id} className="group">
                        <p className="text-sm text-zinc-200 leading-relaxed">• {frag.text}</p>
                        {frag.reasonIncluded && (
                          <p className="text-xs text-blue-400/70 mt-1 hidden group-hover:block">
                            ↳ {frag.reasonIncluded}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {frag.skillTags.map((tag) => (
                            <span key={tag} className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-zinc-500 text-center py-8">No fragments yet — generate a tailored version to populate.</p>
        )}
      </div>
    </div>
  );
}
