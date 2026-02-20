import type { InterviewKit } from '@career-copilot/core';
import { delay, MOCK_DELAY_MS } from './types';
import { MOCK_INTERVIEW_KITS } from './mock-data/interview-kits';
import type { ApiResponse } from './types';

export async function getInterviewKit(applicationId: string): Promise<ApiResponse<InterviewKit | null>> {
  await delay(MOCK_DELAY_MS);
  const kit = MOCK_INTERVIEW_KITS.find((k) => k.applicationId === applicationId) ?? null;
  // fallback to first kit if none found (for demo purposes)
  return { data: kit ?? MOCK_INTERVIEW_KITS[0] ?? null, status: 200 };
}

export async function getInterviewKits(): Promise<ApiResponse<InterviewKit[]>> {
  await delay(MOCK_DELAY_MS);
  return { data: MOCK_INTERVIEW_KITS, status: 200 };
}
