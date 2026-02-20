import { useDroppable } from '@dnd-kit/core';
import { useEffect, useState } from 'react';
import type { ApplicationDraft, ApplicationStatus } from '@career-copilot/core';
import { cn } from '@career-copilot/ui';
import { ApplicationCard } from './ApplicationCard';

interface KanbanColumnProps {
  status: ApplicationStatus;
  label: string;
  drafts: ApplicationDraft[];
  onCardClick: (draft: ApplicationDraft) => void;
}

const columnColors: Record<string, string> = {
  drafted: 'border-zinc-700',
  approved: 'border-blue-500/40',
  submitted: 'border-sky-500/40',
  interview: 'border-violet-500/40',
  offer: 'border-green-500/40',
};

export function KanbanColumn({ status, label, drafts, onCardClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [animateCount, setAnimateCount] = useState(false);

  useEffect(() => {
    setAnimateCount(true);
    const t = window.setTimeout(() => setAnimateCount(false), 180);
    return () => window.clearTimeout(t);
  }, [drafts.length]);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col min-w-[220px] w-[220px] rounded-lg border bg-zinc-900/50',
        columnColors[status] ?? 'border-zinc-800',
        isOver && 'ring-1 ring-blue-500/50 bg-zinc-800/50'
      )}
    >
      {/* Column Header */}
      <div className="px-3 py-2.5 border-b border-zinc-800 flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">{label}</span>
        <span
          className={cn(
            'text-xs text-zinc-500 bg-zinc-800 rounded-full px-2 py-0.5 transition-transform duration-150',
            animateCount && 'scale-110'
          )}
        >
          {drafts.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[100px]">
        {drafts.map((draft) => (
          <ApplicationCard
            key={draft.id}
            draft={draft}
            onClick={() => onCardClick(draft)}
          />
        ))}
        {drafts.length === 0 && (
          <div className="flex items-center justify-center h-16 text-xs text-zinc-600/80">
            Drop cards here
          </div>
        )}
      </div>
    </div>
  );
}
