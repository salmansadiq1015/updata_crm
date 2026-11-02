/** Shared by the API and standalone worker. No secrets or SDK dependencies. */
export const VOICE_MODELS = Object.freeze([
  { provider: 'gemini', id: 'gemini-3.8-live', experimental: false, caching: false },
  { provider: 'gemini', id: 'gemini-3.1-flash-live-preview', experimental: true, caching: false },
  { provider: 'openai', id: 'gpt-realtime-2.1-mini', experimental: false, caching: true },
  { provider: 'openai', id: 'gpt-realtime', experimental: false, caching: true },
  { provider: 'openai', id: 'gpt-realtime-mini', experimental: false, caching: true },
]);

export function voiceProviderConfig(saved = {}, env = process.env, { isTest = false } = {}) {
  const value = (key, envKey, fallback) => saved[key] ?? (env[envKey] || fallback);
  const primaryModel = value('primaryModel', 'PRIMARY_MODEL', 'gemini-3.8-live');
  if (!VOICE_MODELS.some(m => m.id === primaryModel && m.provider === 'gemini' && !m.experimental)) {
    throw new Error('Production Gemini model must be a stable registry model; previews require live benchmarks before promotion');
  }
  const experimentalModel = value('experimentalModel', 'GEMINI_EXPERIMENTAL_MODEL', '');
  if (experimentalModel && !VOICE_MODELS.some(m => m.id === experimentalModel && m.experimental)) throw new Error('Unknown experimental model');
  const secondaryModel = value('secondaryModel', 'SECONDARY_MODEL', 'gpt-realtime-2.1-mini');
  if (!/^gpt-[a-z0-9.-]*realtime[a-z0-9.-]*$/.test(secondaryModel)) throw new Error('OpenAI fallback must be a Realtime model ID');
  const number = (key, envKey, fallback, min, max) => {
    const n = Number(value(key, envKey, fallback));
    if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Invalid ${key}`);
    return n;
  };
  return {
    primaryProvider: 'gemini', secondaryProvider: 'openai', primaryModel, secondaryModel, experimentalModel,
    selectedGeminiModel: isTest && experimentalModel ? experimentalModel : primaryModel,
    fallbackEnabled: saved.fallbackEnabled ?? env.GEMINI_FALLBACK_ENABLED !== 'false',
    fallbackPolicy: 'establishment_only',
    geminiVoice: value('geminiVoice', 'GEMINI_LIVE_VOICE', 'Puck'),
    maxSessionSeconds: number('maxSessionSeconds', 'AI_CALLING_MAX_SESSION_SECONDS', 300, 30, 3600),
    maxCallCostUsd: number('maxCallCostUsd', 'AI_CALLING_MAX_CALL_COST_USD', 0, 0, 1000),
    connectionTimeoutMs: number('connectionTimeoutMs', 'AI_CALLING_CONNECTION_TIMEOUT_MS', 15000, 1000, 60000),
  };
}
