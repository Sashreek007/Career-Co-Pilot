import type { ApiResponse } from './types';

export interface BrowserConnectionStatus {
  connected: boolean;
  endpoint: string;
  browser_info: { browser?: string; webSocketDebuggerUrl?: string };
  error: string | null;
  how_to_start: string;
}

export type BrowserDiscoverySource = 'linkedin' | 'indeed';

export interface BrowserAssistedDiscoveryInput {
  source: BrowserDiscoverySource;
  query: string;
  maxResults?: number;
  minMatchScore?: number;
  useVisibleBrowser?: boolean;
  cdpEndpoint?: string;
  waitSeconds?: number;
}

export interface BrowserAssistedDiscoveryResult {
  run_id: string;
  status: string;
  mode: string;
  source: string;
  query: string;
  jobs_found: number;
  jobs_new: number;
  min_match_score: number;
  started_at: string;
  completed_at?: string;
}

function toErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }
  return fallback;
}

export async function runBrowserAssistedDiscovery(
  input: BrowserAssistedDiscoveryInput
): Promise<ApiResponse<BrowserAssistedDiscoveryResult>> {
  const response = await fetch('/api/discovery/browser-assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: input.source,
      query: input.query,
      max_results: Number(input.maxResults ?? 20),
      min_match_score: Number(input.minMatchScore ?? 0.15),
      use_visible_browser: Boolean(input.useVisibleBrowser ?? true),
      cdp_endpoint: input.cdpEndpoint,
      wait_seconds: Number(input.waitSeconds ?? 25),
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    return {
      data: {
        run_id: '',
        status: 'failed',
        mode: 'unknown',
        source: input.source,
        query: input.query,
        jobs_found: 0,
        jobs_new: 0,
        min_match_score: Number(input.minMatchScore ?? 0.15),
        started_at: new Date().toISOString(),
      },
      error: toErrorMessage(payload, 'Browser-assisted discovery failed'),
      status: response.status,
    };
  }

  return {
    data: {
      run_id: String(payload.run_id ?? ''),
      status: String(payload.status ?? 'completed'),
      mode: String(payload.mode ?? 'browser_assisted'),
      source: String(payload.source ?? input.source),
      query: String(payload.query ?? input.query),
      jobs_found: Number(payload.jobs_found ?? 0),
      jobs_new: Number(payload.jobs_new ?? 0),
      min_match_score: Number(payload.min_match_score ?? input.minMatchScore ?? 0.15),
      started_at: String(payload.started_at ?? new Date().toISOString()),
      completed_at: payload.completed_at ? String(payload.completed_at) : undefined,
    },
    status: response.status,
  };
}

export async function checkBrowserConnection(
  cdpEndpoint?: string
): Promise<ApiResponse<BrowserConnectionStatus>> {
  const params = cdpEndpoint ? `?cdp_endpoint=${encodeURIComponent(cdpEndpoint)}` : '';
  try {
    const response = await fetch(`/api/discovery/browser-status${params}`);
    const payload = await response.json();
    return {
      data: {
        connected: Boolean(payload.connected),
        endpoint: String(payload.endpoint ?? 'http://host.docker.internal:9222'),
        browser_info: payload.browser_info ?? {},
        error: payload.error ?? null,
        how_to_start: String(payload.how_to_start ?? ''),
      },
      status: response.status,
    };
  } catch {
    return {
      data: {
        connected: false,
        endpoint: cdpEndpoint ?? 'http://host.docker.internal:9222',
        browser_info: {},
        error: 'Could not reach backend to check browser status.',
        how_to_start:
          'macOS/Linux: google-chrome --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --no-first-run\n' +
          'Windows:     chrome.exe --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0\n' +
          'Docker backend endpoint: http://host.docker.internal:9222\n' +
          'Host backend endpoint:   http://localhost:9222',
      },
      status: 0,
    };
  }
}
