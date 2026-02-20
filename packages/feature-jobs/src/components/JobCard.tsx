import type { Job } from '@career-copilot/core';
import { MatchBadge, StatusPill, cn } from '@career-copilot/ui';
import { Building2 } from 'lucide-react';

interface JobCardProps {
  job: Job;
  isSelected: boolean;
  onClick: () => void;
}

export function JobCard({ job, isSelected, onClick }: JobCardProps) {
  const missingSkills = job.skills.filter((s) => s.required && !s.userHas);

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 border-b border-zinc-800 hover:bg-zinc-800/40 transition-colors',
        isSelected && 'bg-zinc-800/70 border-l-2 border-l-blue-500'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded bg-zinc-700 flex items-center justify-center shrink-0">
            <Building2 className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <span className="text-xs text-zinc-400 truncate">{job.company}</span>
        </div>
        <MatchBadge score={job.matchScore.overall} tier={job.matchScore.tier} />
      </div>

      <p className="text-sm font-medium text-zinc-100 truncate mb-1.5">{job.title}</p>

      <div className="flex items-center gap-2 flex-wrap">
        <StatusPill status={job.status as any} />
        {missingSkills.length > 0 && (
          <span className="text-xs text-zinc-500">
            {missingSkills.length} missing skill{missingSkills.length > 1 ? 's' : ''}
          </span>
        )}
        <span className="text-xs text-zinc-600 ml-auto">
          {job.remote ? 'Remote' : job.location}
        </span>
      </div>
    </button>
  );
}
