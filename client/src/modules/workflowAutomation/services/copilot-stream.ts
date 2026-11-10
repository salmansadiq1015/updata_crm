import { API_URL } from '@/lib/api/config';
import { useAuthStore } from '@/stores/auth-store';
import { refreshSession } from '@/modules/auth/services/session-refresh-service';
import type { ValidationResult, WorkflowGraph } from '../types/workflow-types';

/** Events streamed by POST /workflows/:id/copilot (Server-Sent Events). */
export type CopilotEvent =
  | { type: 'status'; key: 'understanding' | 'resources' | 'validating'; agents?: number; templates?: number }
  | { type: 'op'; name: string; step: string; change: { kind: string; nodeId?: string; issues?: string[]; from?: string; to?: string; port?: string; direct?: boolean }; graph: WorkflowGraph }
  | { type: 'op_error'; name: string; code: string; message: string }
  | { type: 'rename'; name: string }
  | { type: 'question'; question: string; kind: 'agent' | 'template' | 'user' | 'choice' | 'text'; options: CopilotOption[]; allowFreeText: boolean }
  | { type: 'message'; text: string }
  | { type: 'done'; graph: WorkflowGraph; name: string; changed: boolean; opsApplied: number; validation: ValidationResult; awaitingAnswer?: boolean; truncated?: boolean }
  | { type: 'error'; message: string };

/** A question option; `apply` = a plain settings change the server applies directly (validated). */
export interface CopilotOption { label: string; value: string; description?: string; apply?: CopilotApply }
export interface CopilotApply { node: string; config: Record<string, unknown> }

export interface CopilotRequest {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  graph: WorkflowGraph;
  selectedNodeId?: string | null;
  locale: string;
  apply?: CopilotApply | null;
}

export class CopilotHttpError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}

async function post(workflowId: string, body: CopilotRequest, signal: AbortSignal) {
  const token = useAuthStore.getState().accessToken;
  return fetch(`${String(API_URL).replace(/\/+$/, '')}/workflows/${workflowId}/copilot`, {
    method: 'POST', signal, credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

/** Stream copilot events; refreshes the session once on 401. */
export async function streamCopilot(workflowId: string, body: CopilotRequest, onEvent: (e: CopilotEvent) => void, signal: AbortSignal) {
  let res = await post(workflowId, body, signal);
  if (res.status === 401) {
    await refreshSession();
    res = await post(workflowId, body, signal);
  }
  if (!res.ok || !res.body) {
    const json = await res.json().catch(() => null) as { error?: { code?: string; message?: string }; message?: string } | null;
    throw new CopilotHttpError(res.status, json?.error?.message || json?.message || `HTTP ${res.status}`, json?.error?.code);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
      const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (!data) continue;
      try { onEvent(JSON.parse(data) as CopilotEvent); } catch { /* ignore malformed frame */ }
    }
  }
}
