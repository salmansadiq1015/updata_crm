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
];

const YES_WORDS = /^(yes|yeah|yep|yup|sure|correct|right|absolutely|of course|ok|okay|ja|oui|si)\b/i;
const NO_WORDS = /^(no|nope|nah|not really|negative|incorrect|nein|non)\b/i;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

const ok = (value) => ({ validation: 'valid', normalizedValue: value });
const bad = (reason) => ({ validation: 'invalid', normalizedValue: null, reason });
const dunno = () => ({ validation: 'unknown', normalizedValue: null });

/**
 * @param {object} question - the configured question (type, options, min, max, …)
 * @param {string} rawAnswer - the transcribed spoken answer
 * @returns {{validation:'valid'|'invalid'|'unknown', normalizedValue:*, reason?:string}}
 */
export function validateAnswer(question, rawAnswer) {
  const type = question?.type || 'short_text';
  const text = String(rawAnswer ?? '').trim();

  // "I don't know" is a first-class, non-invented outcome for every type except
  // where an empty string is itself meaningful (long_text optional).
  if (isUnknown(text) && type !== 'long_text') return dunno();

  switch (type) {
    case 'boolean': {
      if (YES_WORDS.test(text)) return ok(true);
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
      const value = text.replace(/\s+/g, '').toLowerCase();
      return EMAIL_RE.test(value) ? ok(value) : bad('invalid_email');
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
      const parsed = Date.parse(text);
      if (!Number.isNaN(parsed)) return ok(new Date(parsed).toISOString().slice(0, 10));
      return bad('unparseable_date');
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
