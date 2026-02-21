import { useState } from 'react';
import type { InterviewKit, QuestionCategory } from '@career-copilot/core';

const categoryLabel: Record<QuestionCategory, string> = {
  technical: 'Technical',
  behavioral: 'Behavioral',
  company_specific: 'Company Specific',
};

const difficultyColors = {
  easy: 'text-green-400 bg-green-500/10 border-green-500/20',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  hard: 'text-red-400 bg-red-500/10 border-red-500/20',
};

export function QuestionsTab({ kit }: { kit: InterviewKit }) {
  const categories: QuestionCategory[] = ['technical', 'behavioral', 'company_specific'];
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="px-6 py-5 space-y-6">
      {categories.map((cat) => {
        const questions = kit.questions.filter((q) => q.category === cat);
        if (questions.length === 0) return null;
        return (
          <section key={cat}>
            <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">
              {categoryLabel[cat]}
            </h3>
            <div className="space-y-2">
              {questions.map((q) => {
                const isExpanded = expandedId === q.id;
                return (
                  <div
                    key={q.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 cursor-pointer transition-colors hover:border-zinc-700"
                    onClick={() => toggleExpand(q.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm text-zinc-100 leading-relaxed">{q.text}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border shrink-0 ${difficultyColors[q.difficulty]}`}>
                        {q.difficulty}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-zinc-800 space-y-2">
                        {q.contextNotes && (
                          <p className="text-xs text-zinc-500 leading-relaxed">{q.contextNotes}</p>
                        )}
                        {q.skills.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {q.skills.map((s) => (
                              <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{s}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
