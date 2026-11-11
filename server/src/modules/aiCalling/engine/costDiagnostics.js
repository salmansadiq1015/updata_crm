import { computeCallCost, modelCost } from './callCost.js';

/**
 * `env` with AI_CALLING_MODEL_PRICING replaced, as a read-through view. Copying process.env
 * (`{ ...env }`) costs ~1 ms per call — it dominated the per-call analytics loops — while the
 * pricing code only reads a few keys.
 */
export function withModelPricing(env, overrides) {
  const pricing = JSON.stringify(overrides);
  return new Proxy(env, { get: (target, key) => (key === 'AI_CALLING_MODEL_PRICING' ? pricing : target[key]) });
}

/** Usage is observed; dollars are rate-card estimates, never invoice amounts. */
export function costDiagnostics(cost, usage, durationSeconds, env = process.env) {
  const tokens = cost.tokens;
  const complete = cost.source === 'token_usage' && !cost.unpriced;
  const telemetry = usage?.responseTelemetry;
  let overrides = {};
  try { const parsed = JSON.parse(env.AI_CALLING_MODEL_PRICING || '{}'); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) overrides = parsed; } catch { /* known rates */ }
  for (const row of cost.models || []) if (row.model && row.rates && !row.unpriced) overrides[row.model] = row.rates;
  if (cost.model && cost.rates) overrides[cost.model] = cost.rates;
  const historicalEnv = withModelPricing(env, overrides);
  const responses = (telemetry?.responses || []).map(row => {
    const priced = computeCallCost({ usage: [row] }, historicalEnv);
    return { ...row, tokens: priced.breakdown.tokens, estimatedCost: priced.breakdown.unpriced ? null : priced.amount };
  });
  // Use stored historical rates, never today's family default, for savings.
  const pricedModels = cost.models?.length ? cost.models : tokens && cost.rates ? [{ tokens, rates: cost.rates, amount: cost.components?.model }] : [];
  const cacheSavings = complete && pricedModels.length ? pricedModels.reduce((sum, row) => {
    const uncached = modelCost({ ...row.tokens, inputCachedAudio: 0, inputCachedText: 0 }, row.rates);
    return sum + Math.max(0, uncached.total - row.amount);
  }, 0) : null;
  const entries = Array.isArray(usage?.modelUsage) ? usage.modelUsage.filter(r => r.type === 'llm_usage' || r.type == null) : [];
  const cached = entries.length && entries.every(r => Number.isFinite(r.inputCachedTokens))
    ? entries.reduce((sum, r) => sum + r.inputCachedTokens, 0) : tokens ? tokens.inputCachedAudio + tokens.inputCachedText : null;
  return {
    version: 1, usageSource: tokens ? 'provider_usage_via_sdk' : 'unavailable', invoiceVerified: false,
    cacheHitPercent: tokens?.input > 0 && cached >= 0 && cached <= tokens.input ? 100 * cached / tokens.input : null,
    cachedInputTokens: cached,
    estimatedCacheSavings: cacheSavings == null ? null : Number(cacheSavings.toFixed(6)),
    estimatedCostPerMinute: complete && durationSeconds > 0 ? cost.amount * 60 / durationSeconds : null,
    responseCount: telemetry?.responseCount ?? null, droppedResponses: telemetry?.dropped ?? 0,
    averageOutputTokens: telemetry?.responseCount && tokens ? tokens.output / telemetry.responseCount : null,
    compactions: telemetry?.compactions ?? null, configuration: telemetry?.configuration || null,
    responses,
  };
}
