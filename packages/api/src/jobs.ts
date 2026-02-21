import type { Job } from '@career-copilot/core';
import { delay, MOCK_DELAY_MS } from './types';
import { MOCK_JOBS } from './mock-data/jobs';
import type { ApiResponse } from './types';

type BackendJobSkill = {
  name?: string;
  required?: boolean;
  userHas?: boolean;
};

type BackendJob = {
  id: string;
  title: string;
  company: string;
  location?: string | null;
  remote?: number | boolean | null;
  description?: string | null;
  skills_required_json?: BackendJobSkill[] | string[] | null;
  source?: string | null;
  source_url?: string | null;
  match_score?: number | null;
  match_tier?: string | null;
  posted_date?: string | null;
  discovered_at?: string | null;
};

export interface ImportJobInput {
  sourceUrl: string;
  title?: string;
  company?: string;
  location?: string;
  description?: string;
  remote?: boolean;
}

function toErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }
  return fallback;
}

function normaliseTier(
  tier: string | null | undefined,
  scorePercent: number
): 'high' | 'medium' | 'low' {
  if (tier === 'high' || tier === 'medium' || tier === 'low') {
    return tier;
  }
  if (scorePercent >= 70) return 'high';
  if (scorePercent >= 40) return 'medium';
  return 'low';
}

function mapSkills(raw: BackendJob['skills_required_json']): Job['skills'] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === 'string') {
        const name = item.trim();
        if (!name) return null;
        return { name, required: true, userHas: false };
      }
      if (item && typeof item === 'object') {
        const name = String(item.name ?? '').trim();
        if (!name) return null;
        return {
          name,
          required: Boolean(item.required ?? true),
          userHas: Boolean(item.userHas ?? false),
        };
      }
      return null;
    })
    .filter((item): item is Job['skills'][number] => item !== null);
}

function mapBackendJob(job: BackendJob): Job {
  const rawScore = Number(job.match_score ?? 0);
  const clamped = Number.isFinite(rawScore) ? Math.max(0, Math.min(1, rawScore)) : 0;
  const overall = Math.round(clamped * 100);
  const tier = normaliseTier(job.match_tier, overall);
  const skills = mapSkills(job.skills_required_json);

  return {
    id: String(job.id),
    title: String(job.title ?? ''),
    company: String(job.company ?? ''),
    location: String(job.location ?? 'Remote'),
    remote: Boolean(job.remote),
    description: String(job.description ?? ''),
    skills,
    matchScore: {
      overall,
      tier,
      skillMatch: overall,
      experienceAlignment: overall,
      roleAlignment: overall,
      gapPenalty: Math.max(0, 100 - overall),
    },
    status: 'new',
    source: String(job.source ?? 'discovery'),
    sourceUrl: String(job.source_url ?? ''),
    postedDate: String(job.posted_date ?? job.discovered_at ?? ''),
    createdAt: String(job.discovered_at ?? new Date().toISOString()),
  };
}

async function fetchBackendJobs(): Promise<Job[]> {
  const response = await fetch('/api/jobs');
  if (!response.ok) {
    throw new Error(`Failed to fetch jobs from backend (${response.status})`);
  }
  const payload = await response.json();
  if (!Array.isArray(payload)) {
    return [];
  }
  return payload.map((item) => mapBackendJob(item as BackendJob));
}

export async function getJobs(): Promise<ApiResponse<Job[]>> {
  await delay(MOCK_DELAY_MS);
  try {
    const data = await fetchBackendJobs();
    if (data.length > 0) {
      return { data, status: 200 };
    }
  } catch {
    // Fallback to mock feed when backend is unavailable.
  }
  return { data: MOCK_JOBS, status: 200 };
}

export async function getJob(id: string): Promise<ApiResponse<Job | null>> {
  const jobs = await getJobs();
  const job = jobs.data.find((item) => item.id === id) ?? null;
  return { data: job, status: job ? 200 : 404 };
}

export async function markJobInterested(id: string): Promise<ApiResponse<void>> {
  await delay(MOCK_DELAY_MS);
  // stub — real implementation updates local DB
  console.log(`[mock] Marked job ${id} as interested`);
  return { data: undefined, status: 200 };
}

export async function importExternalJob(input: ImportJobInput): Promise<ApiResponse<Job | null>> {
  const response = await fetch('/api/jobs/import-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_url: input.sourceUrl,
      title: input.title,
      company: input.company,
      location: input.location,
      description: input.description,
      remote: Boolean(input.remote),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: null,
      error: toErrorMessage(payload, 'Failed to import external job'),
      status: response.status,
    };
  }
  return { data: mapBackendJob(payload as BackendJob), status: response.status };
}
