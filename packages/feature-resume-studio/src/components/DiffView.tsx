import type { ResumeVersion } from '@career-copilot/core';

interface DiffViewProps {
  versionA: ResumeVersion;
  versionB: ResumeVersion;
}

export function DiffView({ versionA, versionB }: DiffViewProps) {
  return (
    <div className="p-6">
      <div className="grid grid-cols-2 gap-4">
        {[versionA, versionB].map((v) => (
          <div key={v.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <div className="mb-4 pb-3 border-b border-zinc-800">
              <p className="text-sm font-semibold text-zinc-200">
                {v.type === 'base' ? 'Base Resume' : `Tailored — ${v.company}`}
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">{v.strengthScore}% strength</p>
            </div>
            <ul className="space-y-2">
              {v.fragments.map((frag) => (
                <li key={frag.id} className="text-sm text-zinc-300 leading-relaxed">
                  • {frag.text}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="text-xs text-zinc-600 text-center mt-4">
        Full diff view (word-level highlighting) coming in next iteration.
      </p>
    </div>
  );
}
