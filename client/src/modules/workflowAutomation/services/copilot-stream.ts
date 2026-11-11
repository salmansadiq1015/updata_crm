import { API_URL } from '@/lib/api/config';
import { useAuthStore } from '@/stores/auth-store';
import { refreshSession } from '@/modules/auth/services/session-refresh-service';
import type { ValidationResult, WorkflowGraph } from '../types/workflow-types';

/** Events streamed by POST /workflows/:id/copilot (Server-Sent Events). */
export type CopilotEvent =
  | { type: 'status'; key: 'understanding' | 'resources' | 'validating' | 'thinking' | 'repairing'; agents?: number; templates?: number; round?: number }
  | { type: 'thought'; text: string }
  | { type: 'tool_start'; callId: string; name: string; step: string }
  | { type: 'tool_done'; callId: string; name: string; errors?: number; warnings?: number }
  | { type: 'op'; callId?: string; name: string; step: string; change: { kind: string; nodeId?: string; issues?: string[]; from?: string; to?: string; port?: string; direct?: boolean }; graph: WorkflowGraph }
  | { type: 'op_error'; callId?: string; name: string; code: string; message: string }
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

/** The stream stopped without a final event (server restarted, proxy cut it, or nothing arrived for too long). */
export class CopilotStreamError extends Error {
  constructor(public reason: 'ended' | 'stalled') { super(reason === 'stalled' ? 'The AI assistant stopped responding' : 'The connection closed before the AI assistant finished'); }
}

/** No bytes (events or the server's 15 s keep-alive pings) for this long = the stream is dead. */
export const STALL_MS = 45_000;

/** Stream copilot events; refreshes the session once on 401. */
export async function streamCopilot(workflowId: string, body: CopilotRequest, onEvent: (e: CopilotEvent) => void, signal: AbortSignal, { stallMs = STALL_MS } = {}) {
  const inner = new AbortController();
  const forward = () => inner.abort();
  if (signal.aborted) inner.abort(); else signal.addEventListener('abort', forward, { once: true });
  let stalled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => { clearTimeout(timer); timer = setTimeout(() => { stalled = true; inner.abort(); }, stallMs); };
  try {
    arm();
    await run(workflowId, body, onEvent, inner.signal, arm);
  } catch (error) {
    if (stalled && !signal.aborted) throw new CopilotStreamError('stalled');
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', forward);
  }
}

async function run(workflowId: string, body: CopilotRequest, onEvent: (e: CopilotEvent) => void, signal: AbortSignal, alive: () => void) {
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
  let finished = false;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    alive();
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
      const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
      if (!data) continue;
      let event: CopilotEvent;
      try { event = JSON.parse(data) as CopilotEvent; } catch { continue; /* ignore malformed frame */ }
      if (event.type === 'done' || event.type === 'error') finished = true;
      onEvent(event);
    }
  }
  if (!finished && !signal.aborted) throw new CopilotStreamError('ended');
}

/** Dictation: send a recording, get text back (the server transcribes in memory and stores nothing). */
export async function transcribeCopilotAudio(workflowId: string, audio: Blob, locale: string, signal?: AbortSignal): Promise<{ available: boolean; text: string; reason?: string }> {
  const send = () => {
    const form = new FormData();
    const ext = audio.type.includes('mp4') ? 'm4a' : audio.type.includes('ogg') ? 'ogg' : 'webm';
    form.append('audio', audio, `dictation.${ext}`);
    form.append('language', locale);
    const token = useAuthStore.getState().accessToken;
    return fetch(`${String(API_URL).replace(/\/+$/, '')}/workflows/${workflowId}/copilot/transcribe`, {
      method: 'POST', body: form, signal, credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  };
  let res = await send();
  if (res.status === 401) { await refreshSession(); res = await send(); }
  const json = await res.json().catch(() => null) as { data?: { available: boolean; text: string; reason?: string }; error?: { code?: string; message?: string } } | null;
  if (!res.ok || !json?.data) throw new CopilotHttpError(res.status, json?.error?.message || `HTTP ${res.status}`, json?.error?.code);
  return json.data;
}
