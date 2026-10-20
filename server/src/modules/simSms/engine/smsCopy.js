/**
 * Pure SMS copy + text helpers for the SIM SMS agent (no I/O, unit-tested).
 * Outbound wording is deterministic: the server decides exactly what is sent,
 * so every message is reviewable, predictable and identifies the sender.
 */
import { STOP_KEYWORDS } from '../simSms.constants.js';

const GSM7 = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7_EXT = '^{}\\[~]|€';

export function smsEncoding(text) {
  for (const ch of String(text)) {
    if (!GSM7.includes(ch) && !GSM7_EXT.includes(ch)) return 'UCS-2';
  }
  return 'GSM-7';
}

/** Segment count as the carrier bills it. */
export function smsSegments(text) {
  const s = String(text || '');
  if (!s) return 0;
  if (smsEncoding(s) === 'UCS-2') {
    const units = [...s].reduce((n, ch) => n + (ch.codePointAt(0) > 0xffff ? 2 : 1), 0);
    return units <= 70 ? 1 : Math.ceil(units / 67);
  }
  const septets = [...s].reduce((n, ch) => n + (GSM7_EXT.includes(ch) ? 2 : 1), 0);
  return septets <= 160 ? 1 : Math.ceil(septets / 153);
}

const strip = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
const STOP_SET = new Set(STOP_KEYWORDS.map(strip));

/** A reply that is (only) an opt-out keyword. "Stop by tomorrow?" is not an opt-out. */
export function isStopRequest(text) {
  const t = strip(text);
  return Boolean(t) && STOP_SET.has(t);
}

function fill(template, vars) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

function optionsHint(question) {
  const opts = (question.options || []).map((o) => (typeof o === 'object' ? (o.label || o.value) : o)).filter(Boolean);
  if (['boolean'].includes(question.type)) return ' (yes/no)';
  if (opts.length && opts.length <= 6) return ` (${opts.join(' / ')})`;
  return '';
}

/**
 * Build the outbound text for an engine action.
 * @param {object} p
 * @param {'opening'|'question'|'clarify'|'confirm'|'reminder'|'closing'|'stop_ack'} p.kind
 */
export function buildMessage({ kind, agent = {}, lead = {}, question = null, previousValue = null }) {
  const vars = {
    name: lead.contactName || lead.name || '',
    company: agent.organizationName || '',
    agent: agent.agentName || '',
  };
  const q = question ? `${question.text}${optionsHint(question)}` : '';
  switch (kind) {
    case 'opening': {
      const intro = fill(agent.intro || 'Hello{name_sep}{name}, this is {agent} from {company} (automated assistant). Reply STOP to opt out.', {
        ...vars, name_sep: vars.name ? ' ' : '',
      }).replace(/\s+,/g, ',').trim();
      return `${intro} ${q}`.trim();
    }
    case 'question': return q;
    case 'clarify': return `Sorry, I didn't quite get that. ${q}`;
    case 'confirm': return `Just to confirm: ${question?.label || 'your answer'} = "${previousValue ?? ''}". Is that right? (yes/no)`;
    case 'reminder': return `Friendly reminder from ${vars.company || vars.agent || 'us'}: ${q} (Reply STOP to opt out.)`;
    case 'closing': return fill(agent.closing || 'Thank you{name_sep}{name}! We have noted your answers. {company}', { ...vars, name_sep: vars.name ? ', ' : '' }).trim();
    case 'stop_ack': return `You will not receive further messages from ${vars.company || 'us'}.`;
    default: return q;
  }
}

/** Compare phone numbers by their last 9 digits (country-code/formatting agnostic). */
export function sameNumberTail(a, b, digits = 9) {
  const da = String(a || '').replace(/\D/g, '');
  const db = String(b || '').replace(/\D/g, '');
  if (da.length < 6 || db.length < 6) return false;
  return da.slice(-digits) === db.slice(-digits);
}
