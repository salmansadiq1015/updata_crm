/**
 * Swiss phone formatter.
 *
 * Inputs we see in the wild:
 *   "0441234567"      → "044 123 45 67"          (CH national)
 *   "+41441234567"    → "+41 44 123 45 67"       (CH international)
 *   "+49301234567"    → "+49 30 123 4567"        (non-CH: stripped to spaced groups of 3-4)
 */
function onlyDigits(value) {
  if (!value) return '';
  return String(value).replace(/[^\d+]/g, '');
}

export function formatPhone(value, { fallback = '' } = {}) {
  const raw = onlyDigits(value);
  if (!raw) return fallback;

  if (raw.startsWith('+41')) {
    const rest = raw.slice(3);
    if (rest.length === 9) {
      return `+41 ${rest.slice(0, 2)} ${rest.slice(2, 5)} ${rest.slice(5, 7)} ${rest.slice(7)}`;
    }
  }

  if (raw.startsWith('0') && raw.length === 10) {
    return `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6, 8)} ${raw.slice(8)}`;
  }

  if (raw.startsWith('+')) {
    return raw.replace(/^(\+\d{2,3})(\d{1,4})(\d{1,4})(\d{0,6})$/, (_, a, b, c, d) => [a, b, c, d].filter(Boolean).join(' '));
  }

  return value;
}

// Separators people actually type between digits, including the Swiss apostrophe
// (079'123'45'67) and the slash common in Swiss-German writing (044/123 45 67).
const SEP = "[\\s.\\-/'’]*";

/**
 * Swiss number in either notation:
 *   national        079 123 45 67 · 044/123 45 67 · 079'123'45'67
 *   international   +41 79 123 45 67 · 0041 79 123 45 67 · +41 (0)79 123 45 67
 * After the prefix a Swiss number always has 9 digits and never starts with 0.
 */
export const SWISS_PHONE_REGEX = new RegExp(
  `^(?:(?:\\+41|0041)${SEP}(?:\\(0\\)${SEP})?|0)[1-9](?:${SEP}\\d){8}$`,
);

/** Foreign numbers, so an employee with a non-Swiss mobile is not blocked. */
export const INTERNATIONAL_PHONE_REGEX = new RegExp(
  `^(?:\\+|00)(?!41)[1-9]\\d{0,2}(?:${SEP}\\d){6,13}$`,
);

/** Empty is valid — callers decide whether the field is required. */
export function isValidPhone(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return true;
  return SWISS_PHONE_REGEX.test(trimmed) || INTERNATIONAL_PHONE_REGEX.test(trimmed);
}

/** Normalize to international format +41 … for dialing. */
export function formatPhoneInternational(value, { defaultCountry = '+41' } = {}) {
  const raw = onlyDigits(value);
  if (!raw) return '';
  if (raw.startsWith('+')) return raw;
  if (raw.startsWith('00')) return `+${raw.slice(2)}`;
  if (raw.startsWith('0')) return `${defaultCountry}${raw.slice(1)}`;
  return raw;
}
