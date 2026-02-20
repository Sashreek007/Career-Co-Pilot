import type { InsightsMetrics } from '@career-copilot/core';
import { delay, MOCK_DELAY_MS } from './types';
import { MOCK_INSIGHTS } from './mock-data/insights';
import type { ApiResponse } from './types';

export async function getInsights(): Promise<ApiResponse<InsightsMetrics>> {
  await delay(MOCK_DELAY_MS);
  return { data: MOCK_INSIGHTS, status: 200 };
}
