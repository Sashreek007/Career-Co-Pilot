import type { ResumeVersion } from '@career-copilot/core';
import { cn } from '@career-copilot/ui';
import { FileText, Sparkles } from 'lucide-react';

interface VersionListProps {
  versions: ResumeVersion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function VersionList({ versions, selectedId, onSelect }: VersionListProps) {
  const base = versions.filter((v) => v.type === 'base');
  const tailored = versions.filter((v) => v.type === 'tailored');

  const renderItem = (v: ResumeVersion) => (
    <button
      key={v.id}
      onClick={() => onSelect(v.id)}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-md flex items-start gap-2.5 transition-colors',
        selectedId === v.id ? 'bg-zinc-700/80 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
      )}
    >
      {v.type === 'base' ? (
        <FileText className="w-4 h-4 mt-0.5 shrink-0" />
      ) : (
        <Sparkles className="w-4 h-4 mt-0.5 shrink-0 text-blue-400" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">
          {v.type === 'base' ? 'Base Resume' : v.company}
        </p>
        {v.jobTitle && <p className="text-xs text-zinc-500 truncate">{v.jobTitle}</p>}
        <div className="flex items-center gap-2 mt-1">
          <span className={`text-xs font-medium ${v.strengthScore >= 80 ? 'text-green-400' : v.strengthScore >= 65 ? 'text-amber-400' : 'text-zinc-500'}`}>
            {v.strengthScore}% strength
          </span>
        </div>
      </div>
    </button>
  );

  return (
    <div className="p-3 space-y-4">
      {base.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-3 mb-1.5">Base</p>
          {base.map(renderItem)}
        </div>
      )}
      {tailored.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-3 mb-1.5">Tailored</p>
          {tailored.map(renderItem)}
        </div>
      )}
    </div>
  );
}
