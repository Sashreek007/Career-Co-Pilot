import { useDraggable } from '@dnd-kit/core';
import type { ApplicationDraft } from '@career-copilot/core';
import { MatchBadge, cn } from '@career-copilot/ui';
import { Building2 } from 'lucide-react';

interface ApplicationCardProps {
  draft: ApplicationDraft;
  onClick: () => void;
}

export function ApplicationCard({ draft, onClick }: ApplicationCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: draft.id,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'bg-zinc-900 border border-zinc-800 rounded-lg p-3 cursor-grab active:cursor-grabbing select-none',
        isDragging && 'opacity-50 shadow-xl ring-1 ring-blue-500/50'
      )}
      onClick={(e) => {
        // Only trigger click if not dragging
        if (!isDragging) onClick();
        e.stopPropagation();
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-5 h-5 rounded bg-zinc-700 flex items-center justify-center shrink-0">
          <Building2 className="w-3 h-3 text-zinc-400" />
        </div>
        <span className="text-xs text-zinc-400 truncate">{draft.company}</span>
        <MatchBadge score={draft.matchScore} tier={draft.matchScore >= 80 ? 'high' : draft.matchScore >= 60 ? 'medium' : 'low'} className="ml-auto shrink-0" />
      </div>
      <p className="text-sm font-medium text-zinc-100 truncate">{draft.jobTitle}</p>
      {draft.missingSkills.length > 0 && (
        <p className="text-xs text-zinc-500 mt-1">
          {draft.missingSkills.slice(0, 2).join(', ')}
          {draft.missingSkills.length > 2 ? ` +${draft.missingSkills.length - 2} more` : ''}
        </p>
      )}
    </div>
  );
}
