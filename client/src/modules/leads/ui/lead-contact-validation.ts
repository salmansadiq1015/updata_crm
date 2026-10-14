import { isValidPhone } from '@/lib/formatters/phone';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Optional contact fields are valid when empty; callers decide requiredness. */
export function isValidLeadEmail(value: string | null | undefined): boolean {
  const email = String(value ?? '').trim();
  return email.length === 0 || (email.length <= 255 && EMAIL_PATTERN.test(email));
}

/**
 * Accept Swiss national numbers and explicit international numbers. Ambiguous
 * foreign local numbers are rejected so outreach never guesses a country code.
 */
export function isValidLeadPhone(value: string | null | undefined): boolean {
  const phone = String(value ?? '').trim();
  return phone.length === 0 || (phone.length <= 50 && isValidPhone(phone));
}

export function normalizeLeadEmail(value: string): string | null {
  const email = value.trim();
  if (!email) return null;
  const separator = email.lastIndexOf('@');
  if (separator < 0) return email;
  return `${email.slice(0, separator)}@${email.slice(separator + 1).toLowerCase()}`;
}

export function normalizeLeadPhone(value: string): string | null {
  const phone = value.trim().replace(/^00(?=[1-9])/, '+');
  return phone || null;
}
