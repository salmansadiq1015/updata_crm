import { api } from '@/services/api/apiClient';
import { ApiError } from '@/services/api/apiErrors';
import { ENDPOINTS } from '@/services/api/endpoints';

import type { ServerCheck } from './domain/mobileReadiness';
import { serverReadinessSchema } from './types';

/** Reaches the CRM and reads what it provides. A server without the endpoint (404) is still reachable. */
export async function checkServer(signal?: AbortSignal): Promise<ServerCheck> {
  const started = Date.now();
  try {
    const { data } = await api.get(ENDPOINTS.simCalls.readiness, serverReadinessSchema, { signal });
    return { state: 'ok', latencyMs: Date.now() - started, data };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 404) return { state: 'ok', latencyMs: Date.now() - started, data: null };
      if (error.kind === 'network' || error.kind === 'timeout') return { state: 'offline' };
    }
    return { state: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}
