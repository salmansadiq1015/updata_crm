/**
 * Payment coordinates, checked rather than trusted.
 *
 * Every format here carries a checksum precisely so a typo can be caught
 * before the money leaves for an account that does not exist or belongs to
 * somebody else. These are those checksums.
 *
 * Shared rather than owned by one agent: Finanz AI reads them before a
 * payment, and the accounting validators use them at the moment a bank
 * account or a supplier invoice is written — which is the point where a
 * mistyped digit should be refused.
 *
 * Nothing here talks to a bank. A valid IBAN is a well-formed one, not a
 * proven one — the difference is stated wherever it is reported.
 */

/** ISO 13616: move the first four characters to the end, letters to digits, mod 97. */
export function isValidIban(value) {
  const iban = String(value || '').replace(/[\s-]/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;

  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));

  // 97 is prime and the number runs to ~38 digits: fold it in chunks rather
  // than through BigInt, which is what every ISO 13616 implementation does.
  let remainder = 0;
  for (const digit of digits) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/** Swiss and Liechtenstein IBANs are 21 characters. */
export function isSwissIban(value) {
  const iban = String(value || '').replace(/[\s-]/g, '').toUpperCase();
  return /^(CH|LI)\d{2}[A-Z0-9]{17}$/.test(iban) && isValidIban(iban);
}

/**
 * A QR-IBAN carries its reference type in the institution identifier:
 * 30000–31999 means the payment must quote a QR reference, and a plain
 * IBAN must not. Mixing the two is the classic rejected payment.
 */
export function isQrIban(value) {
  const iban = String(value || '').replace(/[\s-]/g, '').toUpperCase();
  if (!isSwissIban(iban)) return false;
  const institution = Number(iban.slice(4, 9));
  return institution >= 30000 && institution <= 31999;
}

/** The recursive modulo-10 table used by the Swiss ESR/QR reference. */
const MOD10_TABLE = [
  [0, 9, 4, 6, 8, 2, 7, 1, 3, 5],
  [9, 4, 6, 8, 2, 7, 1, 3, 5, 0],
  [4, 6, 8, 2, 7, 1, 3, 5, 0, 9],
  [6, 8, 2, 7, 1, 3, 5, 0, 9, 4],
  [8, 2, 7, 1, 3, 5, 0, 9, 4, 6],
  [2, 7, 1, 3, 5, 0, 9, 4, 6, 8],
  [7, 1, 3, 5, 0, 9, 4, 6, 8, 2],
  [1, 3, 5, 0, 9, 4, 6, 8, 2, 7],
  [3, 5, 0, 9, 4, 6, 8, 2, 7, 1],
  [5, 0, 9, 4, 6, 8, 2, 7, 1, 3],
];

export function mod10CheckDigit(digits) {
  let carry = 0;
  for (const digit of String(digits)) carry = MOD10_TABLE[carry][Number(digit)];
  return (10 - carry) % 10;
}

/** A QR reference is 27 digits, the last one a recursive modulo-10 check. */
export function isValidQrReference(value) {
  const reference = String(value || '').replace(/\s/g, '');
  if (!/^\d{27}$/.test(reference)) return false;
  return mod10CheckDigit(reference.slice(0, 26)) === Number(reference[26]);
}

/**
 * ISO 11649 creditor reference: RF, two check digits, then up to 21
 * characters — validated the same way as an IBAN.
 */
export function isValidCreditorReference(value) {
  const reference = String(value || '').replace(/\s/g, '').toUpperCase();
  if (!/^RF\d{2}[A-Z0-9]{1,21}$/.test(reference)) return false;
  const rearranged = reference.slice(4) + reference.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1;
}

/** Which kind of reference this is, and whether it holds up. */
export function checkReference(value) {
  const raw = String(value || '').replace(/\s/g, '');
  if (!raw) return { kind: null, valid: false };
  if (/^\d+$/.test(raw)) return { kind: 'QR', valid: isValidQrReference(raw), expectedLength: 27, length: raw.length };
  if (/^RF/i.test(raw)) return { kind: 'RF', valid: isValidCreditorReference(raw) };
  return { kind: 'FREE', valid: true };
}

/** Formats an IBAN the way a Swiss payment slip prints it. */
export function formatIban(value) {
  return String(value || '').replace(/[\s-]/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();
}
