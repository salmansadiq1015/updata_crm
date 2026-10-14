import primary from './livekitSip.provider.js';
import twilioFallback from './twilioVoiceFallback.provider.js';

/** Dial primary first; only a definite non-acceptance can use the fallback. */
export async function routeOutboundCall(input, { primaryProvider = primary, fallbackProvider = twilioFallback } = {}) {
  const first = await primaryProvider.createOutboundCall(input);
  if (first.outcome !== 'rejected' || first.safeToFallback === false || !fallbackProvider.eligibleFor(input.country)) {
    return { result: first, attempts: [first] };
  }

  // Reuse the primary dispatch only when the primary explicitly confirms it.
  // Configuration/dispatch failures occur before an agent exists, so the
  // fallback must create the agent before it is allowed to dial.
  const second = await fallbackProvider.createOutboundCall({
    ...input,
    skipAgentDispatch: Boolean(first.agentDispatched),
  });
  return {
    result: { ...second, fallbackFrom: first.provider, fallbackReason: first.errorCode || first.errorMessage },
    attempts: [first, second],
  };
}

export async function telephonyHealth() {
  const [primaryHealth, fallbackHealth] = await Promise.all([primary.health(), twilioFallback.health()]);
  // Keep the original top-level shape for existing clients while exposing the
  // explicit primary/fallback split for operations and newer UI.
  return { ...primaryHealth, primary: primaryHealth, fallback: fallbackHealth };
}

export default { routeOutboundCall, telephonyHealth };
