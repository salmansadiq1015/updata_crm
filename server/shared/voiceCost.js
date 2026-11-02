/**
 * Per-call cost from what the call actually consumed. The voice worker reports
 * the realtime model's token usage (LiveKit `AgentSessionUsage`); this prices it
 * with the model's public list rates and adds per-minute telephony / platform
 * charges the operator configures. Everything here is an ESTIMATE of the bill,
 * labelled as such — the provider invoice is the source of truth.
 *
 * Rates are USD per 1M tokens. Override or extend them with
 * AI_CALLING_MODEL_PRICING='{"model":{"audioIn":..,"audioCachedIn":..,"audioOut":..,"textIn":..,"textCachedIn":..,"textOut":..}}'.
 */
export const MODEL_PRICING = Object.freeze({
  // Published list prices verified 2026-10-30. Not reconciled account billing.
  'gemini-3.8-live': { audioIn: 3, audioCachedIn: 0, audioOut: 12, textIn: 0.75, textCachedIn: 0, textOut: 4.5 },
  'gemini-3.1-flash-live-preview': { audioIn: 3, audioCachedIn: 0, audioOut: 12, textIn: 0.75, textCachedIn: 0, textOut: 4.5 },
  'gpt-realtime-2.1-mini': { audioIn: 10, audioCachedIn: 0.3, audioOut: 20, textIn: 0.6, textCachedIn: 0.06, textOut: 2.4 },
  'gpt-realtime': { audioIn: 32, audioCachedIn: 0.4, audioOut: 64, textIn: 4, textCachedIn: 0.4, textOut: 16 },
  'gpt-realtime-mini': { audioIn: 10, audioCachedIn: 0.3, audioOut: 20, textIn: 0.6, textCachedIn: 0.06, textOut: 2.4 },
  'gpt-4o-realtime-preview': { audioIn: 40, audioCachedIn: 2.5, audioOut: 80, textIn: 5, textCachedIn: 2.5, textOut: 20 },
  'gpt-4o-mini-realtime-preview': { audioIn: 10, audioCachedIn: 0.3, audioOut: 20, textIn: 0.6, textCachedIn: 0.3, textOut: 2.4 },
});
export const COST_PRICING_VERSION = 2;

const RATE_KEYS = ['audioIn', 'audioCachedIn', 'audioOut', 'textIn', 'textCachedIn', 'textOut'];
const n = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
const round = (v, digits = 6) => Number(v.toFixed(digits));

export function pricingTable(env = process.env) {
  let custom = {};
  try { custom = env.AI_CALLING_MODEL_PRICING ? JSON.parse(env.AI_CALLING_MODEL_PRICING) : {}; } catch { custom = {}; }
  const table = { ...MODEL_PRICING };
  for (const [model, rates] of Object.entries(custom || {})) {
    if (rates && typeof rates === 'object') {
      // Partial overrides must retain the other rates; explicit zero is valid.
      const valid = Object.fromEntries(RATE_KEYS.filter(k => rates[k] !== '' && rates[k] != null && Number.isFinite(Number(rates[k])) && Number(rates[k]) >= 0).map(k => [k, Number(rates[k])]));
      table[model.toLowerCase()] = { ...(table[model.toLowerCase()] || {}), ...valid };
    }
  }
  return table;
}

/** Exact model or its dated snapshot. A new model family must have its own rates. */
export function resolvePricing(model, table = pricingTable()) {
  if (!model) return null;
  const key = String(model).toLowerCase();
  if (table[key]) return { pricedAs: key, rates: table[key] };
  const prefix = Object.keys(table).find(k => key.startsWith(`${k}-`) && /^\d{4}-\d{2}-\d{2}$/.test(key.slice(k.length + 1)));
  return prefix ? { pricedAs: prefix, rates: table[prefix] } : null;
}

/**
 * Collapses the worker's usage report (one entry per model/provider) into
 * token counts. Fields can be missing (LiveKit drops zero values) and older
 * reports only carry totals, so the text split is derived from what remains.
 */
export function summarizeUsage(usage) {
  const entries = (Array.isArray(usage?.modelUsage) ? usage.modelUsage : Array.isArray(usage) ? usage : [])
    .filter(u => u && (u.type === 'llm_usage' || u.type == null));
  const t = { inputAudio: 0, inputCachedAudio: 0, inputText: 0, inputCachedText: 0, outputAudio: 0, outputText: 0 };
  let model = null;
  for (const u of entries) {
    model ||= u.model || null;
    const audioIn = n(u.inputAudioTokens);
    const textIn = u.inputTextTokens != null ? n(u.inputTextTokens) : Math.max(0, n(u.inputTokens) - audioIn - n(u.inputImageTokens));
    const audioOut = n(u.outputAudioTokens);
    const textOut = u.outputTextTokens != null ? n(u.outputTextTokens) : Math.max(0, n(u.outputTokens) - audioOut);
    t.inputAudio += audioIn;
    const cached = n(u.inputCachedTokens);
    const cachedAudio = u.inputCachedAudioTokens != null ? n(u.inputCachedAudioTokens)
      : u.inputCachedTextTokens != null ? Math.max(0, cached - n(u.inputCachedTextTokens) - n(u.inputCachedImageTokens)) : textIn === 0 ? cached : 0;
    const cachedText = u.inputCachedTextTokens != null ? n(u.inputCachedTextTokens)
      : u.inputCachedAudioTokens != null ? Math.max(0, cached - n(u.inputCachedAudioTokens) - n(u.inputCachedImageTokens)) : audioIn === 0 ? cached : 0;
    t.inputCachedAudio += Math.min(audioIn, cachedAudio);
    t.inputText += textIn;
    t.inputCachedText += Math.min(textIn, cachedText);
    t.outputAudio += audioOut;
    t.outputText += textOut;
  }
  const input = t.inputAudio + t.inputText;
  const output = t.outputAudio + t.outputText;
  return { model, tokens: { ...t, input, output, total: input + output }, hasUsage: entries.length > 0 };
}

export function modelCost(tokens, rates) {
  if (!rates) return { total: 0, audioIn: 0, audioOut: 0, textIn: 0, textOut: 0 };
  const per = (count, rate) => (count * n(rate)) / 1e6;
  const audioIn = per(tokens.inputAudio - tokens.inputCachedAudio, rates.audioIn) + per(tokens.inputCachedAudio, rates.audioCachedIn);
  const textIn = per(tokens.inputText - tokens.inputCachedText, rates.textIn) + per(tokens.inputCachedText, rates.textCachedIn);
  const audioOut = per(tokens.outputAudio, rates.audioOut);
  const textOut = per(tokens.outputText, rates.textOut);
  return { total: round(audioIn + textIn + audioOut + textOut), audioIn: round(audioIn), audioOut: round(audioOut), textIn: round(textIn), textOut: round(textOut) };
}

/**
 * Prices one call. `telephony` applies to real carrier legs only (cloud SIP);
 * a paired phone uses the owner's own SIM plan and a browser test has no leg.
 * `platform` (LiveKit agent minutes) applies to every connected session.
 */
export function computeCallCost({ usage = null, durationSeconds = 0, provider = null, fallbackModel = null, isTest = false } = {}, env = process.env) {
  const { model: reportedModel, tokens, hasUsage } = summarizeUsage(usage);
  const model = reportedModel || fallbackModel || null;
  const table = pricingTable(env);
  const entries = (Array.isArray(usage?.modelUsage) ? usage.modelUsage : Array.isArray(usage) ? usage : []).filter(u => u && (u.type === 'llm_usage' || u.type == null));
  const models = entries.map(entry => {
    const name = entry.model || fallbackModel || null;
    const gemini = /^(gemini|google|generativelanguage\.googleapis\.com)$/i.test(entry.provider || '') && /^gemini-/.test(name || '');
    const openai = (!entry.provider || /^(openai|api\.openai\.com)$/i.test(entry.provider)) && !/^gemini-/.test(name || '');
    const pricing = (gemini || openai) ? resolvePricing(name, table) : null;
    const normalized = summarizeUsage([entry]).tokens;
    const ambiguousCache = n(entry.inputCachedTokens) > 0 && normalized.inputAudio > 0 && normalized.inputText > 0
      && entry.inputCachedAudioTokens == null && entry.inputCachedTextTokens == null;
    const inconsistent = (entry.inputTokens != null && normalized.input !== n(entry.inputTokens))
      || (entry.outputTokens != null && normalized.output !== n(entry.outputTokens))
      || n(entry.inputCachedTokens) > normalized.input
      || (entry.inputCachedTokens != null && !ambiguousCache && normalized.inputCachedAudio + normalized.inputCachedText + n(entry.inputCachedImageTokens) !== n(entry.inputCachedTokens))
      || n(entry.inputCachedAudioTokens) > normalized.inputAudio || n(entry.inputCachedTextTokens) > normalized.inputText
      || Object.entries(entry).some(([key, value]) => /Tokens$/.test(key) && value != null && (!Number.isFinite(Number(value)) || Number(value) < 0));
    const unsupportedCache = gemini && n(entry.inputCachedTokens) > 0;
    const detail = modelCost(normalized, ambiguousCache || inconsistent || unsupportedCache ? null : pricing?.rates);
    return { model: name, provider: entry.provider || null, pricedAs: pricing?.pricedAs || null, rates: pricing?.rates || null, tokens: normalized, amount: detail.total, detail,
      unpriced: !pricing || RATE_KEYS.some(k => pricing.rates[k] == null) || n(entry.inputImageTokens) > 0 || ambiguousCache || inconsistent || unsupportedCache,
      issues: [!pricing ? 'unknown_model_or_provider' : null, unsupportedCache ? 'gemini_live_cache_pricing_not_supported' : null, ambiguousCache ? 'missing_cached_modality_split' : null, inconsistent ? 'inconsistent_token_totals' : null, n(entry.inputImageTokens) > 0 ? 'image_pricing_not_recorded' : null].filter(Boolean) };
  });
  const llm = { total: 0, audioIn: 0, audioOut: 0, textIn: 0, textOut: 0 };
  for (const row of models) for (const k of Object.keys(llm)) llm[k] += row.detail[k];
  for (const k of Object.keys(llm)) llm[k] = round(llm[k]);
  const pricing = models.length === 1 ? models[0] : null;
  const billedMinutes = durationSeconds > 0 ? Math.ceil(durationSeconds / 60) : 0;
  const carrierLeg = !isTest && provider && !['livekit_web', 'web_link', 'web_link_preview', 'paired_phone'].includes(provider);
  const telephonyRate = carrierLeg ? n(env.AI_CALLING_TELEPHONY_COST_PER_MINUTE) : 0;
  const platformRate = n(env.AI_CALLING_PLATFORM_COST_PER_MINUTE);
  const telephony = round(billedMinutes * telephonyRate);
  const platform = round(billedMinutes * platformRate);
  return {
    amount: round(llm.total + telephony + platform),
    breakdown: {
      source: 'token_usage', estimate: true, pricingVersion: COST_PRICING_VERSION,
      model: models.length > 1 ? [...new Set(models.map(m => m.model))].join(', ') : model,
      pricedAs: pricing?.pricedAs || null, unpriced: !hasUsage || Boolean(usage?.historyIncomplete) || models.some(m => m.unpriced),
      models, invoiceVerified: false,
      tokens, rates: pricing?.rates || null,
      components: { model: llm.total, modelDetail: llm, telephony, platform },
      billedMinutes, telephonyRatePerMinute: telephonyRate, platformRatePerMinute: platformRate,
    },
  };
}

/** True when this stored breakdown carries raw usage that has not been priced yet (calls saved before pricing existed). */
export const needsPricing = breakdown => Boolean(breakdown?.usage) && !breakdown?.tokens;
