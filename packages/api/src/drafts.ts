import type { ApiResponse } from './types';

export interface AssistedDraft {
  id: string;
  status: string;
}

export interface AssistedFillResult {
  status: string;
  screenshot_path?: string;
  requires_explicit_final_submit: boolean;
}

export interface AssistedConfirmResult {
  status: string;
  screenshot_path?: string;
  draft?: {
    id?: string;
    status?: string;
    submitted_at?: string | null;
  };
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

export async function runAssistedFill(draftId: string): Promise<ApiResponse<AssistedFillResult>> {
  const response = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      confirm_user_assisted: true,
      acknowledge_platform_terms: true,
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
      requires_explicit_final_submit: Boolean(payload.requires_explicit_final_submit ?? true),
    },
    status: response.status,
  };
}

export async function runAssistedConfirmSubmit(
  draftId: string
): Promise<ApiResponse<AssistedConfirmResult>> {
  const response = await fetch(`/api/drafts/${encodeURIComponent(draftId)}/confirm-submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      confirm_user_assisted: true,
      acknowledge_platform_terms: true,
      confirm_final_submit: true,
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
