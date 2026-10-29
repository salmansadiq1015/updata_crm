/**
 * Sensitive-field masking — the single policy + helpers for lead PII in API
 * responses and exports (docs/PLATFORM-GOVERNANCE.md, "PII masking").
 *
 * Policy (key-based, applied recursively to response payloads):
 *  - PHONE keys   → `+41 *** ***4567` (country code + last 4 digits). Only string
 *                   values that actually look like a phone number are touched, so a
 *                   generic key such as `to`/`from`/`address` never mangles a date
 *                   or a postal address object.
 *  - EMAIL keys   → `j***@domain.com`.
 *  - FREE_TEXT    → SMS bodies, transcript turns and notes keep their wording, but
 *                   phone numbers / e-mail addresses embedded in them are masked.
 *  - SECRET_REFS  → call recording references are removed (null).
 *  - STAFF subtrees (createdBy, assignedTo, …) are internal users, not lead PII,
 *                   and are never descended into.
 *
 * Who sees what: masking is only active when PII_MASKING_ENABLED=true AND the
 * viewer lacks `lead:pii:view` (Admin always holds it). Action endpoints that
 * must hand the device a real number (`dialNumber`, `waNumber`, SIM-SMS device
 * leases) are deliberately outside this policy — the server resolves the number
 * for that one action and audits it.
 */
export const PII_UNMASK_PERMISSION = 'lead:pii:view';
export const MASK = '***';

export const SENSITIVE_FIELD_POLICY = Object.freeze({
  phone: Object.freeze([
    'phone', 'mobile', 'normalizedPhone', 'phoneNumber', 'phoneE164', 'e164', 'leadPhone', 'contactPhone',
    'recipientPhone', 'to', 'from', 'toNumber', 'fromNumber', 'destination', 'destinationNumber',
    'callerNumber', 'calleeNumber', 'msisdn', 'address', 'number', 'fax',
  ]),
  email: Object.freeze(['email', 'leadEmail', 'contactEmail', 'recipientEmail', 'toEmail']),
  freeText: Object.freeze(['body', 'text', 'transcript', 'content', 'preview', 'lastMessage', 'snippet', 'note', 'summary']),
  secretRefs: Object.freeze(['recordingRef', 'recordingUrl', 'audioUrl']),
  staffSubtrees: Object.freeze([
    'createdBy', 'assignedTo', 'updatedBy', 'deletedBy', 'reviewedBy', 'resolvedBy', 'requestedBy',
    'convertedBy', 'addedBy', 'owner', 'employeeId', 'actor', 'user', 'members', 'supervisors',
  ]),
});

const PHONE_KEYS = new Set(SENSITIVE_FIELD_POLICY.phone);
const EMAIL_KEYS = new Set(SENSITIVE_FIELD_POLICY.email);
const TEXT_KEYS = new Set(SENSITIVE_FIELD_POLICY.freeText);
const SECRET_KEYS = new Set(SENSITIVE_FIELD_POLICY.secretRefs);
const STAFF_KEYS = new Set(SENSITIVE_FIELD_POLICY.staffSubtrees);

// Calling codes shown in the masked form (longest match first). Unknown → `+**`.
const CALLING_CODES = [
  '880', '971', '966', '974', '965', '968', '973', '962', '961', '423', '420', '421', '351', '352', '353', '358', '359',
  '385', '386', '381', '370', '371', '372', '212', '213', '216', '234', '254', '255', '256', '233', '994', '998',
  '41', '49', '43', '33', '39', '44', '31', '32', '34', '30', '36', '40', '45', '46', '47', '48', '90', '92', '91',
  '93', '94', '95', '98', '20', '27', '52', '54', '55', '56', '57', '60', '61', '62', '63', '64', '65', '66', '81',
  '82', '84', '86', '1', '7',
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;
const PHONE_SHAPE = /^[+(]?[\d\s().\-/]+$/;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMBEDDED_PHONE = /(?:\+|\b00)?\(?\d[\d\s().\-/]{5,}\d/g;
const EMBEDDED_EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** True when a string has the shape of a phone number (7–15 digits, phone punctuation only). */
export function looksLikePhone(value) {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed || ISO_DATE.test(trimmed) || !PHONE_SHAPE.test(trimmed)) return false;
  const digits = trimmed.replace(/\D/g, '').length;
  return digits >= 7 && digits <= 15;
}

/** `+41 79 765 43 21` → `+41 *** ***4321`; `044 123 45 67` → `*** ***4567`. */
export function maskPhone(value) {
  if (typeof value !== 'string' || !value.trim()) return value;
  if (isMaskedValue(value)) return value;
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 4) return MASK;
  const last4 = digits.slice(-4);
  const international = trimmed.startsWith('+') || trimmed.startsWith('00');
  if (!international) return `${MASK} ${MASK}${last4}`;
  const intl = trimmed.startsWith('00') ? digits.slice(2) : digits;
  const cc = CALLING_CODES.find((code) => intl.startsWith(code) && intl.length - code.length >= 4);
  return `+${cc || '**'} ${MASK} ${MASK}${last4}`;
}

/** `john.doe@domain.com` → `j***@domain.com`. */
export function maskEmail(value) {
  if (typeof value !== 'string' || !value.includes('@')) return value;
  if (isMaskedValue(value)) return value;
  const [local, ...rest] = value.trim().split('@');
  const domain = rest.join('@');
  return `${local ? local[0] : ''}${MASK}@${domain}`;
}

/** Masks phone numbers and e-mail addresses embedded in free text; the wording is kept. */
export function redactText(value) {
  if (typeof value !== 'string' || !value) return value;
  return value
    .replace(EMBEDDED_EMAIL, (match) => maskEmail(match))
    .replace(EMBEDDED_PHONE, (match) => (looksLikePhone(match) ? maskPhone(match) : match));
}

/** True for a value produced by this module. */
export function isMaskedValue(value) {
  return typeof value === 'string' && value.includes(MASK);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalize(value) {
  // Mongoose documents / ObjectIds / Decimal128 serialize through toJSON — do the
  // same here so the masked payload is exactly what res.json would have sent.
  if (value && typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)
    && !isPlainObject(value) && typeof value.toJSON === 'function') {
    return value.toJSON();
  }
  return value;
}

/**
 * Returns a masked deep copy of `data` (never mutates). Objects in which a phone
 * or e-mail value was masked get `piiMasked: true` so clients can offer an
 * audited "reveal" instead of acting on the masked string.
 */
export function maskSensitive(data, { depth = 0, seen = new WeakSet() } = {}) {
  const value = normalize(data);
  if (depth > 25 || value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => maskSensitive(item, { depth: depth + 1, seen }));
  if (!isPlainObject(value)) return value;

  const out = {};
  let masked = false;
  for (const [key, raw] of Object.entries(value)) {
    const item = normalize(raw);
    if (STAFF_KEYS.has(key)) {
      out[key] = item;
    } else if (SECRET_KEYS.has(key)) {
      out[key] = item ? null : item;
      if (item) masked = true;
    } else if (PHONE_KEYS.has(key) && typeof item === 'string' && looksLikePhone(item)) {
      out[key] = maskPhone(item);
      masked = true;
    } else if (EMAIL_KEYS.has(key) && typeof item === 'string' && EMAIL_SHAPE.test(item.trim())) {
      out[key] = maskEmail(item);
      masked = true;
    } else if (TEXT_KEYS.has(key) && typeof item === 'string') {
      out[key] = redactText(item);
    } else if (item && typeof item === 'object') {
      out[key] = maskSensitive(item, { depth: depth + 1, seen });
    } else {
      out[key] = item;
    }
  }
  if (masked) out.piiMasked = true;
  return out;
}

/** Convenience alias for one lead (list row, detail, export row). */
export const maskLeadRecord = (lead) => maskSensitive(lead);

export default {
  PII_UNMASK_PERMISSION,
  SENSITIVE_FIELD_POLICY,
  looksLikePhone,
  maskPhone,
  maskEmail,
  redactText,
  isMaskedValue,
  maskSensitive,
  maskLeadRecord,
};
