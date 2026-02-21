import { useEffect, useMemo, useRef, useState } from 'react';
import type { Job, UserProfile } from '@career-copilot/core';
import { SplitPane, PageHeader } from '@career-copilot/ui';
import { useJobsStore } from '../state/useJobsStore';
import { JobList } from './JobList';
import { JobDetail } from './JobDetail';
import {
  type AssistedProgressEvent,
  type AssistedProgressResult,
  type BrowserConnectionStatus,
  type BrowserDiscoverySource,
  type ChatMessage,
  approveDraft,
  checkBrowserConnection,
  getChatMessages,
  getAssistedProgress,
  getProfile,
  importExternalJob,
  postChatMessage,
  prepareDraft,
  runBrowserAssistedDiscovery,
  runAssistedConfirmSubmit,
  runAssistedFill,
} from '@career-copilot/api';

type LocationFilter = 'canada' | 'us' | 'remote' | 'all';
type ActivityTab = 'browser' | 'agent' | 'chat';

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

const MACOS_CHROME_DEBUG_COMMAND =
  'open -na "Google Chrome" --args --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --user-data-dir=/tmp/career-copilot-cdp';
const WINDOWS_CHROME_DEBUG_COMMAND =
  'chrome.exe --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --user-data-dir=%TEMP%\\career-copilot-cdp';
const VERIFY_CDP_COMMAND = 'curl http://localhost:9222/json/version';

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

interface AutoDiscoveryPlan {
  role: string;
  locationHint: string;
  query: string;
  sources: BrowserDiscoverySource[];
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

function pickLocationHint(filter: LocationFilter, profile: UserProfile | null): string {
  if (filter === 'canada') return 'canada';
  if (filter === 'us') return 'united states';
  if (filter === 'remote') return 'remote';
  const firstRoleLocation = profile?.roleInterests?.[0]?.locations?.[0]?.trim();
  if (firstRoleLocation) return firstRoleLocation;
  const profileLocation = profile?.location?.trim();
  if (profileLocation) return profileLocation;
  return 'canada';
}

function buildAutoDiscoveryPlan(filter: LocationFilter, profile: UserProfile | null): AutoDiscoveryPlan {
  const role =
    profile?.roleInterests?.map((item) => item.title.trim()).find((title) => Boolean(title)) ||
    'software engineer';
  const locationHint = pickLocationHint(filter, profile);
  const query = `${role} ${locationHint}`.replace(/\s+/g, ' ').trim();
  return {
    role,
    locationHint,
    query,
    sources: ['linkedin', 'indeed'],
  };
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
  const [runningTab, setRunningTab] = useState<ActivityTab>('browser');
  const [reviewTab, setReviewTab] = useState<ActivityTab>('browser');
  const progressTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [startApplyJobId, setStartApplyJobId] = useState<string | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false);
  const [isPlanningDiscovery, setIsPlanningDiscovery] = useState(false);
  const [browserStatus, setBrowserStatus] = useState<BrowserConnectionStatus | null>(null);
  const [isCheckingBrowser, setIsCheckingBrowser] = useState(false);
  const [autoDiscoveryPlan, setAutoDiscoveryPlan] = useState<AutoDiscoveryPlan | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingChat, setIsSendingChat] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [importForm, setImportForm] = useState<ImportFormState>({
    sourceUrl: '',
    title: '',
    company: '',
    location: 'Remote',
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
    const [progress, chat] = await Promise.all([
      getAssistedProgress(draftId),
      getChatMessages(draftId),
    ]);
    if (!progress.error) {
      setRunningProgress(progress.data);
    }
    if (!chat.error) {
      setChatMessages(chat.data.messages);
      // Auto-scroll to bottom when new messages arrive
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  const startProgressPolling = (draftId: string) => {
    stopProgressPolling();
    setChatMessages([]);
    void pollProgressOnce(draftId);
    progressTimerRef.current = window.setInterval(() => {
      void pollProgressOnce(draftId);
    }, 1200);
  };

  useEffect(() => () => stopProgressPolling(), []);

  const handleSendChat = async () => {
    const draftId = runningDraftId;
    const text = chatInput.trim();
    if (!draftId || !text || isSendingChat) return;
    setIsSendingChat(true);
    setChatInput('');
    const result = await postChatMessage(draftId, text);
    setIsSendingChat(false);
    if (result.error) {
      pushNotice(result.error, 'error');
      return;
    }
    setChatMessages(result.data.messages);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

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

  const copyCommand = async (command: string, label: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(command);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = command;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      pushNotice(`${label} command copied. Paste and run it in terminal.`, 'success');
    } catch {
      pushNotice(`Could not copy ${label} command. Copy it manually.`, 'error');
    }
  };

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

  const handleCheckBrowser = async () => {
    setIsCheckingBrowser(true);
    const result = await checkBrowserConnection();
    setBrowserStatus(result.data);
    setIsCheckingBrowser(false);
  };

  const openDiscoveryModal = async () => {
    setShowDiscoveryModal(true);
    setIsPlanningDiscovery(true);
    setAutoDiscoveryPlan(null);
    await handleCheckBrowser();
    try {
      const profileResult = await getProfile();
      const profile = profileResult.error ? null : profileResult.data ?? null;
      setAutoDiscoveryPlan(buildAutoDiscoveryPlan(locationFilter, profile));
    } catch {
      setAutoDiscoveryPlan(buildAutoDiscoveryPlan(locationFilter, null));
    } finally {
      setIsPlanningDiscovery(false);
    }
  };

  const handleBrowserAssistedDiscovery = async () => {
    const plan = autoDiscoveryPlan ?? buildAutoDiscoveryPlan(locationFilter, null);
    const query = plan.query.trim();
    if (!query) {
      pushNotice('Search query is required.', 'error');
      return;
    }

    setIsDiscovering(true);
    let totalFound = 0;
    let totalNew = 0;
    let successCount = 0;
    const errors: string[] = [];
    for (const source of plan.sources) {
      const result = await runBrowserAssistedDiscovery({
        source,
        query,
        useVisibleBrowser,
        waitSeconds: 8,
        maxResults: 35,
        minMatchScore: 0.0,
      });
      if (result.error) {
        errors.push(`${source}: ${result.error}`);
        continue;
      }
      successCount += 1;
      totalFound += result.data.jobs_found;
      totalNew += result.data.jobs_new;
    }
    setIsDiscovering(false);

    if (successCount === 0) {
      pushNotice(errors[0] ?? 'AI browser search failed.', 'error');
      return;
    }

    setShowDiscoveryModal(false);
    await fetchJobs();
    pushNotice(
      `AI auto-search complete: ${totalNew} new jobs imported from ${totalFound} found across ${successCount} source(s).`,
      'success'
    );
    if (errors.length) {
      pushNotice(
        `Some sources failed: ${errors.slice(0, 2).join(' | ')}`,
        'info'
      );
    }
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
              onClick={() => void openDiscoveryModal()}
              disabled={isDiscovering}
              className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-medium text-zinc-100 transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-70"
              title="AI agent auto-selects source/query, controls your browser, and imports matched jobs"
            >
              {isDiscovering ? 'Searching…' : 'AI Auto Search'}
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
              <h3 className="text-base font-semibold text-zinc-100">AI Auto Search</h3>
              <p className="mt-1 text-sm text-zinc-400">
                Agent auto-picks source and query from your profile, then operates your visible browser.
              </p>
            </div>

            <div className="border-b border-zinc-800 px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {isCheckingBrowser ? (
                    <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-500" />
                  ) : browserStatus?.connected ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                  )}
                  <span className="text-xs text-zinc-300">
                    {isCheckingBrowser
                      ? 'Checking Chrome connection…'
                      : browserStatus?.connected
                        ? `Chrome connected${browserStatus.browser_info?.browser ? ` — ${browserStatus.browser_info.browser}` : ''}`
                        : browserStatus
                          ? 'Chrome not detected'
                          : 'Browser status unknown'}
                  </span>
                </div>
                <button
                  onClick={() => void handleCheckBrowser()}
                  disabled={isCheckingBrowser}
                  className="rounded-md bg-zinc-800 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                >
                  {isCheckingBrowser ? 'Checking…' : 'Re-check'}
                </button>
              </div>

              {!isCheckingBrowser && browserStatus && !browserStatus.connected && (
                <div className="mt-3 rounded-md border border-amber-700/40 bg-amber-950/30 px-3 py-2.5">
                  <p className="mb-1.5 text-xs font-medium text-amber-200">
                    Start Chrome with remote debugging to connect:
                  </p>
                  <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-amber-300">
                    {browserStatus.how_to_start}
                  </pre>
                  <div className="mt-3 space-y-2">
                    <div className="rounded-md border border-zinc-700/70 bg-zinc-950/70 p-2">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-zinc-300">macOS</span>
                        <button
                          onClick={() => void copyCommand(MACOS_CHROME_DEBUG_COMMAND, 'macOS')}
                          className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-200 hover:bg-zinc-700"
                        >
                          Copy
                        </button>
                      </div>
                      <code className="block break-all font-mono text-[11px] text-zinc-200">
                        {MACOS_CHROME_DEBUG_COMMAND}
                      </code>
                    </div>
                    <div className="rounded-md border border-zinc-700/70 bg-zinc-950/70 p-2">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-zinc-300">Windows</span>
                        <button
                          onClick={() => void copyCommand(WINDOWS_CHROME_DEBUG_COMMAND, 'Windows')}
                          className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-200 hover:bg-zinc-700"
                        >
                          Copy
                        </button>
                      </div>
                      <code className="block break-all font-mono text-[11px] text-zinc-200">
                        {WINDOWS_CHROME_DEBUG_COMMAND}
                      </code>
                    </div>
                    <div className="rounded-md border border-zinc-700/70 bg-zinc-950/70 p-2">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[11px] font-medium text-zinc-300">Verify</span>
                        <button
                          onClick={() => void copyCommand(VERIFY_CDP_COMMAND, 'Verify')}
                          className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-200 hover:bg-zinc-700"
                        >
                          Copy
                        </button>
                      </div>
                      <code className="block break-all font-mono text-[11px] text-zinc-200">
                        {VERIFY_CDP_COMMAND}
                      </code>
                    </div>
                  </div>
                  {browserStatus.error && (
                    <p className="mt-1.5 text-[11px] text-amber-400/70">{browserStatus.error}</p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4 px-5 py-4">
              {isPlanningDiscovery ? (
                <div className="rounded-md border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-xs text-zinc-400">
                  Building AI search plan from your profile…
                </div>
              ) : autoDiscoveryPlan ? (
                <div className="space-y-2 rounded-md border border-zinc-700 bg-zinc-950/70 p-3 text-sm">
                  <p className="text-zinc-300">
                    <span className="text-zinc-500">Role:</span> {autoDiscoveryPlan.role}
                  </p>
                  <p className="text-zinc-300">
                    <span className="text-zinc-500">Location Hint:</span> {autoDiscoveryPlan.locationHint}
                  </p>
                  <p className="text-zinc-300">
                    <span className="text-zinc-500">Query:</span> {autoDiscoveryPlan.query}
                  </p>
                  <p className="text-zinc-300">
                    <span className="text-zinc-500">Sources:</span>{' '}
                    {autoDiscoveryPlan.sources.join(', ')}
                  </p>
                </div>
              ) : (
                <div className="rounded-md border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-xs text-zinc-400">
                  Could not build profile-based plan, using fallback query.
                </div>
              )}
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
                disabled={
                  isDiscovering ||
                  isPlanningDiscovery ||
                  !browserStatus?.connected
                }
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isDiscovering ? 'Searching…' : 'Run Auto Search'}
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
                  ? 'Agent is connected to your local Chrome via CDP. Intervene directly in that Chrome window at any time.'
                  : 'Agent is running in managed browser mode. Watch screenshots and operator logs below.'}
              </p>
              {useVisibleBrowser && (
                <div className="mt-2 rounded-md border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-xs text-zinc-300">
                  Keep your Chrome window open with remote debugging on port 9222.
                  The agent will operate that same session live.
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
              <button
                onClick={() => setRunningTab('chat')}
                className={`relative rounded-md px-3 py-1.5 text-xs font-medium ${
                  runningTab === 'chat'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                Chat
                {chatMessages.length > 0 && runningTab !== 'chat' && (
                  <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-[9px] text-white">
                    {chatMessages.filter((m) => m.role === 'ai').length}
                  </span>
                )}
              </button>
              <span className="ml-auto text-[11px] text-zinc-500">
                {runningProgress?.status ?? 'running'}
              </span>
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
              ) : runningTab === 'agent' ? (
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
              ) : (
                /* Chat panel */
                <div className="flex flex-col" style={{ height: '52vh' }}>
                  {/* Message thread */}
                  <div className="flex-1 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-3">
                    {chatMessages.length === 0 ? (
                      <p className="py-4 text-center text-xs text-zinc-500">
                        The AI will send messages here when it needs your input.
                      </p>
                    ) : (
                      chatMessages.map((msg, idx) => (
                        <div
                          key={`${msg.at}-${idx}`}
                          className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                              msg.role === 'user'
                                ? 'rounded-br-sm bg-blue-600 text-white'
                                : 'rounded-bl-sm border border-zinc-700 bg-zinc-800 text-zinc-100'
                            }`}
                          >
                            {msg.role === 'ai' && (
                              <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                                AI Agent
                              </p>
                            )}
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                            <p className={`mt-1 text-[10px] ${msg.role === 'user' ? 'text-blue-200' : 'text-zinc-500'}`}>
                              {new Date(msg.at).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Input bar */}
                  <div className="mt-2 flex items-end gap-2">
                    <textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendChat();
                        }
                      }}
                      placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                      rows={2}
                      className="flex-1 resize-none rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => void handleSendChat()}
                      disabled={isSendingChat || !chatInput.trim()}
                      className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSendingChat ? '…' : 'Send'}
                    </button>
                  </div>
                </div>
              )}
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
              <button
                onClick={() => setReviewTab('chat')}
                className={`relative rounded-md px-3 py-1.5 text-xs font-medium ${
                  reviewTab === 'chat'
                    ? 'bg-blue-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                Chat
                {chatMessages.length > 0 && reviewTab !== 'chat' && (
                  <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-blue-500 text-[9px] text-white">
                    {chatMessages.filter((m) => m.role === 'ai').length}
                  </span>
                )}
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
              ) : reviewTab === 'agent' ? (
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
              ) : (
                /* Chat history (read-only in review — fill is done) */
                <div className="max-h-[52vh] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-3">
                  {chatMessages.length === 0 ? (
                    <p className="py-4 text-center text-xs text-zinc-500">No chat messages from this session.</p>
                  ) : (
                    chatMessages.map((msg, idx) => (
                      <div
                        key={`${msg.at}-${idx}`}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                            msg.role === 'user'
                              ? 'rounded-br-sm bg-blue-600 text-white'
                              : 'rounded-bl-sm border border-zinc-700 bg-zinc-800 text-zinc-100'
                          }`}
                        >
                          {msg.role === 'ai' && (
                            <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
                              AI Agent
                            </p>
                          )}
                          <p className="whitespace-pre-wrap">{msg.text}</p>
                          <p className={`mt-1 text-[10px] ${msg.role === 'user' ? 'text-blue-200' : 'text-zinc-500'}`}>
                            {new Date(msg.at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))
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
