import { cn } from '@career-copilot/ui';
import type { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: ReactNode;
  highlight?: boolean;
  trend?: 'up' | 'down' | 'flat';
  className?: string;
}

const trendConfig = {
  up: { symbol: '↑', color: 'text-green-400' },
  down: { symbol: '↓', color: 'text-red-400' },
  flat: { symbol: '→', color: 'text-zinc-500' },
};

export function MetricCard({ label, value, sub, icon, highlight, trend, className }: MetricCardProps) {
  return (
    <div className={cn(
      'bg-zinc-900 border rounded-xl p-5',
      highlight ? 'border-blue-500/30' : 'border-zinc-800',
      className
    )}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{label}</p>
          <div className="flex items-baseline gap-1.5 mt-1">
            <p className={cn('text-2xl font-bold', highlight ? 'text-blue-400' : 'text-zinc-100')}>
              {value}
            </p>
            {trend && (
              <span className={cn('text-sm font-semibold', trendConfig[trend].color)}>
                {trendConfig[trend].symbol}
              </span>
            )}
          </div>
          {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
        </div>
        {icon && <div className="text-zinc-600">{icon}</div>}
      </div>
    </div>
  );
}
