import type { ResumeVersion } from '@career-copilot/core';

interface DiffViewProps {
  versionA: ResumeVersion;
  versionB: ResumeVersion;
}

export function DiffView({ versionA, versionB }: DiffViewProps) {
  const versionAIds = new Set(versionA.fragments.map((frag) => frag.id));
  const versionBIds = new Set(versionB.fragments.map((frag) => frag.id));

  return (
    <div className="p-6">
      <div className="grid grid-cols-2 gap-4">
        {[versionA, versionB].map((v, index) => {
          const comparisonSet = index === 0 ? versionBIds : versionAIds;
          const uniqueBorder = index === 0 ? 'border-red-500/60' : 'border-green-500/60';

          return (
            <div key={v.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="mb-4 pb-3 border-b border-zinc-800">
                <p className="text-sm font-semibold text-zinc-200">
                  {v.type === 'base' ? 'Base Resume' : `Tailored — ${v.company}`}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">{v.strengthScore}% strength</p>
                <p className="text-xs text-zinc-500 mt-1">
                  {v.fragments.length} fragments, strength {v.strengthScore}%
                </p>
              </div>
              <ul className="space-y-2">
                {v.fragments.map((frag) => {
                  const isUnique = !comparisonSet.has(frag.id);
                  return (
                    <li
                      key={frag.id}
                      className={`text-sm text-zinc-300 leading-relaxed pl-2 border-l-2 ${
                        isUnique ? uniqueBorder : 'border-transparent'
                      }`}
                    >
                      • {frag.text}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-zinc-600 text-center mt-4">
        Full diff view (word-level highlighting) coming in next iteration.
      </p>
    </div>
  );
}
