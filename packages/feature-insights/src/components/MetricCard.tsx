import { cn } from '@career-copilot/ui';
import type { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: ReactNode;
  highlight?: boolean;
  className?: string;
}

export function MetricCard({ label, value, sub, icon, highlight, className }: MetricCardProps) {
  return (
    <div className={cn(
      'bg-zinc-900 border rounded-xl p-5',
      highlight ? 'border-blue-500/30' : 'border-zinc-800',
      className
    )}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{label}</p>
          <p className={cn('text-2xl font-bold mt-1', highlight ? 'text-blue-400' : 'text-zinc-100')}>
            {value}
          </p>
          {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
        </div>
        {icon && <div className="text-zinc-600">{icon}</div>}
      </div>
    </div>
  );
}
