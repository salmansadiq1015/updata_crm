const TRANSIENT_HTTP = new Set([429, 503, 504]);
const TRANSIENT_RUN_CODES = new Set([
  'QUEUE_UNAVAILABLE',
  'AGENT_TIMEOUT',
  'UNHANDLED_ERROR',
  'NETWORK_ERROR',
  'TIMEOUT',
  'OFFLINE',
]);
const HARD_RUN_CODES = new Set(['RBAC_DENIED', 'WORKFLOW_NOT_FOUND', 'AI_AGENT_INVALID_STATUS', 'AI_SESSION_INVALID_STATUS']);

export function classifyDispatchError(error) {
  const status = error?.status ?? error?.response?.status;
  const code = error?.code ?? error?.response?.data?.code;

  if (code === 'RBAC_DENIED') return { isTransient: false, reason: code };
  if (!status) return { isTransient: true, reason: 'network-error' };
  if (TRANSIENT_HTTP.has(status)) return { isTransient: true, reason: `HTTP_${status}` };
  return { isTransient: false, reason: `HTTP_${status}` };
}

export function classifyRunError(runError) {
  const code = runError?.code;
  if (!code && runError?.isNetworkError) return { isTransient: true, reason: 'network-error' };
  if (!code) return { isTransient: false, reason: 'no-code' };
  if (TRANSIENT_RUN_CODES.has(code)) return { isTransient: true, reason: code };
  if (HARD_RUN_CODES.has(code)) return { isTransient: false, reason: code };
  return { isTransient: false, reason: code };
}
