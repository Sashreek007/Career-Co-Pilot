import { useEffect } from 'react';
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

export function JobFeedPage() {
  const { jobs, selectedJobId, isLoading, fetchJobs, selectJob, markInterested } = useJobsStore();
  const selectedJob = jobs.find((j) => j.id === selectedJobId);

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
        'Assisted Apply opens your browser and runs in user-assisted mode.',
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

    const finalConfirmation = window.confirm(
      [
        'Draft fields were filled in assisted mode.',
        fillResult.data.screenshot_path
          ? `Review artifact: ${fillResult.data.screenshot_path}`
          : 'No screenshot path returned.',
        '',
        'Click OK only if you want to perform final submit now.',
      ].join('\n')
    );
    if (!finalConfirmation) {
      window.alert(`Draft ${prepared.data.id} is approved and ready for final submit later.`);
      return;
    }

    const submitted = await runAssistedConfirmSubmit(prepared.data.id);
    if (submitted.error) {
      window.alert(submitted.error);
      return;
    }

    window.alert(`Application submitted with status: ${submitted.data.status}`);
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
    </div>
  );
}
