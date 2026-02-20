import type { ApplicationDraft, ApplicationStatus } from '@career-copilot/core';
import { delay, MOCK_DELAY_MS } from './types';
import { MOCK_APPLICATIONS } from './mock-data/applications';
import type { ApiResponse } from './types';

// In-memory mutable store for mock drag-and-drop
let drafts = [...MOCK_APPLICATIONS];

export async function getApplicationDrafts(): Promise<ApiResponse<ApplicationDraft[]>> {
  await delay(MOCK_DELAY_MS);
  return { data: drafts, status: 200 };
}

export async function getApplicationDraft(id: string): Promise<ApiResponse<ApplicationDraft | null>> {
  await delay(MOCK_DELAY_MS);
  const draft = drafts.find((d) => d.id === id) ?? null;
  return { data: draft, status: draft ? 200 : 404 };
}

export async function updateDraftStatus(
  id: string,
  status: ApplicationStatus
): Promise<ApiResponse<ApplicationDraft | null>> {
  await delay(MOCK_DELAY_MS);
  drafts = drafts.map((d) => (d.id === id ? { ...d, status } : d));
  const updated = drafts.find((d) => d.id === id) ?? null;
  return { data: updated, status: updated ? 200 : 404 };
}
