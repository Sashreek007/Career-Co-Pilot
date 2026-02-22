import type { Education } from '@career-copilot/core';

function formatRange(item: Education): string {
  const start = (item.startDate ?? '').slice(0, 7);
  const end = item.current ? 'Present' : (item.endDate ?? '').slice(0, 7);
  if (start && end) return `${start} — ${end}`;
  return start || end || '';
}

export function EducationSection({ education }: { education: Education[] }) {
  if (education.length === 0) return null;
  return (
    <section>
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Education</h2>
      <div className="space-y-3">
        {education.map((entry) => {
          const meta = [entry.degree, entry.field].filter(Boolean).join(', ');
          const secondary = [entry.location, entry.gpa ? `GPA: ${entry.gpa}` : ''].filter(Boolean).join(' · ');
          return (
            <div key={entry.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-start justify-between gap-3 mb-1">
                <p className="text-sm font-semibold text-zinc-100">{entry.institution}</p>
                {formatRange(entry) && (
                  <span className="text-xs text-zinc-500 shrink-0">{formatRange(entry)}</span>
                )}
              </div>
              {meta && <p className="text-sm text-zinc-300">{meta}</p>}
              {secondary && <p className="text-xs text-zinc-500 mt-1">{secondary}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

