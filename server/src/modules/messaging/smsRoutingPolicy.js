/**
 * A cross-provider resend is allowed only when the primary definitely did not
 * accept the message. Network errors/timeouts are deliberately ambiguous.
 */
export function mayFallbackAfterSubmission(result) {
  return result?.outcome === 'rejected' && result?.safeToFallback === true;
}

export function fallbackPolicyAllows({ enabled, allowedCountries = [], allowedPurposes = [] }, { country, purpose }) {
  if (!enabled || !allowedPurposes.includes(purpose)) return false;
  if (!allowedCountries.length) return true;
  return allowedCountries.includes(String(country || '').toUpperCase());
}
