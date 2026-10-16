// Lead phone numbers: the exact rule the CRM enforces (server
// lead.validation.js `phone`) plus a helper that SUGGESTS the international
// form of a local number. Nothing here changes what the user typed on its own:
// the form shows the suggestion and the user taps to apply it.

// Same separators and patterns as the server.
const SEP = "[\\s.\\-/'’]*";
const SWISS_PHONE = new RegExp(`^(?:(?:\\+41|0041)${SEP}(?:\\(0\\)${SEP})?|0)[1-9](?:${SEP}\\d){8}$`);
const INTERNATIONAL_PHONE = new RegExp(`^(?:\\+|00)(?!41)[1-9]\\d{0,2}(?:${SEP}\\d){6,13}$`);

export const PHONE_MAX_LENGTH = 50;

/** True when the CRM accepts the value as a lead phone/mobile (empty is "not set" and allowed). */
export function isValidLeadPhone(value: string | null | undefined): boolean {
  const phone = (value ?? '').trim();
  if (!phone) return true;
  return phone.length <= PHONE_MAX_LENGTH && (SWISS_PHONE.test(phone) || INTERNATIONAL_PHONE.test(phone));
}

/** Starts with + or 00: the caller already gave a country code. */
export function hasCountryCode(value: string): boolean {
  return /^\s*(?:\+|00)/.test(value);
}

export type DialCountry = {
  iso2: string;
  dialCode: string;
  /** National trunk prefix dropped in the international form (`0` in most of Europe). */
  trunkPrefix: '0' | null;
  /** Accepted national significant number lengths (without trunk prefix). */
  minDigits: number;
  maxDigits: number;
};

// Countries the team works with most, CH first. Lengths are national
// significant numbers (ITU-T E.164 national plans), deliberately a bit lenient.
export const DIAL_COUNTRIES: readonly DialCountry[] = [
  { iso2: 'CH', dialCode: '41', trunkPrefix: '0', minDigits: 9, maxDigits: 9 },
  { iso2: 'DE', dialCode: '49', trunkPrefix: '0', minDigits: 6, maxDigits: 13 },
  { iso2: 'AT', dialCode: '43', trunkPrefix: '0', minDigits: 6, maxDigits: 13 },
  { iso2: 'FR', dialCode: '33', trunkPrefix: '0', minDigits: 9, maxDigits: 9 },
  { iso2: 'IT', dialCode: '39', trunkPrefix: null, minDigits: 6, maxDigits: 11 },
  { iso2: 'LI', dialCode: '423', trunkPrefix: null, minDigits: 7, maxDigits: 9 },
  { iso2: 'GB', dialCode: '44', trunkPrefix: '0', minDigits: 9, maxDigits: 10 },
  { iso2: 'NL', dialCode: '31', trunkPrefix: '0', minDigits: 9, maxDigits: 9 },
  { iso2: 'BE', dialCode: '32', trunkPrefix: '0', minDigits: 8, maxDigits: 9 },
  { iso2: 'ES', dialCode: '34', trunkPrefix: null, minDigits: 9, maxDigits: 9 },
  { iso2: 'PT', dialCode: '351', trunkPrefix: null, minDigits: 9, maxDigits: 9 },
  { iso2: 'PK', dialCode: '92', trunkPrefix: '0', minDigits: 9, maxDigits: 10 },
  { iso2: 'IN', dialCode: '91', trunkPrefix: '0', minDigits: 10, maxDigits: 10 },
  { iso2: 'AE', dialCode: '971', trunkPrefix: '0', minDigits: 8, maxDigits: 9 },
  { iso2: 'SA', dialCode: '966', trunkPrefix: '0', minDigits: 8, maxDigits: 9 },
  { iso2: 'US', dialCode: '1', trunkPrefix: null, minDigits: 10, maxDigits: 10 },
];

export function findDialCountry(iso2: string | null | undefined): DialCountry | null {
  const code = (iso2 ?? '').trim().toUpperCase();
  return DIAL_COUNTRIES.find((country) => country.iso2 === code) ?? null;
}

/**
 * The international form of a number typed in a country's local format, or
 * null when there is nothing safe to suggest (already international, empty,
 * letters, wrong length for that country, unknown country).
 *
 *   suggestInternationalNumber('03054949624', 'PK')   → '+92 3054949624'
 *   suggestInternationalNumber('044 123 45 67', 'CH') → '+41 441234567'
 *   suggestInternationalNumber('0041 44 123 45 67')   → '+41 44 123 45 67'
 */
export function suggestInternationalNumber(input: string, iso2?: string | null): string | null {
  const value = input.trim();
  if (!value || value.startsWith('+')) return null;
  // 00-prefixed numbers already carry a country code: only the prefix changes.
  if (/^00[1-9]/.test(value)) {
    const converted = `+${value.slice(2)}`;
    return isValidLeadPhone(converted) ? converted : null;
  }
  const country = findDialCountry(iso2);
  if (!country) return null;
  const compact = value.replace(/[\s.\-/'’()]/g, '');
  if (!/^\d+$/.test(compact)) return null;
  let national = compact;
  if (country.trunkPrefix && national.startsWith(country.trunkPrefix)) {
    national = national.slice(country.trunkPrefix.length);
  }
  if (!national || national.startsWith('0')) return null;
  if (national.length < country.minDigits || national.length > country.maxDigits) return null;
  const suggestion = `+${country.dialCode} ${national}`;
  return isValidLeadPhone(suggestion) ? suggestion : null;
}
