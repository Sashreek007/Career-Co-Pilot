import { useEffect, useState } from 'react';
import { SplitPane, PageHeader } from '@career-copilot/ui';
import { useJobsStore } from '../state/useJobsStore';
import { JobList } from './JobList';
import { JobDetail } from './JobDetail';
import {
  approveDraft,
  importExternalJob,
  prepareDraft,
  runAssistedConfirmSubmit,
  runAssistedFill,
} from '@career-copilot/api';

interface AssistedReviewState {
  draftId: string;
  screenshotUrl?: string;
  screenshotPath?: string;
}

export function JobFeedPage() {
  const { jobs, selectedJobId, isLoading, fetchJobs, selectJob, markInterested } = useJobsStore();
  const selectedJob = jobs.find((j) => j.id === selectedJobId);
  const [assistedReview, setAssistedReview] = useState<AssistedReviewState | null>(null);
  const [isSubmittingFinal, setIsSubmittingFinal] = useState(false);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const handlePrepareResume = (jobId: string) => {
    // stub — navigate to resume studio with jobId context
    console.log('[stub] Prepare resume for job', jobId);
  };

  const runAssistedApplicationFlow = async (jobId: string) => {
    const targetJob = jobs.find((job) => job.id === jobId);
    if (!targetJob) {
      window.alert('Job not found.');
      return;
    }

    const startAssistedFlow = window.confirm(
      [
        'AI-Assisted Apply opens your browser and runs in user-assisted mode.',
        'You stay in control, and final submission requires a second explicit confirmation.',
        '',
        `Source: ${targetJob.source}`,
        `URL: ${targetJob.sourceUrl || 'not available'}`,
        '',
        'Continue?',
      ].join('\n')
    );
    if (!startAssistedFlow) {
      return;
    }

    const prepared = await prepareDraft(jobId);
    if (prepared.error || !prepared.data.id) {
      window.alert(prepared.error ?? 'Failed to prepare draft.');
      return;
    }

    const approved = await approveDraft(prepared.data.id);
    if (approved.error) {
      window.alert(approved.error);
      return;
    }

    const fillResult = await runAssistedFill(prepared.data.id);
    if (fillResult.error) {
      window.alert(fillResult.error);
      return;
    }

    setAssistedReview({
      draftId: prepared.data.id,
      screenshotUrl: fillResult.data.screenshot_url,
      screenshotPath: fillResult.data.screenshot_path,
    });
  };

  const handleFinalSubmit = async () => {
    if (!assistedReview || isSubmittingFinal) return;
    setIsSubmittingFinal(true);
    const submitted = await runAssistedConfirmSubmit(assistedReview.draftId);
    setIsSubmittingFinal(false);
    if (submitted.error) {
      window.alert(submitted.error);
      return;
    }
    setAssistedReview(null);
    await fetchJobs();
    window.alert(`Application submitted with status: ${submitted.data.status}`);
  };

  const handleReviewLater = () => {
    if (!assistedReview) return;
    window.alert(`Draft ${assistedReview.draftId} is approved and ready for final submit later.`);
    setAssistedReview(null);
  };

  const handlePrepareApplication = (jobId: string) => {
    void runAssistedApplicationFlow(jobId);
  };

  const handleImportExternalJob = async () => {
    const sourceUrl = window.prompt(
      [
        'Paste a direct job posting URL.',
        'LinkedIn tip: use a /jobs/view/<job-id>/ link when possible.',
      ].join('\n')
    );
    if (!sourceUrl) return;

    const title = window.prompt('Job title (optional, leave blank to auto-detect)') ?? '';
    const company = window.prompt('Company name (optional, leave blank to auto-detect)') ?? '';

    const location = window.prompt('Location (optional)', 'Remote') ?? 'Remote';
    const imported = await importExternalJob({
      sourceUrl,
      title: title.trim() || undefined,
      company: company.trim() || undefined,
      location,
    });
    if (imported.error || !imported.data) {
      window.alert(imported.error ?? 'Failed to import external job.');
      return;
    }

    await fetchJobs();
    selectJob(imported.data.id);
    window.alert('External job imported. You can now run Assisted Apply on it.');
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="Job Feed"
            description={`${jobs.length} opportunities matched to your profile`}
          />
          <button
            onClick={() => void handleImportExternalJob()}
            className="mt-1 px-3 py-1.5 rounded-md bg-zinc-700 hover:bg-zinc-600 text-zinc-100 text-xs font-medium transition-colors"
            title="Manually add a job posting URL without scraping"
          >
            Import Job URL
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden mt-4">
        <SplitPane
          leftWidth="w-80"
          left={
            isLoading ? (
              <div className="flex items-center justify-center h-40 text-sm text-zinc-500">
                Loading jobs…
              </div>
            ) : (
              <JobList jobs={jobs} selectedJobId={selectedJobId} onSelect={selectJob} />
            )
          }
          right={
            selectedJob ? (
              <JobDetail
                job={selectedJob}
                onPrepareResume={handlePrepareResume}
                onPrepareApplication={handlePrepareApplication}
                onMarkInterested={markInterested}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-zinc-500">
                Select a job to view details
              </div>
            )
          }
        />
      </div>

      {assistedReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-4xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
            <div className="border-b border-zinc-800 px-5 py-4">
              <h3 className="text-base font-semibold text-zinc-100">Review Browser Activity</h3>
              <p className="mt-1 text-sm text-zinc-400">
                AI-assisted fill completed. Review the captured browser state before final submit.
              </p>
            </div>

            <div className="space-y-3 px-5 py-4">
              {assistedReview.screenshotUrl ? (
                <>
                  <a
                    href={assistedReview.screenshotUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-md bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-600"
                  >
                    Open Full Browser Capture
                  </a>
                  <div className="max-h-[55vh] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950">
                    <img
                      src={assistedReview.screenshotUrl}
                      alt="AI-assisted browser capture"
                      className="block h-auto w-full"
                    />
                  </div>
                </>
              ) : (
                <div className="rounded-md border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                  Screenshot was not returned by backend. You can still finalize manually.
                  {assistedReview.screenshotPath && (
                    <div className="mt-2 font-mono text-[11px] text-amber-300">
                      {assistedReview.screenshotPath}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
              <button
                onClick={handleReviewLater}
                className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
              >
                Review Later
              </button>
              <button
                onClick={() => void handleFinalSubmit()}
                disabled={isSubmittingFinal}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmittingFinal ? 'Submitting...' : 'Final Submit Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
