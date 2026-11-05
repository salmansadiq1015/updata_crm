import { normalizePhone } from '../../businessDiscovery/engine/normalizer.js';

/**
 * Caller identification. Phones report caller ID in whatever format the network delivered
 * (+41 79…, 0041…, 079…, 0300…), so every number is normalised to E.164 for the configured
 * home region before it is compared. Matching is exact on E.164; we never merge leads.
 */

const PRIVATE_MARKERS = /^(private|unknown|anonymous|restricted|withheld|unavailable|p|u|-1|-2|-3)$/i;

export function parseCallerNumber(raw, region = 'CH') {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text || PRIVATE_MARKERS.test(text) || !/\d{3,}/.test(text)) {
    return { raw: text || null, e164: null, presentation: text && !PRIVATE_MARKERS.test(text) ? 'unavailable' : 'private', valid: false };
  }
  const parsed = normalizePhone(text, region);
  return { raw: text.slice(0, 40), e164: parsed.valid ? parsed.e164 : null, presentation: 'available', valid: Boolean(parsed.valid) };
}

/** Last 9 digits: catches leads whose stored phone lacks/has a different prefix format. */
export function nationalTail(e164) {
  const digits = String(e164 || '').replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : null;
}

/**
 * Classify candidate leads (already filtered to non-deleted). A candidate counts only when
 * one of its stored numbers normalises to the SAME E.164 as the caller.
 */
export function classifyMatch(callerE164, candidates = [], region = 'CH') {
  if (!callerE164) return { status: 'unknown', leadId: null, leadIds: [] };
  const hits = [];
  for (const lead of candidates) {
    const numbers = [lead.normalizedPhone, lead.phone, lead.mobile].filter(Boolean);
    const same = numbers.some((n) => (String(n).startsWith('+') && n === callerE164) || normalizePhone(String(n), region).e164 === callerE164);
    if (same) hits.push(String(lead._id));
  }
  const unique = [...new Set(hits)];
  if (unique.length === 0) return { status: 'new', leadId: null, leadIds: [] };
  if (unique.length === 1) return { status: 'existing', leadId: unique[0], leadIds: unique };
  return { status: 'ambiguous', leadId: null, leadIds: unique.slice(0, 10) };
}

export function maskNumber(e164) {
  if (!e164) return null;
  return e164.length > 6 ? `${e164.slice(0, 4)}•••${e164.slice(-3)}` : '•••';
}
