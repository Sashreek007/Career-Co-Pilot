import type { ReactNode } from 'react';
import { cn } from '../utils/cn';

interface SplitPaneProps {
  left: ReactNode;
  right: ReactNode;
  leftWidth?: string;
  className?: string;
}

export function SplitPane({ left, right, leftWidth = 'w-80', className }: SplitPaneProps) {
  return (
    <div className={cn('flex h-full min-h-0 overflow-hidden', className)}>
      <aside className={cn('shrink-0 min-h-0 border-r border-zinc-800 overflow-y-auto', leftWidth)}>
        {left}
      </aside>
      <main className="flex-1 min-h-0 overflow-y-auto">
        {right}
      </main>
    </div>
  );
}
