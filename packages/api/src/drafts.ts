import type { ApiResponse } from './types';

export interface AssistedDraft {
  id: string;
  status: string;
}

export interface AssistedFillResult {
  status: string;
  screenshot_path?: string;
  screenshot_url?: string;
  mode?: string;
  requires_explicit_final_submit: boolean;
}

export interface AssistedConfirmResult {
  status: string;
  screenshot_path?: string;
  screenshot_url?: string;
  mode?: string;
  draft?: {
    id?: string;
    status?: string;
    submitted_at?: string | null;
  };
}

export interface AssistedProgressEvent {
  at: string;
  level: string;
  message: string;
}

export interface AssistedProgressResult {
  draft_id: string;
  status: string;
  mode: string;
  started_at?: string | null;
  updated_at?: string | null;
  latest_screenshot_path?: string;
  latest_screenshot_url?: string;
  events: AssistedProgressEvent[];
  error?: string | null;
}

export interface AssistedGuidanceResult {
  ok: boolean;
  draft_id: string;
  applied_guidance: string;
}

export interface AssistedRunOptions {
  useVisibleBrowser?: boolean;
  pauseForManualInputSeconds?: number;
}

function toErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object' && 'detail' in payload) {
    const detail = (payload as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }
  return fallback;
}

export async function prepareDraft(jobId: string): Promise<ApiResponse<AssistedDraft>> {
  const response = await fetch('/api/drafts/prepare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId }),
  });
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: { id: '', status: 'error' },
      error: toErrorMessage(payload, 'Failed to prepare draft'),
      status: response.status,
    };
  }
  return {
    data: {
      id: String(payload.id ?? ''),
      status: String(payload.status ?? 'drafted'),
    },
    status: response.status,
  };
}

export async function approveDraft(draftId: string): Promise<ApiResponse<AssistedDraft>> {
  const response = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/approve`, {
    method: 'POST',
  });
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: { id: draftId, status: 'error' },
      error: toErrorMessage(payload, 'Failed to approve draft'),
      status: response.status,
    };
  }
  return {
    data: {
      id: String(payload.id ?? draftId),
      status: String(payload.status ?? 'approved'),
    },
    status: response.status,
  };
}

export async function runAssistedFill(
  draftId: string,
  options?: AssistedRunOptions
): Promise<ApiResponse<AssistedFillResult>> {
  const response = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      confirm_user_assisted: true,
      acknowledge_platform_terms: true,
      use_visible_browser: Boolean(options?.useVisibleBrowser),
      pause_for_manual_input_seconds: Number(options?.pauseForManualInputSeconds ?? 0),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: {
        status: 'error',
        requires_explicit_final_submit: true,
      },
      error: toErrorMessage(payload, 'Failed during assisted form fill'),
      status: response.status,
    };
  }
  return {
    data: {
      status: String(payload.status ?? 'ready_for_final_approval'),
      screenshot_path:
        typeof payload.screenshot_path === 'string' ? payload.screenshot_path : undefined,
      screenshot_url:
        typeof payload.screenshot_url === 'string' ? payload.screenshot_url : undefined,
      mode: typeof payload.mode === 'string' ? payload.mode : undefined,
      requires_explicit_final_submit: Boolean(payload.requires_explicit_final_submit ?? true),
    },
    status: response.status,
  };
}

export async function runAssistedConfirmSubmit(
  draftId: string,
  options?: AssistedRunOptions
): Promise<ApiResponse<AssistedConfirmResult>> {
  const response = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/confirm-submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      confirm_user_assisted: true,
      acknowledge_platform_terms: true,
      confirm_final_submit: true,
      use_visible_browser: Boolean(options?.useVisibleBrowser),
    }),
  });
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: { status: 'error' },
      error: toErrorMessage(payload, 'Failed during final submit'),
      status: response.status,
    };
  }
  const draftPayload =
    payload.draft && typeof payload.draft === 'object'
      ? (payload.draft as { id?: unknown; status?: unknown; submitted_at?: unknown })
      : undefined;
  return {
    data: {
      status: String(payload.status ?? 'submitted'),
      screenshot_path:
        typeof payload.screenshot_path === 'string' ? payload.screenshot_path : undefined,
      screenshot_url:
        typeof payload.screenshot_url === 'string' ? payload.screenshot_url : undefined,
      mode: typeof payload.mode === 'string' ? payload.mode : undefined,
      draft: draftPayload
        ? {
            id: typeof draftPayload.id === 'string' ? draftPayload.id : undefined,
            status: typeof draftPayload.status === 'string' ? draftPayload.status : undefined,
            submitted_at:
              typeof draftPayload.submitted_at === 'string' ? draftPayload.submitted_at : null,
          }
        : undefined,
    },
    status: response.status,
  };
}

export async function getAssistedProgress(
  draftId: string
): Promise<ApiResponse<AssistedProgressResult>> {
  const response = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/progress`);
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: {
        draft_id: draftId,
        status: 'error',
        mode: 'unknown',
        events: [],
      },
      error: toErrorMessage(payload, 'Failed to fetch assisted progress'),
      status: response.status,
    };
  }
  const rawEvents: unknown[] = Array.isArray(payload.events) ? payload.events : [];
  const events = rawEvents
    .map((item: unknown) =>
      item && typeof item === 'object'
        ? (() => {
            const event = item as Record<string, unknown>;
            return {
              at: typeof event.at === 'string' ? event.at : '',
              level: typeof event.level === 'string' ? event.level : 'info',
              message: typeof event.message === 'string' ? event.message : '',
            };
          })()
        : null
    )
    .filter((item: AssistedProgressEvent | null): item is AssistedProgressEvent =>
      Boolean(item && item.message)
    );

  return {
    data: {
      draft_id: typeof payload.draft_id === 'string' ? payload.draft_id : draftId,
      status: typeof payload.status === 'string' ? payload.status : 'idle',
      mode: typeof payload.mode === 'string' ? payload.mode : 'unknown',
      started_at: typeof payload.started_at === 'string' ? payload.started_at : null,
      updated_at: typeof payload.updated_at === 'string' ? payload.updated_at : null,
      latest_screenshot_path:
        typeof payload.latest_screenshot_path === 'string' ? payload.latest_screenshot_path : undefined,
      latest_screenshot_url:
        typeof payload.latest_screenshot_url === 'string' ? payload.latest_screenshot_url : undefined,
      events,
      error: typeof payload.error === 'string' ? payload.error : null,
    },
    status: response.status,
  };
}

export async function sendAssistedGuidance(
  draftId: string,
  message: string
): Promise<ApiResponse<AssistedGuidanceResult>> {
  const response = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/guidance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const payload = await response.json();
  if (!response.ok) {
    return {
      data: { ok: false, draft_id: draftId, applied_guidance: '' },
      error: toErrorMessage(payload, 'Failed to send operator guidance'),
      status: response.status,
    };
  }
  return {
    data: {
      ok: Boolean(payload.ok),
      draft_id: typeof payload.draft_id === 'string' ? payload.draft_id : draftId,
      applied_guidance:
        typeof payload.applied_guidance === 'string' ? payload.applied_guidance : '',
    },
    status: response.status,
  };
}
