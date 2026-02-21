import { useState } from 'react';
import type { InterviewKit } from '@career-copilot/core';
import { useInterviewsStore } from '../state/useInterviewsStore';
import { ChevronRight } from 'lucide-react';

export function MockSimulatorTab({ kit }: { kit: InterviewKit }) {
  const { currentQuestionIndex, advanceQuestion } = useInterviewsStore();
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const question = kit.questions[currentQuestionIndex];

  const handleSubmit = () => {
    if (!answer.trim()) return;
    setSubmitted(true);
  };

  const handleNext = () => {
    advanceQuestion();
    setAnswer('');
    setSubmitted(false);
  };

  if (!question) return null;

  const progressPercent = ((currentQuestionIndex + 1) / kit.questions.length) * 100;

  return (
    <div className="px-6 py-5 max-w-2xl">
      {/* Progress bar */}
      <div className="w-full h-1 bg-zinc-800 rounded-full mb-4 overflow-hidden">
        <div
          className="h-1 bg-blue-500 rounded-full transition-all duration-300"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      <div className="mb-2 flex items-center gap-2 text-xs text-zinc-500">
        <span>Question {currentQuestionIndex + 1} of {kit.questions.length}</span>
        <span className="text-zinc-700">·</span>
        <span className="capitalize">{question.category.replace('_', ' ')}</span>
        <span className="text-zinc-700">·</span>
        <span className="capitalize">{question.difficulty}</span>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-4">
        <p className="text-base text-zinc-100 leading-relaxed">{question.text}</p>
        {question.contextNotes && (
          <p className="text-xs text-zinc-500 mt-2">{question.contextNotes}</p>
        )}
      </div>

      {!submitted ? (
        <>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer here…"
            rows={8}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={handleSubmit}
            disabled={!answer.trim()}
            className="mt-3 px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
          >
            Submit Answer
          </button>
        </>
      ) : (
        <div className="space-y-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Your Answer</p>
            <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">{answer}</p>
          </div>

          <div className="bg-zinc-900 border border-blue-500/20 rounded-xl p-5">
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-3">Feedback</p>
            <p className="text-sm text-zinc-400">
              AI scoring coming soon — connect Gemini API key in Settings to enable automatic scoring.
            </p>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {['Structure', 'Relevance', 'Depth', 'Specificity', 'Clarity'].map((dim) => (
                <div key={dim} className="text-center">
                  <div className="text-xs text-zinc-500 mb-1">{dim}</div>
                  <div className="text-sm font-semibold text-zinc-600">—</div>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleNext}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium transition-colors"
          >
            Next Question
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
