import type { RoleInterest } from '@career-copilot/core';
import { Wifi } from 'lucide-react';

export function RoleInterestsSection({ interests }: { interests: RoleInterest[] }) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Target Roles</h2>
      <div className="flex flex-wrap gap-2">
        {interests.map((ri) => (
          <div key={ri.id} className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-100">{ri.title}</span>
              <span className="text-xs text-zinc-500 capitalize">{ri.seniority}</span>
              {ri.remote && <Wifi className="w-3 h-3 text-zinc-500" />}
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {ri.domains.map((d) => (
                <span key={d} className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{d}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
