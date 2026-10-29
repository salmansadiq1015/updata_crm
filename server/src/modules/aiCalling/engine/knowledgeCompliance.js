/**
 * Approved business knowledge → agent instructions, version diffs, and a
 * deterministic post-call compliance check (pure, no I/O).
 *
 * The voice agent only ever receives a PUBLISHED knowledge version snapshot. After
 * the call, every agent utterance is scanned for currency amounts and promise
 * phrases; anything not backed by the snapshot is flagged for a person to review.
 * This is a heuristic flagger (it can miss paraphrases and over-flag), not proof of
 * a violation, and it never changes the call outcome.
 */
import { normalizeWs } from './callIntelligence.js';

export const KNOWLEDGE_TYPES = Object.freeze(['product', 'pricing', 'policy', 'promise', 'faq']);
export const KNOWLEDGE_SECTION_MAX_CHARS = 3500;
export const COMPLIANCE_VERSION = 1;

const clip = (v, n) => { const s = normalizeWs(v); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

/** The entry text for the agent's language (variants are optional translations). */
export function localized(entry, language) {
  const lang = String(language || '').toLowerCase().split('-')[0];
  const variant = (entry.variants || []).find(v => String(v.language || '').toLowerCase().split('-')[0] === lang && (v.content || v.title));
  return { title: variant?.title || entry.title, content: variant?.content || entry.content };
}

export function formatPrice(price) {
  if (!price || price.amount == null) return '';
  const amount = Number(price.amount).toLocaleString('en-US', { maximumFractionDigits: 2 });
  return [price.currency ? `${amount} ${price.currency}` : amount, price.unit ? `per ${price.unit}` : ''].filter(Boolean).join(' ');
}

/**
 * Compact instructions section from a published snapshot. Returns null when the
 * snapshot has no entries (the agent prompt is then unchanged).
 */
export function buildKnowledgeSection(snapshot, { language = null, maxChars = KNOWLEDGE_SECTION_MAX_CHARS } = {}) {
  const entries = snapshot?.entries || [];
  if (!entries.length) return null;
  const lines = [
    `APPROVED BUSINESS KNOWLEDGE (published version ${snapshot.version}).`,
    'Rules: state prices, discounts, guarantees and other commitments ONLY exactly as listed here.',
    'If the person asks about anything not covered (another price, a custom deal, a promise not listed), say a team member will follow up with the details. Never estimate or invent.',
  ];
  const byType = (type) => entries.filter(e => e.type === type);
  for (const [type, heading] of [['product', 'Products and services'], ['pricing', 'Prices'], ['policy', 'Policies'], ['faq', 'Answers to common questions']]) {
    const group = byType(type);
    if (!group.length) continue;
    lines.push(`${heading}:`);
    for (const entry of group) {
      const { title, content } = localized(entry, language);
      const price = formatPrice(entry.price);
      lines.push(`- ${clip(title, 120)}${price ? ` — ${price}` : ''}${content ? `: ${clip(content, 400)}` : ''}`);
    }
  }
  const promises = [...new Set(entries.flatMap(e => [...(e.allowedPromises || []), ...(e.type === 'promise' ? [localized(e, language).content || e.title] : [])]).map(p => clip(p, 200)).filter(Boolean))];
  if (promises.length) {
    lines.push('Commitments you may make (word them faithfully, add nothing):');
    for (const p of promises) lines.push(`- ${p}`);
  }
  const forbidden = [...new Set(entries.flatMap(e => e.forbiddenClaims || []).map(p => clip(p, 200)).filter(Boolean))];
  if (forbidden.length) {
    lines.push('Never say or imply:');
    for (const p of forbidden) lines.push(`- ${p}`);
  }
  let text = lines.join('\n');
  const suffix = '\n(Knowledge list truncated: anything not shown is not approved.)';
  if (text.length > maxChars) text = `${text.slice(0, Math.max(0, maxChars - suffix.length))}${suffix}`;
  return text;
}

/** Strings to compare on: an entry's identity-relevant fields. */
function comparable(entry) {
  return {
    type: entry.type, title: entry.title, content: entry.content,
    price: entry.price ? JSON.stringify({ amount: entry.price.amount ?? null, currency: entry.price.currency || null, unit: entry.price.unit || null }) : null,
    allowedPromises: JSON.stringify(entry.allowedPromises || []),
    forbiddenClaims: JSON.stringify(entry.forbiddenClaims || []),
    variants: JSON.stringify((entry.variants || []).map(v => ({ language: v.language, title: v.title, content: v.content }))),
    tags: JSON.stringify(entry.tags || []),
  };
}

/** Entry-level diff between two version snapshots (from → to). */
export function diffKnowledgeVersions(from, to) {
  const key = e => String(e.entryId || e._id || e.title);
  const before = new Map((from?.entries || []).map(e => [key(e), e]));
  const after = new Map((to?.entries || []).map(e => [key(e), e]));
  const added = [];
  const removed = [];
  const changed = [];
  for (const [id, entry] of after) {
    const old = before.get(id);
    if (!old) { added.push({ entryId: id, title: entry.title, type: entry.type }); continue; }
    const a = comparable(old);
    const b = comparable(entry);
    const fields = Object.keys(b).filter(f => a[f] !== b[f]).map(f => ({ field: f, before: a[f], after: b[f] }));
    if (fields.length) changed.push({ entryId: id, title: entry.title, type: entry.type, fields });
  }
  for (const [id, entry] of before) if (!after.has(id)) removed.push({ entryId: id, title: entry.title, type: entry.type });
  return { fromVersion: from?.version ?? null, toVersion: to?.version ?? null, added, removed, changed };
}

// ---- compliance -------------------------------------------------------------

const DIGIT_MAP = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9', '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9' };
const asciiDigits = s => String(s).replace(/[٠-٩۰-۹]/g, d => DIGIT_MAP[d]);

const CURRENCY = String.raw`(?:\$|€|£|₨|rs\.?|pkr|usd|eur|gbp|chf|aed|sar|inr|rupees?|dollars?|euros?|pounds?|francs?|dirhams?|riyals?|روپے|روپیہ|ڈالر|دولار|يورو|درهم|ريال)`;
const NUMBER = String.raw`\d{1,3}(?:[,.' ]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
const SCALE = String.raw`(?:\s*(k|thousand|hazar|hazaar|ہزار|lakh|lac|لاکھ|million|m|crore|کروڑ))?`;
const AMOUNT_RE = new RegExp(String.raw`(${CURRENCY})\s*(${NUMBER})${SCALE}|(${NUMBER})${SCALE}\s*(${CURRENCY})`, 'giu');
const SCALES = { k: 1e3, thousand: 1e3, hazar: 1e3, hazaar: 1e3, 'ہزار': 1e3, lakh: 1e5, lac: 1e5, 'لاکھ': 1e5, million: 1e6, m: 1e6, crore: 1e7, 'کروڑ': 1e7 };

function toNumber(raw, scale) {
  let s = String(raw).trim();
  // "1,234,567" / "1.234.567" / "1'234" / "5 000" are thousands groups; "1,234.50" keeps its decimals.
  if (/^\d{1,3}([,.' ]\d{3})+$/.test(s)) s = s.replace(/[,.' ]/g, '');
  else if (/^\d{1,3}([,' ]\d{3})+\.\d+$/.test(s)) s = s.replace(/[,' ]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n * (scale ? SCALES[String(scale).toLowerCase()] || 1 : 1) : null;
}

/** Currency amounts spoken in a text: [{ amount, raw }]. */
export function extractAmounts(text) {
  const out = [];
  const source = asciiDigits(text);
  for (const m of source.matchAll(AMOUNT_RE)) {
    const amount = m[2] ? toNumber(m[2], m[3]) : toNumber(m[4], m[5]);
    if (amount != null) out.push({ amount, raw: m[0].trim() });
  }
  return out;
}

// Phrases that turn a sentence into a commitment. English, German, French, Arabic, Urdu (script + Roman).
const PROMISE_RE = /\b(guarantee[ds]?|guaranteed|we promise|i promise|promise you|money[- ]back|refund|free of charge|for free|free trial|no cost|at no charge|lifetime|risk[- ]free|100\s?%|discount|cashback|garantiert?|kostenlos|gratis|rabatt|versprechen|garanti[es]?|gratuit|remboursement|promets|remise|muft|guarantee dete|wada|waada)\b|مفت|گارنٹی|ضمانت|وعدہ|رعایت|مجاني|مجانا|خصم|نضمن|أعدك/iu;

const tokens = s => normalizeWs(s).toLowerCase().replace(/[^\p{L}\p{N}\s%]/gu, ' ').split(/\s+/).filter(t => t.length > 2);
function overlap(a, b) {
  const ta = new Set(tokens(a));
  const tb = tokens(b);
  if (!ta.size || !tb.length) return 0;
  return tb.filter(t => ta.has(t)).length / tb.length;
}

/** Everything a snapshot approves: amounts and promise phrases. */
export function approvedSet(snapshot) {
  const entries = snapshot?.entries || [];
  const amounts = new Set();
  for (const e of entries) {
    if (e.price?.amount != null) amounts.add(Number(e.price.amount));
    for (const text of [e.content, e.title, ...(e.variants || []).map(v => v.content), ...(e.allowedPromises || [])]) {
      for (const { amount } of extractAmounts(text || '')) amounts.add(amount);
    }
  }
  const promises = entries.flatMap(e => [...(e.allowedPromises || []), ...(e.type === 'promise' ? [e.content, e.title, ...(e.variants || []).map(v => v.content)] : [])]).filter(Boolean);
  const forbidden = entries.flatMap(e => e.forbiddenClaims || []).filter(Boolean);
  return { amounts, promises, forbidden };
}

/**
 * Flag agent utterances that state a price or a commitment the snapshot does not
 * contain, or that use a forbidden claim. Without a snapshot every price/promise
 * the agent states is unapproved.
 */
export function checkCompliance(turns = [], snapshot = null) {
  const { amounts, promises, forbidden } = approvedSet(snapshot);
  const flags = [];
  turns.forEach((turn, turnIndex) => {
    if (turn.role !== 'assistant') return;
    const text = normalizeWs(turn.text);
    if (!text) return;
    for (const { amount, raw } of extractAmounts(text)) {
      if (!amounts.has(amount)) flags.push({ kind: 'unapproved_price', turnIndex, quote: raw, detail: `Amount ${amount} is not in the approved knowledge${snapshot ? ` (version ${snapshot.version})` : ''}`, severity: 'high' });
    }
    const lower = text.toLowerCase();
    for (const claim of forbidden) {
      if (lower.includes(normalizeWs(claim).toLowerCase())) flags.push({ kind: 'forbidden_claim', turnIndex, quote: clip(claim, 300), detail: 'The agent used a claim marked as forbidden', severity: 'high' });
    }
    const promise = text.match(PROMISE_RE);
    if (promise && !promises.some(p => lower.includes(normalizeWs(p).toLowerCase()) || overlap(text, p) >= 0.6)) {
      flags.push({ kind: 'unapproved_promise', turnIndex, quote: clip(text, 300), detail: `Commitment wording ("${promise[0]}") does not match an approved promise`, severity: 'medium' });
    }
  });
  return flags.slice(0, 50);
}
