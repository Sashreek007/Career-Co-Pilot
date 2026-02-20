import type { ApplicationDraft } from '@career-copilot/core';
import { StatusPill, MatchBadge } from '@career-copilot/ui';
import { X } from 'lucide-react';

interface ApplicationDetailModalProps {
  draft: ApplicationDraft;
  onEdit: (draftId: string) => void;
  onSubmitApplication: (draftId: string) => void;
  onMarkInterview: (draftId: string) => void;
  onClose: () => void;
}

export function ApplicationDetailModal({
  draft,
  onEdit,
  onSubmitApplication,
  onMarkInterview,
  onClose,
}: ApplicationDetailModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-zinc-800">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">{draft.jobTitle}</h2>
            <p className="text-sm text-zinc-400 mt-0.5">{draft.company}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Status + Match */}
          <div className="flex items-center gap-3">
            <StatusPill status={draft.status} />
            <MatchBadge
              score={draft.matchScore}
              tier={draft.matchScore >= 80 ? 'high' : draft.matchScore >= 60 ? 'medium' : 'low'}
            />
          </div>

          {/* Resume Version */}
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Resume Version</p>
            <p className="text-sm text-zinc-200">{draft.resumeVersionId}</p>
          </div>

          {/* Missing Skills */}
          {draft.missingSkills.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Missing Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {draft.missingSkills.map((skill) => (
                  <span key={skill} className="text-xs px-2 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Cover Letter preview */}
          {draft.coverLetter && (
            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Cover Letter</p>
              <p className="text-sm text-zinc-300 leading-relaxed line-clamp-4">{draft.coverLetter}</p>
            </div>
          )}

          {/* Answers preview */}
          {Object.keys(draft.answers).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Screening Answers</p>
              <div className="space-y-3">
                {Object.entries(draft.answers).map(([q, a]) => (
                  <div key={q}>
                    <p className="text-xs text-zinc-400 mb-1">{q}</p>
                    <p className="text-sm text-zinc-300 line-clamp-3">{a}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dates */}
          <div className="text-xs text-zinc-500 space-y-1 pt-2 border-t border-zinc-800">
            <p>Created: {new Date(draft.createdAt).toLocaleDateString()}</p>
            {draft.submittedAt && <p>Submitted: {new Date(draft.submittedAt).toLocaleDateString()}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
            <button
              onClick={() => onEdit(draft.id)}
              className="px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors"
            >
              Edit
            </button>
            {draft.status === 'approved' && (
              <button
                onClick={() => onSubmitApplication(draft.id)}
                className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
              >
                Submit Application
              </button>
            )}
            {draft.status === 'submitted' && (
              <button
                onClick={() => onMarkInterview(draft.id)}
                className="px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-colors"
              >
                Mark as Interview
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
