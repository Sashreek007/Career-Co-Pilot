import type { Job } from '@career-copilot/core';
import { delay, MOCK_DELAY_MS } from './types';
import { MOCK_JOBS } from './mock-data/jobs';
import type { ApiResponse } from './types';

export async function getJobs(): Promise<ApiResponse<Job[]>> {
  await delay(MOCK_DELAY_MS);
  return { data: MOCK_JOBS, status: 200 };
}

export async function getJob(id: string): Promise<ApiResponse<Job | null>> {
  await delay(MOCK_DELAY_MS);
  const job = MOCK_JOBS.find((j) => j.id === id) ?? null;
  return { data: job, status: job ? 200 : 404 };
}

export async function markJobInterested(id: string): Promise<ApiResponse<void>> {
  await delay(MOCK_DELAY_MS);
  // stub — real implementation updates local DB
  console.log(`[mock] Marked job ${id} as interested`);
  return { data: undefined, status: 200 };
}
