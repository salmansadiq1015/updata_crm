/**
 * Human transfer policy (pure, no I/O): who may take a transfer right now, how
 * long to ring them, and what the agent says when nobody can.
 */

export const HANDOFF_STATUSES = Object.freeze(['ringing', 'accepted', 'declined', 'timeout', 'unavailable', 'failed']);
export const HANDOFF_TERMINAL = new Set(['accepted', 'declined', 'timeout', 'unavailable', 'failed']);
export const HANDOFF_FALLBACK = new Set(['declined', 'timeout', 'unavailable', 'failed']);
export const DEFAULT_TRANSFER_TIMEOUT_SECONDS = 30;
export const MIN_TRANSFER_TIMEOUT_SECONDS = 10;
export const MAX_TRANSFER_TIMEOUT_SECONDS = 120;

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const minutes = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Local weekday + minutes-of-day in a time zone (falls back to UTC for an unknown zone). */
export function localClock(timezone, now = new Date()) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone || 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  }
  const get = type => parts.find(p => p.type === type)?.value;
  return { day: String(get('weekday')).slice(0, 3).toLowerCase(), minute: Number(get('hour')) % 24 * 60 + Number(get('minute')) };
}

/**
 * Within the person's working hours? No hours configured = always within.
 * hours = { timezone, days: ['mon',…] | [1..5], start: 'HH:MM', end: 'HH:MM' }; an
 * end before start spans midnight.
 */
export function withinWorkingHours(hours, now = new Date()) {
  if (!hours || (!hours.start && !hours.end && !(hours.days || []).length)) return true;
  const { day, minute } = localClock(hours.timezone, now);
  const days = (hours.days || []).map(d => (typeof d === 'number' ? DAY_KEYS[d] : String(d).slice(0, 3).toLowerCase()));
  const start = minutes(hours.start);
  const end = minutes(hours.end);
  if (start == null || end == null) return !days.length || days.includes(day);
  if (start === end) return !days.length || days.includes(day);
  if (start < end) return (!days.length || days.includes(day)) && minute >= start && minute < end;
  // Overnight shift: the part after midnight belongs to the previous day's shift.
  if (minute >= start) return !days.length || days.includes(day);
  if (minute < end) {
    const previous = DAY_KEYS[(DAY_KEYS.indexOf(day) + 6) % 7];
    return !days.length || days.includes(previous);
  }
  return false;
}

/**
 * Pick who to ring. Order follows the agent's configured target list. A target
 * qualifies when they switched "available for transfers" on, have the CRM open
 * (an online socket), are inside their working hours, and are not already on
 * another transfer. Returns { eligible, skipped:[{userId, reason}] }.
 */
export function selectTransferTargets({ targetUserIds = [], presences = [], online = new Set(), busy = new Set(), now = new Date() }) {
  const byUser = new Map(presences.map(p => [String(p.userId), p]));
  const eligible = [];
  const skipped = [];
  for (const raw of [...new Set(targetUserIds.map(String))]) {
    const presence = byUser.get(raw);
    if (!presence?.available) { skipped.push({ userId: raw, reason: 'not_available' }); continue; }
    if (!online.has(raw)) { skipped.push({ userId: raw, reason: 'offline' }); continue; }
    if (!withinWorkingHours(presence.workingHours, now)) { skipped.push({ userId: raw, reason: 'outside_working_hours' }); continue; }
    if (busy.has(raw)) { skipped.push({ userId: raw, reason: 'busy' }); continue; }
    eligible.push({ userId: raw, phone: presence.phone || null });
  }
  return { eligible, skipped };
}

export function clampTimeout(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return DEFAULT_TRANSFER_TIMEOUT_SECONDS;
  return Math.min(MAX_TRANSFER_TIMEOUT_SECONDS, Math.max(MIN_TRANSFER_TIMEOUT_SECONDS, Math.round(n)));
}

// Scripted fallback, spoken faithfully by the agent. {company} is substituted.
const FALLBACK_SCRIPTS = {
  en: 'I’m sorry, none of my colleagues at {company} can take the call right now. I can arrange for someone to call you back. When would suit you best?',
  ur: 'معذرت، اس وقت {company} کا کوئی ساتھی کال نہیں لے سکتا۔ میں آپ کو واپس کال کروانے کا انتظام کر سکتا ہوں۔ آپ کے لیے کون سا وقت بہتر رہے گا؟',
  hi: 'माफ़ कीजिए, इस समय {company} का कोई साथी कॉल नहीं ले सकता। मैं आपको वापस कॉल करवाने की व्यवस्था कर सकता हूँ। आपके लिए कौन सा समय ठीक रहेगा?',
  de: 'Es tut mir leid, gerade kann niemand von {company} das Gespräch übernehmen. Ich kann einen Rückruf veranlassen. Wann passt es Ihnen am besten?',
  fr: 'Je suis désolé, aucun de mes collègues de {company} ne peut prendre l’appel pour le moment. Je peux organiser un rappel. Quel moment vous conviendrait le mieux ?',
  ar: 'عذرًا، لا يمكن لأي من زملائي في {company} استلام المكالمة الآن. يمكنني ترتيب معاودة الاتصال بك. ما الوقت الأنسب لك؟',
  es: 'Lo siento, ahora mismo ningún compañero de {company} puede atender la llamada. Puedo organizar que le devuelvan la llamada. ¿Qué momento le viene mejor?',
};
const HOLD_SCRIPTS = {
  en: 'Let me connect you with a colleague. Please stay on the line for a moment.',
  ur: 'میں آپ کو اپنے ساتھی سے ملاتا ہوں۔ براہ کرم ایک لمحہ لائن پر رہیں۔',
  hi: 'मैं आपको अपने साथी से जोड़ता हूँ। कृपया एक पल लाइन पर बने रहें।',
  de: 'Ich verbinde Sie mit einer Kollegin oder einem Kollegen. Bitte bleiben Sie einen Moment dran.',
  fr: 'Je vous mets en relation avec un collègue. Merci de rester en ligne un instant.',
  ar: 'سأوصلك بأحد زملائي. يرجى البقاء على الخط لحظة.',
  es: 'Le paso con un compañero. Por favor, no cuelgue un momento.',
};

export function scriptLanguage(language) {
  const code = String(language || '').toLowerCase().split('-')[0];
  return FALLBACK_SCRIPTS[code] ? code : 'en';
}

export function fallbackScript(language, { company = 'our company' } = {}) {
  const lang = scriptLanguage(language);
  return { language: lang, text: FALLBACK_SCRIPTS[lang].replace('{company}', company || 'our company') };
}

export function holdScript(language) {
  const lang = scriptLanguage(language);
  return { language: lang, text: HOLD_SCRIPTS[lang] };
}

/** Mongo filter fragment: calls a person took over stay open while they talk (bounded). */
export function activeHandoffExemption(now = new Date(), maxHumanMs = 2 * 3600_000) {
  return { $or: [{ 'handoff.status': { $ne: 'accepted' } }, { 'handoff.acceptedAt': { $lt: new Date(now.getTime() - maxHumanMs) } }] };
}

/** Added to the agent's instructions only when its agent has transfer targets configured. */
export const TRANSFER_PROMPT_RULE = [
  'Human transfer: if the person asks for a human, or needs something only a person can give (a price, deal or commitment that is not in the approved knowledge), call request_human_transfer with a short reason and a factual summary of the call so far.',
  'While the transfer rings, do not ask questionnaire questions. Follow the instruction the tool returns.',
].join(' ');
