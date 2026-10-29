/**
 * Deterministic, quote-evidenced insights for one SMS reply (no I/O, no LLM):
 *
 *   detectLanguage(text)        → 'ur' | 'ar' | 'roman-ur' | 'en' | 'mixed' | 'unknown'
 *   detectIntents(text)         → [{ intent, evidence }]  (evidence = verbatim substring)
 *   parseCallbackTime(text, …)  → { at, needsTime, evidence }
 *   replyInsights(text, …)      → { language, intent, intents, callback }
 *
 * Intents: stop | callback | not_interested | interested | question.
 * STOP stays keyword-only (smsCopy.isStopRequest): an insight never opts a
 * lead out by itself. Every other intent carries the exact words it was based
 * on, so a human can see why the system thinks so.
 */
import { isStopRequest } from './smsCopy.js';
import { parseSpokenDate } from '../../aiCalling/engine/answerValidation.js';

const ARABIC_SCRIPT = /[؀-ۿݐ-ݿ]/;
// Letters used by Urdu but not by standard Arabic.
const URDU_LETTERS = /[ٹڈڑںھہےۓگچپژک]/;
const LATIN = /[A-Za-z]/;

const ROMAN_URDU_WORDS = new Set([
  'haan', 'han', 'hanji', 'ji', 'jee', 'nahi', 'nahin', 'nai', 'nhi', 'kal', 'parson', 'baad', 'bad', 'mein', 'main', 'mai',
  'karein', 'karen', 'krein', 'kren', 'karo', 'kro', 'kar', 'kr', 'kya', 'kia', 'kyun', 'kyu', 'hai', 'hain', 'hy', 'ho', 'mujhe', 'mujhay',
  'aap', 'ap', 'apko', 'aapko', 'bhai', 'theek', 'thik', 'acha', 'accha', 'achha', 'zaroor', 'zarur', 'bilkul', 'abhi', 'shaam', 'sham',
  'subah', 'dopahar', 'baje', 'bje', 'raat', 'chahiye', 'chahye', 'chaiye', 'wapis', 'wapas', 'rabta', 'batayein', 'bataen', 'bataiye',
  'pata', 'maloom', 'shukriya', 'shukria', 'kitna', 'kitne', 'kaise', 'kab', 'kahan', 'kaun', 'aur', 'lekin', 'magar', 'ghante', 'ghanta',
  'dilchaspi', 'zaroorat', 'zarurat', 'filhal', 'phir', 'dobara', 'bhejein', 'bhejo', 'karna', 'krna', 'hum', 'mera', 'meri', 'humein',
]);
const ENGLISH_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'am', 'i', 'you', 'we', 'me', 'my', 'please', 'call', 'yes', 'no', 'not', 'thanks', 'thank', 'interested',
  'tomorrow', 'today', 'later', 'what', 'how', 'when', 'why', 'where', 'can', 'could', 'would', 'will', 'do', 'does', 'have', 'has', 'want',
  'need', 'budget', 'about', 'more', 'details', 'send', 'info', 'sure', 'ok', 'okay', 'back', 'after', 'evening', 'morning', 'and', 'or',
  'it', 'this', 'that', 'for', 'to', 'of', 'in', 'on', 'at', 'with', 'be', 'pm', 'am', 'busy', 'now', 'right',
]);

const words = (text) => String(text || '').toLowerCase().match(/[a-z']+/g) || [];

export function detectLanguage(text) {
  const t = String(text || '');
  const arabic = ARABIC_SCRIPT.test(t);
  const latinWords = words(t).filter((w) => w.length > 0);
  if (arabic && LATIN.test(t)) {
    // "OK" or a brand name next to Urdu script is still Urdu.
    return latinWords.length >= 2 ? 'mixed' : (URDU_LETTERS.test(t) ? 'ur' : 'ar');
  }
  if (arabic) return URDU_LETTERS.test(t) ? 'ur' : 'ar';
  if (!latinWords.length) return 'unknown';
  const ru = latinWords.filter((w) => ROMAN_URDU_WORDS.has(w)).length;
  const en = latinWords.filter((w) => ENGLISH_WORDS.has(w) && !ROMAN_URDU_WORDS.has(w)).length;
  if (ru && en) return ru >= en ? 'roman-ur' : 'mixed';
  if (ru) return 'roman-ur';
  if (en) return 'en';
  return 'unknown';
}

// Ordered: the first matching pattern of an intent provides the evidence quote.
const PATTERNS = {
  callback: [
    /\b(?:please\s+)?(?:call|ring|phone)\s+(?:me|us)(?:\s+(?:back|later|tomorrow|today|in the (?:morning|evening|afternoon)|after\s+\S+|at\s+\S+))?/i,
    /\b(?:call\s*back|callback|give me a call|call later|contact me later|talk later)\b/i,
    /\b(?:baad|bad)\s+(?:mein|main|me|mai)\s+(?:call|phone|fone|baat|rabta)(?:\s+(?:karein|karen|krein|kren|karo|kro|kar\s+lein|kar\s+lena|karna))?/i,
    /\b(?:call|phone|fone)\s+(?:karein|karen|krein|kren|karo|kro|kar\s+lein|kar\s+lena|kar\s+do|karna|krna|kijiye|kijiyega)\b/i,
    /\b(?:wapis|wapas|dobara)\s+(?:call|phone|fone|rabta)\b/i,
    /(?:کال|فون)\s*(?:کریں|کرو|کیجیے|کیجئے|کیجیئے|کر\s*لیں|کر\s*دیں|کرنا)/,
    /بعد\s*میں\s*(?:کال|فون|بات|رابطہ)/,
    /رابطہ\s*کریں/,
  ],
  not_interested: [
    /\b(?:not\s+interested|no\s+thanks|no\s+thank\s+you|don'?t\s+(?:want|need)\s+(?:it|this|that|any)|not\s+now|no\s+need)\b/i,
    /\b(?:nahi|nahin|nai|nhi)\s+(?:chahiye|chahye|chaiye)\b/i,
    /\b(?:zaroorat|zarurat|dilchaspi|interest)\s+(?:nahi|nahin|nai|nhi)\b/i,
    /(?:نہیں\s*چاہیے|ضرورت\s*نہیں|دلچسپی\s*نہیں)/,
  ],
  interested: [
    /\b(?:i'?m\s+interested|we'?re\s+interested|interested|sounds\s+good|tell\s+me\s+more|send\s+(?:me\s+)?(?:the\s+)?(?:details|info|information|price|prices)|yes\s+please)\b/i,
    /\b(?:dilchaspi|interest)\s+(?:hai|hy|he)\b/i,
    /\b(?:details|tafseel)\s+(?:bhejein|bhejo|bhej\s+dein|send\s+karein)\b/i,
    /\b(?:zaroor|zarur|bilkul)\b/i,
    /(?:دلچسپی\s*ہے|تفصیل\s*بھیجیں|ضرور|بالکل)/,
  ],
  question: [
    /[^\s][^?؟]*[?؟]/,
    /^\s*(?:what|how|why|when|where|who|which|can|could|is|are|do|does|will)\b[^.!]*/i,
    /\b(?:kya|kia|kaise|kaisay|kyun|kyu|kab|kahan|kaun|kitna|kitne|kitni)\b[^.!]*/i,
    /(?:کیا|کیسے|کیوں|کب|کہاں|کون|کتنا|کتنے|کتنی)[^۔!]*/,
  ],
};

/** All intents with their verbatim evidence (a substring of the original reply). */
export function detectIntents(text) {
  const raw = String(text || '');
  const out = [];
  if (isStopRequest(raw)) return [{ intent: 'stop', evidence: raw.trim() }];
  const found = {};
  for (const [intent, patterns] of Object.entries(PATTERNS)) {
    for (const re of patterns) {
      const m = raw.match(re);
      if (m && m[0].trim()) { found[intent] = m[0].trim(); break; }
    }
  }
  // "nahi chahiye" also contains "chahiye"; "not interested" contains "interested".
  if (found.not_interested) delete found.interested;
  for (const intent of ['callback', 'not_interested', 'interested', 'question']) {
    if (found[intent]) out.push({ intent, evidence: found[intent] });
  }
  return out;
}

// ------------------------------------------------------------------ time parsing
const EASTERN_DIGITS = { '۰': 0, '۱': 1, '۲': 2, '۳': 3, '۴': 4, '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9, '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9 };
const westernDigits = (t) => String(t || '').replace(/[۰-۹٠-٩]/g, (d) => String(EASTERN_DIGITS[d]));
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Local wall-clock parts of `date` in `timezone`. */
function zonedParts(date, timezone) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(date).map((x) => [x.type, x.value]));
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), h: Number(p.hour), min: Number(p.minute), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday) };
}

/** UTC instant of a local wall-clock time in `timezone` (DST-safe to the hour). */
export function zonedTimeToUtc({ y, m, d, h, min }, timezone) {
  let guess = Date.UTC(y, m - 1, d, h, min);
  for (let i = 0; i < 3; i += 1) {
    const p = zonedParts(new Date(guess), timezone);
    const diff = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Date.UTC(y, m - 1, d, h, min);
    if (!diff) break;
    guess -= diff;
  }
  return new Date(guess);
}

function addDays({ y, m, d }, days) {
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function parseClock(t) {
  // 5pm, 5:30 pm, 17:00, "5 baje", "shaam 5 baje", "5 بجے", "شام 5 بجے"
  let m = t.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i);
  if (m) {
    let h = Number(m[1]) % 12; if (/p/i.test(m[3])) h += 12;
    return { h, min: Number(m[2] || 0), evidence: m[0] };
  }
  m = t.match(/(?:\b(subah|subha|sobah|dopahar|dopehar|sham|shaam|raat|rat)\s+)?\b(\d{1,2})(?:[:.](\d{2}))?\s*(?:baje|bje|bajay|بجے)/i)
    || t.match(/(?:(صبح|دوپہر|شام|رات)\s*)?(\d{1,2})(?:[:.](\d{2}))?\s*بجے/);
  if (m) {
    let h = Number(m[2]);
    const part = (m[1] || '').toLowerCase();
    const afternoon = /dopahar|dopehar|sham|shaam|raat|rat|دوپہر|شام|رات/.test(part);
    if (afternoon && h < 12) h += 12;
    // Without a part of day, "5 baje" in a business context means 17:00; 8–11 stays morning.
    if (!part && h >= 1 && h <= 7) h += 12;
    return { h, min: Number(m[3] || 0), evidence: m[0] };
  }
  m = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) return { h: Number(m[1]), min: Number(m[2]), evidence: m[0] };
  m = t.match(/\bat\s+(\d{1,2})\b/i);
  if (m && Number(m[1]) <= 12) { let h = Number(m[1]); if (h >= 1 && h <= 7) h += 12; return { h, min: 0, evidence: m[0] }; }
  return null;
}

function parseRelative(t) {
  let m = t.match(/\bin\s+(\d{1,3})\s*(hours?|hrs?|minutes?|mins?)\b/i)
    || t.match(/\b(\d{1,3})\s*(ghante|ghanta|ghantay|minute|mint|min)\s+(?:baad|bad|mein|main)\b/i)
    || t.match(/(\d{1,3})\s*(گھنٹے|گھنٹہ|منٹ)\s*(?:بعد|میں)/);
  if (!m) return null;
  const n = Number(m[1]);
  const hours = /hour|hr|ghant|گھنٹ/i.test(m[2]);
  return { ms: n * (hours ? 3_600_000 : 60_000), evidence: m[0] };
}

function parseDay(t, today) {
  let m = t.match(/\b(today|aaj|aj)\b|آج/i);
  if (m) return { offset: 0, evidence: m[0] };
  m = t.match(/\b(day after tomorrow|parson|parso)\b|پرسوں/i);
  if (m) return { offset: 2, evidence: m[0] };
  m = t.match(/\b(tomorrow|tmrw|tmr|kal)\b|کل/i);
  if (m) return { offset: 1, evidence: m[0] };
  m = t.match(new RegExp(`\\b(?:on\\s+|next\\s+)?(${WEEKDAYS.join('|')})\\b`, 'i'));
  if (m) {
    const target = WEEKDAYS.indexOf(m[1].toLowerCase());
    let offset = (target - today.weekday + 7) % 7;
    if (offset === 0) offset = 7;
    return { offset, evidence: m[0] };
  }
  return null;
}

/**
 * Parse the callback time a lead asked for. Explicit clock times are resolved in
 * the lead's timezone; a day without a time ("kal call karein") is NOT turned
 * into an invented hour — it returns needsTime with the evidence.
 */
export function parseCallbackTime(text, { now = new Date(), timezone = 'UTC' } = {}) {
  const t = westernDigits(text);
  const tz = timezone || 'UTC';
  const rel = parseRelative(t);
  if (rel) return { at: new Date(now.getTime() + rel.ms), needsTime: false, evidence: rel.evidence, explicit: true };
  const today = zonedParts(now, tz);
  const clock = parseClock(t);
  const day = parseDay(t, today);
  let date = null;
  const spoken = parseSpokenDate(t, now);
  if (spoken) { const [y, m, d] = spoken.split('-').map(Number); date = { y, m, d }; }
  else if (day) date = addDays(today, day.offset);
  if (!clock) return { at: null, needsTime: true, evidence: day?.evidence || null, dayOnly: date, explicit: false };
  if (clock.h > 23 || clock.min > 59) return { at: null, needsTime: true, evidence: clock.evidence, explicit: false };
  let target = date || { y: today.y, m: today.m, d: today.d };
  let at = zonedTimeToUtc({ ...target, h: clock.h, min: clock.min }, tz);
  if (!date && at <= now) { target = addDays(target, 1); at = zonedTimeToUtc({ ...target, h: clock.h, min: clock.min }, tz); }
  const evidence = [day?.evidence, clock.evidence].filter(Boolean).join(' … ');
  return { at, needsTime: false, evidence, explicit: true };
}

/** Everything the CRM shows about one reply. */
export function replyInsights(text, { now = new Date(), timezone = 'UTC' } = {}) {
  const intents = detectIntents(text);
  const intent = intents[0]?.intent || null;
  const callback = intents.some((i) => i.intent === 'callback') ? parseCallbackTime(text, { now, timezone }) : null;
  return { language: detectLanguage(text), intent, intents, callback };
}

/** Conversation-level rollup over inbound replies (latest decisive intent wins). */
export function conversationInsightsSummary(inboundMessages = []) {
  const langs = {};
  let intent = null; let evidence = null; let callback = null;
  for (const m of inboundMessages) {
    const ins = m.interpretation?.insights || replyInsights(m.body || '');
    if (ins.language && ins.language !== 'unknown') langs[ins.language] = (langs[ins.language] || 0) + 1;
    const top = ins.intents?.[0];
    if (top && top.intent !== 'question') { intent = top.intent; evidence = top.evidence; }
    else if (top && !intent) { intent = top.intent; evidence = top.evidence; }
    if (ins.callback) callback = ins.callback;
  }
  const languages = Object.keys(langs);
  const language = !languages.length ? 'unknown' : (languages.length === 1 ? languages[0] : (languages.includes('mixed') ? 'mixed' : languages.sort((a, b) => langs[b] - langs[a])[0]));
  return { language, languages: langs, intent, evidence, callback };
}
