import type { ApplicationStatus } from '@career-copilot/core';
import { cn } from '../utils/cn';

interface StatusPillProps {
  status: ApplicationStatus;
  className?: string;
}

const statusStyles: Record<ApplicationStatus, string> = {
  drafted: 'bg-zinc-700/60 text-zinc-300',
  approved: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  submitted: 'bg-sky-500/15 text-sky-400 border border-sky-500/30',
  interview: 'bg-violet-500/15 text-violet-400 border border-violet-500/30',
  offer: 'bg-green-500/15 text-green-400 border border-green-500/30',
  rejected: 'bg-red-500/15 text-red-400 border border-red-500/30',
  archived: 'bg-zinc-700/40 text-zinc-500',
};

const statusLabel: Record<ApplicationStatus, string> = {
  drafted: 'Drafted',
  approved: 'Approved',
  submitted: 'Submitted',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  archived: 'Archived',
};

export function StatusPill({ status, className }: StatusPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        statusStyles[status],
        className
      )}
    >
      {statusLabel[status]}
    </span>
  );
}
