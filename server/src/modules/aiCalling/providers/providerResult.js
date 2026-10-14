/**
 * Normalized telephony-dispatch result shape, mirroring the messaging module so
 * the queue/worker can reason about outcomes uniformly.
 *
 *   accepted  — the provider confirmably created the outbound call.
 *   rejected  — the provider confirmably refused (config / bad number / policy).
 *   ambiguous — we don't KNOW the outcome (timeout / connection error). Never
 *               retried blindly; reconciled first.
 */
export function dispatchAccepted(provider, providerCallId, extra = {}) {
  return { provider, outcome: 'accepted', safeToRetry: false, providerCallId, ...extra };
}

export function dispatchRejected(provider, { message, code = null, status = null, permanent = false, safeToFallback = true } = {}) {
  return {
    provider,
    outcome: 'rejected',
    safeToRetry: !permanent,
    safeToFallback,
    providerCallId: null,
    failureClass: permanent ? 'permanent' : 'transient',
    errorCode: code == null ? null : String(code),
    errorMessage: String(message || 'Telephony provider rejected the request').slice(0, 500),
    responseStatus: status,
  };
}

export function dispatchAmbiguous(provider, message, code = 'AMBIGUOUS_DISPATCH') {
  return {
    provider,
    outcome: 'ambiguous',
    safeToRetry: false,
    safeToFallback: false,
    providerCallId: null,
    failureClass: 'ambiguous',
    errorCode: code,
    errorMessage: String(message || 'Telephony dispatch outcome is unknown').slice(0, 500),
    responseStatus: null,
  };
}
