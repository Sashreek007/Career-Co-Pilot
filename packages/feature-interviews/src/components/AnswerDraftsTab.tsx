import type { InterviewKit } from '@career-copilot/core';

const starBorderColors: Record<string, string> = {
  situation: 'border-l-2 border-zinc-600',
  task: 'border-l-2 border-blue-500/40',
  action: 'border-l-2 border-blue-500',
  result: 'border-l-2 border-green-500',
  reflection: 'border-l-2 border-amber-500',
};

export function AnswerDraftsTab({ kit }: { kit: InterviewKit }) {
  if (kit.answerDrafts.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-sm text-zinc-500">
        No answer drafts yet — they will be generated when AI is connected.
      </div>
    );
  }

  return (
    <div className="px-6 py-5 space-y-5">
      {kit.answerDrafts.map((draft) => {
        const question = kit.questions.find((q) => q.id === draft.questionId);
        const questionText = question?.question ?? question?.text ?? '[REQUIRES_REVIEW: missing question text]';
        return (
          <div key={draft.questionId} className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
            {question && (
              <p className="text-sm font-medium text-zinc-300 mb-4 pb-3 border-b border-zinc-800">
                {questionText}
              </p>
            )}
            <div className="space-y-3">
              {(['situation', 'task', 'action', 'result', 'reflection'] as const).map((key) => (
                <div key={key} className={`pl-3 ${starBorderColors[key]}`}>
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    {key}
                  </span>
                  <p className="text-sm text-zinc-200 mt-1 leading-relaxed">{draft[key]}</p>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
