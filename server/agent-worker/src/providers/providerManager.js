/** Only establishment can fail over. No audio or tool execution before selection. */
export async function establishProvider({ config, createAdapter, onAttempt = async () => {}, now = Date.now, deadlineAt = Infinity }) {
  const candidates = [
    { provider: 'gemini', model: config.selectedGeminiModel || config.primaryModel },
    ...(config.fallbackEnabled ? [{ provider: 'openai', model: config.secondaryModel }] : []),
  ];
  const attempts = [];
  for (const candidate of candidates) {
    const start = now(); let adapter;
    try {
      adapter = await createAdapter(candidate);
      await adapter.initializeSession();
      const remaining = deadlineAt - now();
      if (remaining <= 0) throw Object.assign(new Error('Session duration exhausted during setup'), { code: 'SESSION_DURATION_LIMIT' });
      await adapter.connect(Math.min(config.connectionTimeoutMs, remaining));
    } catch (error) {
      // Drain the failed socket before any secondary can publish audio.
      await adapter?.terminateSession();
      const attempt = { ...candidate, status: 'failed', at: new Date(start).toISOString(), latencyMs: now() - start, reason: error?.code || 'SESSION_ESTABLISHMENT_FAILED' };
      attempts.push(attempt); await onAttempt(attempt);
      continue;
    }
    const attempt = { ...candidate, status: 'established', at: new Date(start).toISOString(), latencyMs: now() - start };
    attempts.push(attempt);
    try { await onAttempt(attempt); }
    catch { await adapter.terminateSession(); throw Object.assign(new Error('Could not persist provider selection'), { code: 'CRM_PROVIDER_RECORD_FAILED' }); }
    return { adapter, provider: candidate.provider, model: candidate.model, attempts, fallback: attempts.length > 1 };
  }
  const error = new Error('No realtime voice provider could establish a session');
  error.code = 'VOICE_PROVIDERS_UNAVAILABLE'; error.attempts = attempts;
  throw error;
}
