import { useEffect } from 'react';
import { SplitPane, PageHeader } from '@career-copilot/ui';
import { useJobsStore } from '../state/useJobsStore';
import { JobList } from './JobList';
import { JobDetail } from './JobDetail';

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

  const handlePrepareApplication = (jobId: string) => {
    // stub — navigate to applications
    console.log('[stub] Prepare application for job', jobId);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-0">
        <PageHeader
          title="Job Feed"
          description={`${jobs.length} opportunities matched to your profile`}
        />
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
