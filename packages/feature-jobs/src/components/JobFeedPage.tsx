import { useEffect, useMemo, useRef, useState } from 'react';
import type { Job } from '@career-copilot/core';
import { SplitPane, PageHeader } from '@career-copilot/ui';
import { useJobsStore } from '../state/useJobsStore';
import { JobList } from './JobList';
import { JobDetail } from './JobDetail';
import {
  type AssistedProgressEvent,
  type AssistedProgressResult,
  type BrowserDiscoverySource,
  approveDraft,
  getAssistedProgress,
  importExternalJob,
  prepareDraft,
  runBrowserAssistedDiscovery,
  runAssistedConfirmSubmit,
  runAssistedFill,
  sendAssistedGuidance,
} from '@career-copilot/api';

type LocationFilter = 'canada' | 'us' | 'remote' | 'all';
type ActivityTab = 'browser' | 'agent';

const CANADA_HINTS = [
  'canada',
  'toronto',
  'vancouver',
  'montreal',
  'ottawa',
  'calgary',
  'edmonton',
  'winnipeg',
  'quebec',
  'ontario',
  'british columbia',
  'alberta',
  'saskatchewan',
  'manitoba',
  'nova scotia',
  'new brunswick',
  'newfoundland',
  'prince edward',
];

const US_HINTS = [
  'united states',
  ' usa',
  ', usa',
  'new york',
  'san francisco',
  'seattle',
  'los angeles',
  'austin',
  'chicago',
  'boston',
];
const VISUAL_BROWSER_URL = 'http://localhost:7900/?autoconnect=1&resize=scale';

interface AssistedReviewState {
  draftId: string;
  screenshotUrl?: string;
  screenshotPath?: string;
  mode?: string;
  updatedAt?: string | null;
  events: AssistedProgressEvent[];
}

interface NoticeState {
  tone: 'info' | 'success' | 'error';
  message: string;
}

interface ImportFormState {
  sourceUrl: string;
  title: string;
  company: string;
  location: string;
}

interface DiscoveryFormState {
  source: BrowserDiscoverySource;
  query: string;
}

function includesAny(haystack: string, values: string[]): boolean {
  return values.some((value) => haystack.includes(value));
}

function matchesLocationFilter(job: Job, filter: LocationFilter): boolean {
  if (filter === 'all') return true;
  const location = String(job.location ?? '').toLowerCase();
  const remote = Boolean(job.remote) || location.includes('remote');
  if (filter === 'remote') return remote;
  if (filter === 'canada') return includesAny(location, CANADA_HINTS);
  if (filter === 'us') return includesAny(location, US_HINTS);
  return true;
}

function withCacheBust(url: string | undefined, token?: string | null): string | undefined {
  if (!url) return undefined;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}t=${encodeURIComponent(token ?? Date.now().toString())}`;
}

export function JobFeedPage() {
  const { jobs, selectedJobId, isLoading, fetchJobs, selectJob, markInterested } = useJobsStore();
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('canada');
  const [useVisibleBrowser, setUseVisibleBrowser] = useState(true);
  const [assistedReview, setAssistedReview] = useState<AssistedReviewState | null>(null);
  const [isSubmittingFinal, setIsSubmittingFinal] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isRunningFill, setIsRunningFill] = useState(false);
  const [runningDraftId, setRunningDraftId] = useState<string | null>(null);
  const [runningJobUrl, setRunningJobUrl] = useState<string | null>(null);
  const [runningProgress, setRunningProgress] = useState<AssistedProgressResult | null>(null);
  const [guidanceText, setGuidanceText] = useState('');
  const [isSendingGuidance, setIsSendingGuidance] = useState(false);
  const [runningTab, setRunningTab] = useState<ActivityTab>('browser');
  const [reviewTab, setReviewTab] = useState<ActivityTab>('browser');
  const progressTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [startApplyJobId, setStartApplyJobId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [importForm, setImportForm] = useState<ImportFormState>({
    sourceUrl: '',
    title: '',
    company: '',
    location: 'Remote',
  });
  const [discoveryForm, setDiscoveryForm] = useState<DiscoveryFormState>({
    source: 'linkedin',
    query: '',
  });

  const filteredJobs = useMemo(
    () => jobs.filter((job) => matchesLocationFilter(job, locationFilter)),
    [jobs, locationFilter]
  );
  const selectedJob = filteredJobs.find((j) => j.id === selectedJobId) ?? null;
  const startApplyJob = useMemo(
    () => (startApplyJobId ? jobs.find((job) => job.id === startApplyJobId) ?? null : null),
    [jobs, startApplyJobId]
  );

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    if (!filteredJobs.length) return;
    if (!selectedJobId || !filteredJobs.some((job) => job.id === selectedJobId)) {
      selectJob(filteredJobs[0].id);
    }
  }, [filteredJobs, selectedJobId, selectJob]);

  const stopProgressPolling = () => {
    if (progressTimerRef.current !== null) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  };

  const pollProgressOnce = async (draftId: string) => {
    const progress = await getAssistedProgress(draftId);
    if (!progress.error) {
      setRunningProgress(progress.data);
    }
  };

  const startProgressPolling = (draftId: string) => {
    stopProgressPolling();
    void pollProgressOnce(draftId);
    progressTimerRef.current = window.setInterval(() => {
      void pollProgressOnce(draftId);
    }, 1200);
  };

  useEffect(() => () => stopProgressPolling(), []);

  const pushNotice = (message: string, tone: NoticeState['tone'] = 'info') => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
    }
    setNotice({ tone, message });
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 4200);
  };

  useEffect(
    () => () => {
      if (noticeTimerRef.current !== null) {
        window.clearTimeout(noticeTimerRef.current);
      }
    },
    []
  );

  const handlePrepareResume = (jobId: string) => {
    console.log('[stub] Prepare resume for job', jobId);
  };

  const runAssistedApplicationFlow = async (jobId: string) => {
    const targetJob = jobs.find((job) => job.id === jobId);
    if (!targetJob) {
      pushNotice('Job not found.', 'error');
      return;
    }

    const prepared = await prepareDraft(jobId);
    if (prepared.error || !prepared.data.id) {
      pushNotice(prepared.error ?? 'Failed to prepare draft.', 'error');
      return;
    }

    const approved = await approveDraft(prepared.data.id);
    if (approved.error) {
      pushNotice(approved.error, 'error');
      return;
    }

    setRunningTab('browser');
    setRunningProgress(null);
    setGuidanceText('');
    setRunningDraftId(prepared.data.id);
    setRunningJobUrl(targetJob.sourceUrl || null);
    setIsRunningFill(true);
    startProgressPolling(prepared.data.id);

    const fillResult = await runAssistedFill(prepared.data.id, {
      useVisibleBrowser,
      pauseForManualInputSeconds: useVisibleBrowser ? 20 : 0,
    });

    stopProgressPolling();
    const latestProgressResult = await getAssistedProgress(prepared.data.id);
    const latestProgress = latestProgressResult.error ? runningProgress : latestProgressResult.data;
    if (latestProgress) {
      setRunningProgress(latestProgress);
    }

    setIsRunningFill(false);
    setRunningDraftId(null);
    setRunningJobUrl(null);

    if (fillResult.error) {
      pushNotice(fillResult.error, 'error');
      return;
    }

    setReviewTab('browser');
    setAssistedReview({
      draftId: prepared.data.id,
      screenshotUrl: fillResult.data.screenshot_url ?? latestProgress?.latest_screenshot_url,
      screenshotPath: fillResult.data.screenshot_path ?? latestProgress?.latest_screenshot_path,
      mode: fillResult.data.mode ?? latestProgress?.mode,
      updatedAt: latestProgress?.updated_at,
      events: latestProgress?.events ?? [],
    });
  };

  const handleFinalSubmit = async () => {
    if (!assistedReview || isSubmittingFinal) return;
    setIsSubmittingFinal(true);
    const submitted = await runAssistedConfirmSubmit(assistedReview.draftId, {
      useVisibleBrowser,
    });
    setIsSubmittingFinal(false);
    if (submitted.error) {
      pushNotice(submitted.error, 'error');
      return;
    }
    setAssistedReview(null);
    await fetchJobs();
    pushNotice(`Application submitted with status: ${submitted.data.status}`, 'success');
  };

  const handleReviewLater = () => {
    if (!assistedReview) return;
    pushNotice(`Draft ${assistedReview.draftId} is approved and ready for final submit later.`, 'info');
    setAssistedReview(null);
  };

  const handlePrepareApplication = (jobId: string) => {
    setStartApplyJobId(jobId);
  };

  const handleConfirmStartApply = () => {
    if (!startApplyJobId) return;
    const jobId = startApplyJobId;
    setStartApplyJobId(null);
    void runAssistedApplicationFlow(jobId);
  };

  const handleImportExternalJob = async () => {
    const sourceUrl = importForm.sourceUrl.trim();
    if (!sourceUrl) {
      pushNotice('Job URL is required.', 'error');
      return;
    }

    const imported = await importExternalJob({
      sourceUrl,
      title: importForm.title.trim() || undefined,
      company: importForm.company.trim() || undefined,
      location: importForm.location.trim() || 'Remote',
    });
    if (imported.error || !imported.data) {
      pushNotice(imported.error ?? 'Failed to import external job.', 'error');
      return;
    }

    setShowImportModal(false);
    setImportForm({ sourceUrl: '', title: '', company: '', location: 'Remote' });
    await fetchJobs();
    selectJob(imported.data.id);
    pushNotice('External job imported. You can now run Assisted Apply on it.', 'success');
  };

  const openDiscoveryModal = () => {
    const defaultQuery =
      locationFilter === 'canada'
        ? 'software engineer canada'
        : locationFilter === 'us'
          ? 'software engineer united states'
          : 'software engineer remote';
    setDiscoveryForm({ source: 'linkedin', query: defaultQuery });
    setShowDiscoveryModal(true);
  };

  const handleBrowserAssistedDiscovery = async () => {
    const query = discoveryForm.query.trim();
    if (!query) {
      pushNotice('Search query is required.', 'error');
      return;
    }

    setIsDiscovering(true);
    const result = await runBrowserAssistedDiscovery({
      source: discoveryForm.source,
      query,
      useVisibleBrowser,
      waitSeconds: 28,
      maxResults: 35,
      minMatchScore: 0.1,
    });
    setIsDiscovering(false);

    if (result.error) {
      pushNotice(result.error, 'error');
      return;
    }

    setShowDiscoveryModal(false);
    await fetchJobs();
    pushNotice(
      `Discovery complete (${result.data.source}): ${result.data.jobs_new} new jobs imported from ${result.data.jobs_found} found.`,
      'success'
    );
  };

  const handleSendGuidance = async () => {
    const draftId = runningDraftId;
    const message = guidanceText.trim();
    if (!draftId || !message || isSendingGuidance) return;
    setIsSendingGuidance(true);
    const result = await sendAssistedGuidance(draftId, message);
    setIsSendingGuidance(false);
    if (result.error) {
      pushNotice(result.error, 'error');
      return;
    }
    setGuidanceText('');
    pushNotice('Agent guidance applied.', 'success');
    await pollProgressOnce(draftId);
  };

  const runningScreenshotUrl = withCacheBust(
    runningProgress?.latest_screenshot_url,
    runningProgress?.updated_at
  );
  const reviewScreenshotUrl = withCacheBust(assistedReview?.screenshotUrl, assistedReview?.updatedAt);

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6 pb-0">
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="Job Feed"
            description={`${filteredJobs.length} opportunities shown (${locationFilter.toUpperCase()} filter)`}
          />
          <div className="mt-1 flex items-center gap-2">
            <select
              value={locationFilter}
              onChange={(event) => setLocationFilter(event.target.value as LocationFilter)}
              className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100"
              title="Filter visible jobs by location"
            >
              <option value="canada">Canada (default)</option>
              <option value="us">United States</option>
              <option value="remote">Remote</option>
              <option value="all">All locations</option>
            </select>
            <label className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-[11px] text-zinc-200">
              <input
                type="checkbox"
                checked={useVisibleBrowser}
                onChange={(event) => setUseVisibleBrowser(event.target.checked)}
              />
              Visible Browser
            </label>
            <button
              onClick={openDiscoveryModal}
              disabled={isDiscovering}
              className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
              title="Use your browser session to search LinkedIn/Indeed and import matched jobs"
            >
              {isDiscovering ? 'Finding Jobs…' : 'Find via Browser'}
            </button>
            <button
              onClick={() => setShowImportModal(true)}
              className="rounded-md bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-zinc-600"
              title="Manually add a job posting URL without scraping"
            >
              Import Job URL
            </button>
          </div>
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
              <JobList jobs={filteredJobs} selectedJobId={selectedJobId} onSelect={selectJob} />
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

      {notice && (
        <div
          className={`fixed bottom-4 right-4 z-[70] w-full max-w-md rounded-lg border px-4 py-3 shadow-2xl ${
            notice.tone === 'error'
              ? 'border-red-800 bg-red-950/90 text-red-100'
              : notice.tone === 'success'
                ? 'border-emerald-700 bg-emerald-950/90 text-emerald-100'
                : 'border-zinc-700 bg-zinc-900/95 text-zinc-100'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm leading-relaxed">{notice.message}</p>
            <button
              onClick={() => setNotice(null)}
              className="shrink-0 rounded-md bg-black/25 px-2 py-1 text-[11px] font-medium text-zinc-200 hover:bg-black/40"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {startApplyJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setStartApplyJobId(null)} />
          <div className="relative w-full max-w-xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
            <div className="border-b border-zinc-800 px-5 py-4">
              <h3 className="text-base font-semibold text-zinc-100">Start AI-Assisted Apply?</h3>
              <p className="mt-1 text-sm text-zinc-400">
                The agent will fill fields first, then wait for your explicit final submit confirmation.
              </p>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm text-zinc-300">
              <div className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3">
                <p className="font-medium text-zinc-100">
                  {startApplyJob.title} at {startApplyJob.company}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  Source: {startApplyJob.source}
                  {startApplyJob.sourceUrl ? ` • ${startApplyJob.sourceUrl}` : ''}
                </p>
              </div>
              <ul className="space-y-1 text-xs text-zinc-400">
                <li>
                  Mode:{' '}
                  <span className="font-medium text-zinc-200">
                    {useVisibleBrowser ? 'Visible Browser (user can intervene)' : 'Managed Browser'}
                  </span>
                </li>
                <li>Step 1: AI fills draft fields.</li>
                <li>Step 2: You review browser activity.</li>
                <li>Step 3: You decide whether to submit.</li>
              </ul>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
              <button
                onClick={() => setStartApplyJobId(null)}
                className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmStartApply}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
              >
                Start Assisted Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {showDiscoveryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowDiscoveryModal(false)} />
          <div className="relative w-full max-w-lg rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
            <div className="border-b border-zinc-800 px-5 py-4">
              <h3 className="text-base font-semibold text-zinc-100">Find Jobs via Browser</h3>
              <p className="mt-1 text-sm text-zinc-400">
                Search in a user-assisted browser session and import matched jobs.
              </p>
            </div>
            <div className="space-y-4 px-5 py-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Source
                </span>
                <select
                  value={discoveryForm.source}
                  onChange={(event) =>
                    setDiscoveryForm((prev) => ({
                      ...prev,
                      source: event.target.value as BrowserDiscoverySource,
                    }))
                  }
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                >
                  <option value="linkedin">LinkedIn</option>
                  <option value="indeed">Indeed</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Search Query
                </span>
                <input
                  type="text"
                  value={discoveryForm.query}
                  onChange={(event) =>
                    setDiscoveryForm((prev) => ({
                      ...prev,
                      query: event.target.value,
                    }))
                  }
                  placeholder="software engineer canada"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
              <button
                onClick={() => setShowDiscoveryModal(false)}
                disabled={isDiscovering}
                className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleBrowserAssistedDiscovery()}
                disabled={isDiscovering || !discoveryForm.query.trim()}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isDiscovering ? 'Finding…' : 'Find Jobs'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowImportModal(false)} />
          <div className="relative w-full max-w-xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
            <div className="border-b border-zinc-800 px-5 py-4">
              <h3 className="text-base font-semibold text-zinc-100">Import Job URL</h3>
              <p className="mt-1 text-sm text-zinc-400">
                Add a direct posting link without scraping. Title/company can be left blank.
              </p>
            </div>
            <div className="space-y-3 px-5 py-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Job URL
                </span>
                <input
                  type="url"
                  value={importForm.sourceUrl}
                  onChange={(event) =>
                    setImportForm((prev) => ({
                      ...prev,
                      sourceUrl: event.target.value,
                    }))
                  }
                  placeholder="https://www.linkedin.com/jobs/view/..."
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                />
              </label>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Job Title (optional)
                  </span>
                  <input
                    type="text"
                    value={importForm.title}
                    onChange={(event) =>
                      setImportForm((prev) => ({
                        ...prev,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Software Engineer"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Company (optional)
                  </span>
                  <input
                    type="text"
                    value={importForm.company}
                    onChange={(event) =>
                      setImportForm((prev) => ({
                        ...prev,
                        company: event.target.value,
                      }))
                    }
                    placeholder="Company name"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                  Location
                </span>
                <input
                  type="text"
                  value={importForm.location}
                  onChange={(event) =>
                    setImportForm((prev) => ({
                      ...prev,
                      location: event.target.value,
                    }))
                  }
                  placeholder="Remote"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
                />
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 py-4">
              <button
                onClick={() => setShowImportModal(false)}
                className="rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleImportExternalJob()}
                disabled={!importForm.sourceUrl.trim()}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}

      {isRunningFill && runningDraftId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-5xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
            <div className="border-b border-zinc-800 px-5 py-4">
              <h3 className="text-base font-semibold text-zinc-100">AI Browser Operation In Progress</h3>
              <p className="mt-1 text-sm text-zinc-400">
                {useVisibleBrowser
                  ? 'Agent is connected to the visual browser session. You can intervene directly in that browser window.'
                  : 'Agent is running in managed browser mode. Watch screenshots and operator logs below.'}
              </p>
              {useVisibleBrowser && (
                <div className="mt-2">
                  <a
                    href={VISUAL_BROWSER_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-md bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-600"
                  >
                    Open Visual Browser
                  </a>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-3">
              <button
                onClick={() => setRunningTab('browser')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  runningTab === 'browser'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                Browser View
              </button>
              <button
                onClick={() => setRunningTab('agent')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  runningTab === 'agent'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                Agent Log
              </button>
            </div>

            <div className="px-5 py-4">
              {runningTab === 'browser' ? (
                <div className="space-y-3">
                  {runningJobUrl && (
                    <a
                      href={runningJobUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-md bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-600"
                    >
                      Open Job Page
                    </a>
                  )}
                  {runningScreenshotUrl ? (
                    <div className="max-h-[52vh] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950">
                      <img src={runningScreenshotUrl} alt="Live browser progress" className="block h-auto w-full" />
                    </div>
                  ) : (
                    <div className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-3 text-xs text-zinc-400">
                      Waiting for first browser snapshot...
                    </div>
                  )}
                </div>
              ) : (
                <div className="max-h-[52vh] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                  {(runningProgress?.events ?? []).length === 0 ? (
                    <p className="py-3 text-xs text-zinc-500">Waiting for agent events...</p>
                  ) : (
                    <div className="space-y-2">
                      {(runningProgress?.events ?? []).map((event, idx) => (
                        <div key={`${event.at}-${idx}`} className="rounded border border-zinc-800 px-2 py-1.5 text-xs">
                          <p className="text-zinc-200">{event.message}</p>
                          <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">
                            {event.level} • {event.at}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-zinc-800 px-5 py-3">
              <p className="mb-2 text-xs text-zinc-400">
                Draft: {runningDraftId} • Status: {runningProgress?.status ?? 'running'}
              </p>
              <div className="space-y-2">
                <label className="block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  Guide Agent
                </label>
                <div className="flex items-start gap-2">
                  <textarea
                    value={guidanceText}
                    onChange={(event) => setGuidanceText(event.target.value)}
                    placeholder="Example: skip optional survey questions and continue to review page."
                    className="min-h-16 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-xs text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={() => void handleSendGuidance()}
                    disabled={isSendingGuidance || !guidanceText.trim()}
                    className="rounded-md bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isSendingGuidance ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {assistedReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <div className="w-full max-w-5xl rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl">
            <div className="border-b border-zinc-800 px-5 py-4">
              <h3 className="text-base font-semibold text-zinc-100">Review Browser Activity</h3>
              <p className="mt-1 text-sm text-zinc-400">
                AI-assisted fill completed. Validate the result, then trigger final submit.
              </p>
            </div>

            <div className="flex items-center gap-2 border-b border-zinc-800 px-5 py-3">
              <button
                onClick={() => setReviewTab('browser')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  reviewTab === 'browser'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                Browser View
              </button>
              <button
                onClick={() => setReviewTab('agent')}
                className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                  reviewTab === 'agent'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                Agent Log
              </button>
            </div>

            <div className="space-y-3 px-5 py-4">
              {reviewTab === 'browser' ? (
                assistedReview.screenshotUrl ? (
                  <>
                    <a
                      href={assistedReview.screenshotUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-md bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-100 hover:bg-zinc-600"
                    >
                      Open Full Browser Capture
                    </a>
                    <div className="max-h-[52vh] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950">
                      <img
                        src={reviewScreenshotUrl}
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
                )
              ) : (
                <div className="max-h-[52vh] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
                  {assistedReview.events.length === 0 ? (
                    <p className="py-3 text-xs text-zinc-500">No agent events captured.</p>
                  ) : (
                    <div className="space-y-2">
                      {assistedReview.events.map((event, idx) => (
                        <div key={`${event.at}-${idx}`} className="rounded border border-zinc-800 px-2 py-1.5 text-xs">
                          <p className="text-zinc-200">{event.message}</p>
                          <p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">
                            {event.level} • {event.at}
                          </p>
                        </div>
                      ))}
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
