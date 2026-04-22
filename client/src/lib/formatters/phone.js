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

/** Normalize to international format +41 … for dialing. */
export function formatPhoneInternational(value, { defaultCountry = '+41' } = {}) {
  const raw = onlyDigits(value);
  if (!raw) return '';
  if (raw.startsWith('+')) return raw;
  if (raw.startsWith('00')) return `+${raw.slice(2)}`;
  if (raw.startsWith('0')) return `${defaultCountry}${raw.slice(1)}`;
  return raw;
}
