/**
 * Deterministic, per-field-type answer validation + normalization.
 *
 * The AI model proposes a raw answer; this module decides whether it is a valid,
 * normalized value for the configured question type. It is pure (no I/O) so it is
 * cheap to unit-test exhaustively and identical on the server and in tests.
 *
 * It never invents a value: an empty / "I don't know" answer returns
 * { validation: 'unknown' } rather than a guess, and an un-parseable answer
 * returns { validation: 'invalid' }.
 */

const UNKNOWN_PATTERNS = [
  /^\s*$/i,
  /^(i\s+)?(don'?t|do not)\s+know\b/i,
  /^(not\s+sure|no\s+idea|unsure|unknown|n\/?a|dunno)\b/i,
  /^(i\s+)?(can'?t|cannot)\s+say\b/i,
  /^(keine\s+ahnung|weiss\s+nicht|weiß\s+nicht)\b/i, // de
  /^(pata\s+nahi|pata\s+nahin|maloom\s+nahi|maloom\s+nahin|maalum\s+nahi|nahi\s+pata)\b/i, // Roman Urdu
  /^(پتا نہیں|پتہ نہیں|معلوم نہیں)/, // Urdu
];

const YES_WORDS = /^(yes|yeah|yep|yup|sure|correct|right|absolutely|of course|ok|okay|ja|oui|si)\b/i;
const NO_WORDS = /^(no|nope|nah|not really|negative|incorrect|nein|non)\b/i;
// Roman Urdu / Urdu script (\b is ASCII-only, so Urdu uses an explicit end check).
const YES_UR = /^(ji|jee|haan|han|hanji|haan ji|ji haan|bilkul|theek hai|thik hai|sahi hai)\b/i;
const NO_UR = /^(nahi|nahin|nai|na|ji nahi|bilkul nahi)\b/i;
const YES_UR_SCRIPT = /^(جی|ہاں|بالکل|درست|ٹھیک)(\s|$|[،۔!])/;
const NO_UR_SCRIPT = /^(نہیں|جی نہیں|بالکل نہیں)(\s|$|[،۔!])/;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_IN_TEXT = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i;

/** The address inside a spoken answer: "It's ali@example.com." or "ali at example dot com". */
function extractEmail(text) {
  const found = String(text).match(EMAIL_IN_TEXT);
  if (found) return found[0].toLowerCase();
  const spoken = String(text).toLowerCase()
    .replace(/\s+at\s+/g, '@').replace(/\s+dot\s+/g, '.')
    .replace(/\s*@\s*/g, '@').replace(/\s*\.\s*(?=[a-z0-9])/g, '.')
    .match(EMAIL_IN_TEXT);
  return spoken ? spoken[0] : null;
}
const URL_RE = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/\S*)?$/i;

const isUnknown = (text) => UNKNOWN_PATTERNS.some((re) => re.test(String(text ?? '').trim()));

/** Pull the first number out of a spoken answer ("about twenty-five" is left to the model). */
function parseNumber(text) {
  const cleaned = String(text ?? '').replace(/[, ](?=\d{3}\b)/g, '').replace(/[^0-9.-]/g, ' ').trim();
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function matchChoice(text, options) {
  const value = String(text ?? '').trim().toLowerCase();
  if (!value) return null;
  // Exact value/label match first, then contained-word match.
  for (const opt of options) {
    const v = String(opt.value ?? opt).toLowerCase();
    const l = String(opt.label ?? opt).toLowerCase();
    if (value === v || value === l) return String(opt.value ?? opt);
  }
  for (const opt of options) {
    const v = String(opt.value ?? opt).toLowerCase();
    const l = String(opt.label ?? opt).toLowerCase();
    if (v && value.includes(v)) return String(opt.value ?? opt);
    if (l && value.includes(l)) return String(opt.value ?? opt);
  }
  return null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_WORD = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const pad = (n) => String(n).padStart(2, '0');

/** YYYY-MM-DD for a real calendar day, else null (no time zone involved). */
function ymd(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/**
 * Dates as people say them: "2026-12-01", "1 December", "December 1st 2026", "1/12/2026"
 * (day first). Without a year, the next time that day comes round. Never guesses from
 * free text (Date.parse would turn "1 December" into 2001 and shift days across zones).
 */
export function parseSpokenDate(text, now = new Date()) {
  const t = String(text || '').toLowerCase().replace(/(\d+)(st|nd|rd|th)\b/g, '$1');
  let m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{2}|\d{4})\b/);
  if (m) return ymd(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[2]), Number(m[1]));
  let day; let month;
  m = t.match(new RegExp(`\\b(\\d{1,2})\\s+(?:of\\s+)?${MONTH_WORD}\\b`));
  if (m) { day = Number(m[1]); month = MONTHS.indexOf(m[2].slice(0, 3)) + 1; } else {
    m = t.match(new RegExp(`\\b${MONTH_WORD}\\s+(?:the\\s+)?(\\d{1,2})\\b`));
    if (m) { month = MONTHS.indexOf(m[1].slice(0, 3)) + 1; day = Number(m[2]); }
  }
  if (!month || !day) return null;
  const year = t.match(/\b(20\d{2})\b/);
  if (year) return ymd(Number(year[1]), month, day);
  const today = ymd(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  const thisYear = ymd(now.getUTCFullYear(), month, day);
  if (thisYear && thisYear >= today) return thisYear;
  return ymd(now.getUTCFullYear() + 1, month, day);
}

const AFFIRM = /\b(yes|yeah|yep|yup|correct|right|exactly|absolutely|sure|ok|okay|confirm(?:ed)?|perfect|ji|jee|haan|han|bilkul|theek|thik|sahi)\b|that'?s it/i;
const AFFIRM_UR = /(جی|ہاں|بالکل|درست|ٹھیک|صحیح)/;
const DENY = /\b(no|not|nope|nah|wrong|incorrect|isn'?t|nahi|nahin|galat)\b/i;
const DENY_UR = /(نہیں|غلط)/;

/**
 * Did the person confirm a read-back? "Yes, this is my email", "that's correct",
 * "ji haan" — yes. Anything with a no / wrong / correction, or no yes at all
 * ("thank you, goodbye") — no.
 */
export function isConfirmation(text) {
  const t = String(text || '');
  if (DENY.test(t) || DENY_UR.test(t)) return false;
  return AFFIRM.test(t) || AFFIRM_UR.test(t);
}

const ok = (value) => ({ validation: 'valid', normalizedValue: value });
const bad = (reason) => ({ validation: 'invalid', normalizedValue: null, reason });
const dunno = () => ({ validation: 'unknown', normalizedValue: null });

/**
 * @param {object} question - the configured question (type, options, min, max, …)
 * @param {string} rawAnswer - the transcribed spoken answer
 * @param {Date} [now] - reference for dates said without a year
 * @returns {{validation:'valid'|'invalid'|'unknown', normalizedValue:*, reason?:string}}
 */
export function validateAnswer(question, rawAnswer, now = new Date()) {
  const type = question?.type || 'short_text';
  const text = String(rawAnswer ?? '').trim();

  // "I don't know" is a first-class, non-invented outcome for every type except
  // where an empty string is itself meaningful (long_text optional).
  if (isUnknown(text) && type !== 'long_text') return dunno();

  switch (type) {
    case 'boolean': {
      // No-forms first: "ji nahi" starts with the yes-word "ji".
      if (NO_UR.test(text) || NO_UR_SCRIPT.test(text)) return ok(false);
      if (YES_WORDS.test(text) || YES_UR.test(text) || YES_UR_SCRIPT.test(text)) return ok(true);
      if (NO_WORDS.test(text)) return ok(false);
      return bad('not_yes_no');
    }
    case 'integer': {
      const n = parseNumber(text);
      if (n === null || !Number.isFinite(n)) return bad('not_a_number');
      const i = Math.round(n);
      if (question.min != null && i < question.min) return bad('below_min');
      if (question.max != null && i > question.max) return bad('above_max');
      return ok(i);
    }
    case 'decimal':
    case 'currency':
    case 'rating': {
      const n = parseNumber(text);
      if (n === null || !Number.isFinite(n)) return bad('not_a_number');
      if (question.min != null && n < question.min) return bad('below_min');
      if (question.max != null && n > question.max) return bad('above_max');
      if (type === 'rating') {
        const max = question.max ?? 5;
        if (n < 0 || n > max) return bad('out_of_range');
      }
      return ok(n);
    }
    case 'single_choice':
    case 'enum': {
      const options = question.options || [];
      const matched = matchChoice(text, options);
      return matched != null ? ok(matched) : bad('no_matching_option');
    }
    case 'multiple_choice': {
      const options = question.options || [];
      const parts = text.split(/\s*(?:,|;|\band\b|\bor\b)\s*/i).filter(Boolean);
      const matched = [...new Set(parts.map((p) => matchChoice(p, options)).filter(Boolean))];
      return matched.length ? ok(matched) : bad('no_matching_option');
    }
    case 'email': {
      const value = extractEmail(text);
      return value && EMAIL_RE.test(value) ? ok(value) : bad('invalid_email');
    }
    case 'url': {
      const value = text.replace(/\s+/g, '');
      return URL_RE.test(value) ? ok(value.startsWith('http') ? value : `https://${value}`) : bad('invalid_url');
    }
    case 'phone': {
      const digits = text.replace(/[^\d+]/g, '');
      const count = digits.replace(/\D/g, '').length;
      return count >= 7 && count <= 15 ? ok(digits) : bad('invalid_phone');
    }
    case 'date': {
      const date = parseSpokenDate(text, now);
      return date ? ok(date) : bad('unparseable_date');
    }
    case 'time': {
      const m = text.match(/\b([01]?\d|2[0-3])[:.h ]([0-5]\d)\b/) || text.match(/\b(1[0-2]|0?\d)\s*(am|pm)\b/i);
      if (!m) return bad('unparseable_time');
      return ok(text);
    }
    case 'address':
    case 'long_text':
      return text ? ok(text) : (question.required ? bad('empty') : dunno());
    case 'short_text':
    default: {
      if (!text) return question.required ? bad('empty') : dunno();
      const max = question.maxLength || 500;
      return ok(text.slice(0, max));
    }
  }
}

export const __test__ = { parseNumber, matchChoice, isUnknown };
