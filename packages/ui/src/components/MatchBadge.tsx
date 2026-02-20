import type { MatchTier } from '@career-copilot/core';
import { cn } from '../utils/cn';

interface MatchBadgeProps {
  score: number;
  tier: MatchTier;
  className?: string;
}

const tierStyles: Record<MatchTier, string> = {
  high: 'bg-green-500/15 text-green-400 border border-green-500/30',
  medium: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  low: 'bg-zinc-700/50 text-zinc-400 border border-zinc-600/30',
};

export function MatchBadge({ score, tier, className }: MatchBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums',
        tierStyles[tier],
        className
      )}
    >
      {score}% match
    </span>
  );
}
