/** LiveKit can omit model metadata from Realtime metrics. Preserve the exact
 * configuration used for THIS session, never the API server's current default.
 * The input is a cumulative snapshot; do not add it to a preceding snapshot.
 */
export function billingUsage(snapshot, { model, provider = 'api.openai.com' }) {
  if (!snapshot) return null;
  return {
    ...snapshot,
    modelUsage: (snapshot.modelUsage || []).map(entry => entry.type === 'llm_usage' ? {
      ...entry,
      model: entry.model || model,
      provider: entry.provider || provider,
      modelSource: entry.model ? 'provider_metrics' : 'worker_configuration',
    } : { ...entry }),
  };
}
