import type { ResumeVersion } from '@career-copilot/core';
import { delay, MOCK_DELAY_MS } from './types';
import { MOCK_RESUME_VERSIONS } from './mock-data/resume-versions';
import type { ApiResponse } from './types';

export async function getResumeVersions(): Promise<ApiResponse<ResumeVersion[]>> {
  await delay(MOCK_DELAY_MS);
  return { data: MOCK_RESUME_VERSIONS, status: 200 };
}

export async function getResumeVersion(id: string): Promise<ApiResponse<ResumeVersion | null>> {
  await delay(MOCK_DELAY_MS);
  const version = MOCK_RESUME_VERSIONS.find((r) => r.id === id) ?? null;
  return { data: version, status: version ? 200 : 404 };
}

export async function exportResumeAsJson(id: string): Promise<ApiResponse<ResumeVersion | null>> {
  await delay(MOCK_DELAY_MS);
  const version = MOCK_RESUME_VERSIONS.find((r) => r.id === id) ?? null;
  return { data: version, status: version ? 200 : 404 };
}

export async function exportResumeAsPdf(id: string): Promise<ApiResponse<void>> {
  await delay(MOCK_DELAY_MS);
  // stub — real implementation calls backend LaTeX renderer
  console.log(`[mock] PDF export requested for resume ${id}`);
  return { data: undefined, status: 200 };
}
