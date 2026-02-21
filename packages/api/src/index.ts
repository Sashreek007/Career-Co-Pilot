export type { ApiResponse } from './types';
export { delay, MOCK_DELAY_MS } from './types';

export { getJobs, getJob, markJobInterested, importExternalJob } from './jobs';
export { getResumeVersions, getResumeVersion, exportResumeAsJson, exportResumeAsPdf } from './resumes';
export { getApplicationDrafts, getApplicationDraft, updateDraftStatus } from './applications';
export {
  prepareDraft,
  approveDraft,
  runAssistedFill,
  runAssistedConfirmSubmit,
  getAssistedProgress,
  sendAssistedGuidance,
} from './drafts';
export type {
  AssistedProgressResult,
  AssistedRunOptions,
  AssistedProgressEvent,
  AssistedGuidanceResult,
} from './drafts';
export { runBrowserAssistedDiscovery } from './discovery';
export type { BrowserAssistedDiscoveryInput, BrowserAssistedDiscoveryResult, BrowserDiscoverySource } from './discovery';
export { getInterviewKit, getInterviewKits } from './interviews';
export { getProfile, updateProfile } from './profile';
export { getInsights } from './insights';
export { getSettings, updateSettings } from './settings';
export type { AppSettings } from './settings';

// Mock data exports (for seeding stores directly if needed)
export { MOCK_JOBS } from './mock-data/jobs';
export { MOCK_RESUME_VERSIONS } from './mock-data/resume-versions';
export { MOCK_APPLICATIONS } from './mock-data/applications';
export { MOCK_INTERVIEW_KITS } from './mock-data/interview-kits';
export { MOCK_PROFILE } from './mock-data/profile';
export { MOCK_INSIGHTS } from './mock-data/insights';
