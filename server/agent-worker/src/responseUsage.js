/** Provider response metrics, never summed into the cumulative SDK snapshot. */
export function createResponseUsage({ model, provider = 'api.openai.com', maxRecords = 500 } = {}) {
  const records = []; const seen = new Set();
  let dropped = 0; let compactions = 0; let contextChange = null;
  return {
    observe(m) {
      if (m?.type !== 'realtime_model_metrics' || !m.requestId || seen.has(m.requestId)) return false;
      seen.add(m.requestId);
      if (records.length >= maxRecords) { dropped += 1; return true; }
      const i = m.inputTokenDetails || {}; const o = m.outputTokenDetails || {};
      records.push({
        responseId: m.requestId, model, provider, type: 'llm_usage',
        inputTokens: m.inputTokens, outputTokens: m.outputTokens,
        inputAudioTokens: i.audioTokens, inputTextTokens: i.textTokens,
        inputCachedTokens: i.cachedTokens,
        ...(i.cachedTokensDetails ? { inputCachedAudioTokens: i.cachedTokensDetails.audioTokens, inputCachedTextTokens: i.cachedTokensDetails.textTokens } : {}),
        outputAudioTokens: o.audioTokens, outputTextTokens: o.textTokens,
        ttftMs: m.ttftMs >= 0 ? m.ttftMs : null, durationMs: m.durationMs,
        cancelled: Boolean(m.cancelled),
        cacheObservation: !records.length ? 'first_response' : i.cachedTokens > 0 ? 'cache_hit' : 'no_cached_tokens',
        contextChange,
      });
      contextChange = null;
      return true;
    },
    compacted() { compactions += 1; contextChange = 'history_compacted'; },
    reconnected() { contextChange = 'room_reconnected'; },
    snapshot() { return { version: 1, responses: records.slice(), responseCount: seen.size, dropped, compactions }; },
  };
}
