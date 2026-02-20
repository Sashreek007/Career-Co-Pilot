import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex h-full min-h-[220px] w-full items-center justify-center p-6',
        className
      )}
    >
      <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-800/40 px-6 py-8 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-700/70 text-zinc-300">
          {icon}
        </div>
        <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
        <p className="mt-1 text-sm text-zinc-400">{description}</p>
        {action ? <div className="mt-4 flex items-center justify-center">{action}</div> : null}
      </div>
    </div>
  );
}
