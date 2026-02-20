import type { UserProfile } from '@career-copilot/core';
import { delay, MOCK_DELAY_MS } from './types';
import { MOCK_PROFILE } from './mock-data/profile';
import type { ApiResponse } from './types';

let profile = { ...MOCK_PROFILE };

export async function getProfile(): Promise<ApiResponse<UserProfile>> {
  await delay(MOCK_DELAY_MS);
  return { data: profile, status: 200 };
}

export async function updateProfile(partial: Partial<UserProfile>): Promise<ApiResponse<UserProfile>> {
  await delay(MOCK_DELAY_MS);
  profile = { ...profile, ...partial, updatedAt: new Date().toISOString() };
  return { data: profile, status: 200 };
}
