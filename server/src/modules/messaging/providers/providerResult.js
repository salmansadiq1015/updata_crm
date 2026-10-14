export function accepted(provider, providerMessageId, providerStatus = 'accepted', extra = {}) {
  return {
    provider, outcome: 'accepted', safeToFallback: false, providerMessageId,
    providerStatus, failureClass: null, ...extra,
  };
}

export function rejected(provider, {
  message, code = null, status = null, permanent = false, safeToFallback = false,
} = {}) {
  return {
    provider,
    outcome: 'rejected',
    safeToFallback,
    providerMessageId: null,
    providerStatus: null,
    failureClass: permanent ? 'permanent' : 'transient',
    errorCode: code == null ? null : String(code),
    errorMessage: String(message || 'Provider rejected the request').slice(0, 500),
    responseStatus: status,
  };
}

export function ambiguous(provider, message, code = 'AMBIGUOUS_SUBMISSION') {
  return {
    provider,
    outcome: 'ambiguous',
    safeToFallback: false,
    providerMessageId: null,
    providerStatus: null,
    failureClass: 'ambiguous',
    errorCode: code,
    errorMessage: String(message || 'Provider submission outcome is unknown').slice(0, 500),
    responseStatus: null,
  };
}
