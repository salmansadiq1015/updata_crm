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
  /^(?:(?:i(?:'d| would)?\s+)?(?:prefer|rather)\s+not\s+(?:to\s+)?(?:say|share|answer)|skip(?:\s+(?:this|it|question))?|i\s+(?:do not|don't)\s+(?:want|wish)\s+to\s+(?:share|answer))\s*[.!]?$/i,
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

// Urdu/Persian (۰-۹) and Arabic-Indic (٠-٩) digits → ASCII; ٫ / ٬ are the Arabic separators.
function toAsciiDigits(text) {
  return String(text ?? '')
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06F0))
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/٫/g, '.').replace(/٬/g, ',');
}

// Scale words after a number: "30 hazar", "2.5 lakh", "50k", "1 crore".
const SCALE_WORDS = {
  thousand: 1e3, thousands: 1e3, k: 1e3, hazar: 1e3, hazaar: 1e3, hajar: 1e3, 'ہزار': 1e3,
  lakh: 1e5, lakhs: 1e5, laakh: 1e5, lac: 1e5, lacs: 1e5, 'لاکھ': 1e5,
  million: 1e6, millions: 1e6,
  crore: 1e7, crores: 1e7, karor: 1e7, karod: 1e7, 'کروڑ': 1e7,
  billion: 1e9, arab: 1e9, 'ارب': 1e9,
};
const SCALE_ALT = Object.keys(SCALE_WORDS).sort((a, b) => b.length - a.length).join('|');
// The scale must end the word (no letter after it), so "30 km" stays 30.
const NUMBER_WITH_SCALE = new RegExp(`(-?\\d+(?:\\.\\d+)?)(?:\\s*(${SCALE_ALT}))?(?![a-z\\u0600-\\u06FF])`, 'giu');
const JOINERS = /^(\s|and|aur|or|اور|،|,)*$/iu;

// Spoken numbers. English and Urdu-script words always count; Roman Urdu words
// collide with English ("do", "char", "saath" = with), so they only count in a
// run that also has a hundred/scale word ("do lakh", "pachas hazar").
const EN_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const UR_WORDS = {
  'ایک': 1, 'دو': 2, 'تین': 3, 'چار': 4, 'پانچ': 5, 'چھ': 6, 'چھے': 6, 'سات': 7, 'آٹھ': 8, 'نو': 9, 'دس': 10,
  'گیارہ': 11, 'بارہ': 12, 'پندرہ': 15, 'بیس': 20, 'پچیس': 25, 'تیس': 30, 'چالیس': 40, 'پچاس': 50,
  'ساٹھ': 60, 'ستر': 70, 'اسی': 80, 'اسّی': 80, 'نوے': 90, 'ڈیڑھ': 1.5, 'ڈھائی': 2.5,
};
const ROMAN_UR_WORDS = {
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, panch: 5, paanch: 5, chay: 6, chhe: 6, saat: 7, aath: 8, nau: 9, das: 10,
  gyarah: 11, barah: 12, pandrah: 15, bees: 20, pachees: 25, tees: 30, chalees: 40, chalis: 40, pachas: 50, pachaas: 50,
  saath: 60, sattar: 70, assi: 80, nabbay: 90, nawway: 90, dedh: 1.5, dhai: 2.5, dhaai: 2.5,
};
const HUNDRED_WORDS = new Set(['hundred', 'sau', 'سو']);

function parseNumberWords(text) {
  const tokens = String(text).toLowerCase().split(/[\s\-،۔,.!?]+/u).filter(Boolean);
  let run = [];
  for (const token of [...tokens, '']) {
    const isNumberWord = token in EN_WORDS || token in UR_WORDS || token in ROMAN_UR_WORDS || HUNDRED_WORDS.has(token) || token in SCALE_WORDS;
    if (isNumberWord && token !== 'k') { run.push(token); continue; }
    if (run.length && JOINERS.test(token) && token) continue;
    if (run.length) break;
  }
  if (!run.length) return null;
  const hasScale = run.some((t) => HUNDRED_WORDS.has(t) || t in SCALE_WORDS);
  if (run.some((t) => t in ROMAN_UR_WORDS && !(t in EN_WORDS)) && !hasScale) return null;
  let total = 0;
  let current = 0;
  for (const t of run) {
    if (HUNDRED_WORDS.has(t)) current = (current || 1) * 100;
    else if (t in SCALE_WORDS) { total += (current || 1) * SCALE_WORDS[t]; current = 0; } else current += EN_WORDS[t] ?? UR_WORDS[t] ?? ROMAN_UR_WORDS[t];
  }
  return total + current;
}

/**
 * Pull the first number out of a spoken answer: digits in any script, with an
 * optional scale word ("30 hazar" → 30000, "1 lakh 50 hazar" → 150000), else a
 * spelled-out number ("forty thousand", "پچاس ہزار", "do lakh").
 */
function parseNumber(text) {
  const source = toAsciiDigits(text).replace(/(\d)[, ](?=\d{3}\b)/g, '$1');
  const matches = [...source.matchAll(NUMBER_WITH_SCALE)];
  if (!matches.length) return parseNumberWords(source);
  let value = Number(matches[0][1]) * (SCALE_WORDS[matches[0][2]?.toLowerCase()] ?? 1);
  let lastScale = SCALE_WORDS[matches[0][2]?.toLowerCase()] ?? null;
  // "1 lakh 50 hazar": add the following parts while each is a smaller unit.
  for (let i = 1; lastScale && i < matches.length; i += 1) {
    const prev = matches[i - 1];
    const gap = source.slice(prev.index + prev[0].length, matches[i].index);
    const scale = SCALE_WORDS[matches[i][2]?.toLowerCase()] ?? 1;
    const part = Number(matches[i][1]) * scale;
    if (!JOINERS.test(gap) || scale >= lastScale || part >= lastScale) break;
    value += part;
    lastScale = scale === 1 ? null : scale;
  }
  return value;
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
  const matches = [];
  for (const opt of options) {
    const v = String(opt.value ?? opt).toLowerCase();
    const l = String(opt.label ?? opt).toLowerCase();
    const contains = (part) => {
      const start = value.indexOf(part);
      if (!part || start < 0) return false;
      return !/[\p{L}\p{N}_]/u.test(value[start - 1] || '')
        && !/[\p{L}\p{N}_]/u.test(value[start + part.length] || '');
    };
    if (contains(v) || contains(l)) matches.push(String(opt.value ?? opt));
  }
  // A single-choice answer containing two options needs clarification.
  return new Set(matches).size === 1 ? matches[0] : null;
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
  const t = toAsciiDigits(text).toLowerCase().replace(/(\d+)(st|nd|rd|th)\b/g, '$1');
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
  const year = t.match(/\b(\d{4})\b/);
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

/** Older/manual questionnaires often leave contact questions as short_text. */
export function answerRequirements(question = {}) {
  const key = String(question.fieldKey || question.mapTo || '')
    .replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().replace(/[.\s-]+/g, '_');
  const prompt = `${question.label || ''} ${question.text || ''}`;
  const birthDate = /^(dob|birth_?date|date_of_birth)$/.test(key)
    || /\b(date of birth|birth\s*date|geburtsdatum|date de naissance)\b|تاریخ پیدائش/i.test(prompt);
  let type = question.type || 'short_text';
  if (['short_text', 'long_text'].includes(type)) {
    if (birthDate) type = 'date';
    else if (/^(email|email_address|contact_email)$/.test(key) || /\byour email(?: address)?\b/i.test(prompt)) type = 'email';
    else if (/^(phone|phone_number|mobile|mobile_number|contact_phone)$/.test(key) || /\b(?:your|best|contact) (?:phone|mobile|telephone) number\b/i.test(prompt)) type = 'phone';
    else if (/^(family_size|family_members|household_size)$/.test(key) || /\bhow many (?:people|members)\b.*\b(?:family|household)\b/i.test(prompt)) type = 'integer';
  }
  const hints = {
    email: 'Please give a complete email address, including the part after @.',
    phone: 'Please give the complete phone number, including the area or country code.',
    date: birthDate ? 'Please give your birth day, month, and full four-digit year. Do not guess a missing year.' : 'Please give a real calendar date with the day and month.',
    integer: 'Please give a whole number related to this question.',
    boolean: 'Please answer yes or no to this question.',
    address: 'Please give the requested location or residential address.',
  };
  return { type, birthDate, hint: hints[type] || 'Please provide information that directly answers this question.' };
}

// These are conversational turns, not values for profile/contact questions.
// Other free-text relevance is assessed by the voice model using the question and
// its configured description; do not restrict names or professions to a word list.
function isNonAnswer(text, question) {
  const clean = text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim().replace(/\s+/g, ' ');
  const echo = String(question.text || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim().replace(/\s+/g, ' ');
  return (echo && clean === echo)
    || /^(yes|no|okay|ok|sure|continue|mhm|hmm|uh|um|hello|hi|good (morning|evening|afternoon)|thank you(?: for the)?|thanks|thats the problem|its possible|mhm its possible|i could not really|why are you|my email address|phone number)$/i.test(clean)
    || /^(?:why (?:are|do|would)|what do you mean|could you (?:please )?(?:repeat|explain)|can you (?:please )?(?:repeat|explain))\b/i.test(text);
}

/**
 * @param {object} question - the configured question (type, options, min, max, …)
 * @param {string} rawAnswer - the transcribed spoken answer
 * @param {Date} [now] - reference for dates said without a year
 * @returns {{validation:'valid'|'invalid'|'unknown', normalizedValue:*, reason?:string}}
 */
export function validateAnswer(question, rawAnswer, now = new Date()) {
  const { type, birthDate } = answerRequirements(question);
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
      if (!Number.isInteger(n)) return bad('not_a_whole_number');
      const i = n;
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
      const digits = toAsciiDigits(text).replace(/[^\d+]/g, '');
      const count = digits.replace(/\D/g, '').length;
      return /^\+?\d+$/.test(digits) && count >= 7 && count <= 15 ? ok(digits) : bad('invalid_phone');
    }
    case 'date': {
      // Appointment dates may default a year; birth dates must never do so.
      if (birthDate && !/\b\d{4}\b/.test(toAsciiDigits(text))) return bad('birth_year_required');
      const date = parseSpokenDate(text, now);
      if (birthDate && date && date > now.toISOString().slice(0, 10)) return bad('birth_date_in_future');
      return date ? ok(date) : bad('unparseable_date');
    }
    case 'time': {
      const m = text.match(/\b([01]?\d|2[0-3])[:.h ]([0-5]\d)\b/) || text.match(/\b(1[0-2]|0?\d)\s*(am|pm)\b/i);
      if (!m) return bad('unparseable_time');
      return ok(text);
    }
    case 'address':
    case 'long_text':
      if (text && isNonAnswer(text, question)) return bad('unrelated_answer');
      return text ? ok(text) : (question.required ? bad('empty') : dunno());
    case 'short_text':
    default: {
      if (!text) return question.required ? bad('empty') : dunno();
      if (isNonAnswer(text, question)) return bad('unrelated_answer');
      const max = question.maxLength || 500;
      return ok(text.slice(0, max));
    }
  }
}

export const __test__ = { parseNumber, matchChoice, isUnknown };
