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
  'gpt-realtime': { audioIn: 32, audioCachedIn: 0.4, audioOut: 64, textIn: 4, textCachedIn: 0.4, textOut: 16 },
  'gpt-realtime-mini': { audioIn: 10, audioCachedIn: 0.3, audioOut: 20, textIn: 0.6, textCachedIn: 0.06, textOut: 2.4 },
  'gpt-4o-realtime-preview': { audioIn: 40, audioCachedIn: 2.5, audioOut: 80, textIn: 5, textCachedIn: 2.5, textOut: 20 },
  'gpt-4o-mini-realtime-preview': { audioIn: 10, audioCachedIn: 0.3, audioOut: 20, textIn: 0.6, textCachedIn: 0.3, textOut: 2.4 },
});

const RATE_KEYS = ['audioIn', 'audioCachedIn', 'audioOut', 'textIn', 'textCachedIn', 'textOut'];
const n = v => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
const round = (v, digits = 6) => Number(v.toFixed(digits));

export function pricingTable(env = process.env) {
  let custom = {};
  try { custom = env.AI_CALLING_MODEL_PRICING ? JSON.parse(env.AI_CALLING_MODEL_PRICING) : {}; } catch { custom = {}; }
  const table = { ...MODEL_PRICING };
  for (const [model, rates] of Object.entries(custom || {})) {
    if (rates && typeof rates === 'object') table[model] = { ...(table[model] || {}), ...Object.fromEntries(RATE_KEYS.map(k => [k, n(rates[k])])) };
  }
  return table;
}

/** Exact model name first, then the longest known prefix (dated snapshots, "-2.1" revisions). */
export function resolvePricing(model, table = pricingTable()) {
  if (!model) return null;
  const key = String(model).toLowerCase();
  if (table[key]) return { pricedAs: key, rates: table[key] };
  const prefix = Object.keys(table).filter(k => key.startsWith(k)).sort((a, b) => b.length - a.length)[0];
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
    const textIn = n(u.inputTextTokens) || Math.max(0, n(u.inputTokens) - audioIn - n(u.inputImageTokens));
    const audioOut = n(u.outputAudioTokens);
    const textOut = n(u.outputTextTokens) || Math.max(0, n(u.outputTokens) - audioOut);
    t.inputAudio += audioIn;
    t.inputCachedAudio += Math.min(audioIn, n(u.inputCachedAudioTokens));
    t.inputText += textIn;
    t.inputCachedText += Math.min(textIn, n(u.inputCachedTextTokens) || Math.max(0, n(u.inputCachedTokens) - n(u.inputCachedAudioTokens)));
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
  const pricing = hasUsage ? resolvePricing(model, pricingTable(env)) : null;
  const llm = modelCost(tokens, pricing?.rates);
  const billedMinutes = durationSeconds > 0 ? Math.ceil(durationSeconds / 60) : 0;
  const carrierLeg = !isTest && provider && !['livekit_web', 'web_link_preview', 'paired_phone'].includes(provider);
  const telephonyRate = carrierLeg ? n(env.AI_CALLING_TELEPHONY_COST_PER_MINUTE) : 0;
  const platformRate = n(env.AI_CALLING_PLATFORM_COST_PER_MINUTE);
  const telephony = round(billedMinutes * telephonyRate);
  const platform = round(billedMinutes * platformRate);
  return {
    amount: round(llm.total + telephony + platform),
    breakdown: {
      source: 'token_usage', estimate: true, model, pricedAs: pricing?.pricedAs || null, unpriced: hasUsage && !pricing,
      tokens, rates: pricing?.rates || null,
      components: { model: llm.total, modelDetail: llm, telephony, platform },
      billedMinutes, telephonyRatePerMinute: telephonyRate, platformRatePerMinute: platformRate,
    },
  };
}

/** True when this stored breakdown carries raw usage that has not been priced yet (calls saved before pricing existed). */
export const needsPricing = breakdown => Boolean(breakdown?.usage) && !breakdown?.tokens;
