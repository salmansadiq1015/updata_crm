import { describe, expect, test } from '@jest/globals';
import {
  checkReference,
  isQrIban,
  isValidCreditorReference,
  isValidIban,
  isValidQrReference,
  mod10CheckDigit,
} from '../../src/shared/validation/swissPayment.js';

/**
 * The rules that decide whether a Swiss payment arrives.
 *
 * A payment does not half-work: the bank either books it or sends it back,
 * and by then the invoice is late and somebody has to chase it. The two
 * mistakes that cause this are quoting the wrong kind of reference for the
 * account, and a reference whose check digit is one out.
 */

/** A QR-IBAN with the institution identifier set to a given value. */
function ibanWithInstitution(institution) {
  // Built rather than listed, so the boundaries can be walked one by one.
  const body = `${String(institution).padStart(5, '0')}123000889012`;
  for (let check = 2; check <= 98; check += 1) {
    const candidate = `CH${String(check).padStart(2, '0')}${body}`;
    if (isValidIban(candidate)) return candidate;
  }
  throw new Error(`no valid check digits for institution ${institution}`);
}

describe('which accounts demand a QR reference', () => {
  test('the institution identifier alone decides, at both ends of the range', () => {
    // 30000–31999 is the QR-IBAN range. One outside it and the payment must
    // NOT carry a QR reference; one inside and it must.
    expect(isQrIban(ibanWithInstitution(29999))).toBe(false);
    expect(isQrIban(ibanWithInstitution(30000))).toBe(true);
    expect(isQrIban(ibanWithInstitution(31999))).toBe(true);
    expect(isQrIban(ibanWithInstitution(32000))).toBe(false);
  });

  test('a foreign account is never a QR-IBAN, whatever its digits say', () => {
    // A German IBAN can carry 30000 in the same position by coincidence.
    expect(isQrIban('DE89370400440532013000')).toBe(false);
  });

  test('an IBAN that does not check out is not a QR-IBAN either', () => {
    const good = ibanWithInstitution(30000);
    const mistyped = `${good.slice(0, -1)}${(Number(good.slice(-1)) + 1) % 10}`;
    expect(isValidIban(mistyped)).toBe(false);
    expect(isQrIban(mistyped)).toBe(false);
  });

  test('the printed grouping on a payment slip is read, not rejected', () => {
    const iban = ibanWithInstitution(30000);
    const printed = iban.replace(/(.{4})/g, '$1 ').trim();
    expect(isQrIban(printed)).toBe(true);
    expect(isQrIban(iban.replace(/(.{4})/g, '$1-'))).toBe(true);
  });
});

describe('a reference the bank will accept', () => {
  test('every check digit from 0 to 9 is produced and recognised', () => {
    // A table-driven modulo-10 is exactly where an off-by-one hides: it shows
    // up on one digit in ten, which is one payment in ten.
    const seen = new Set();
    for (let n = 0; n < 200; n += 1) {
      // Built as text, not arithmetic: a 26-digit number is far past the
      // largest integer JavaScript counts exactly, and 10 ** 25 stringifies as
      // "1e+25" — which is not a reference at all.
      const base = `2100000000000000000${String(n * 7).padStart(7, '0')}`;
      expect(base).toMatch(/^\d{26}$/);
      const digit = mod10CheckDigit(base);
      seen.add(digit);
      expect(isValidQrReference(base + digit)).toBe(true);
      expect(isValidQrReference(base + ((digit + 1) % 10))).toBe(false);
    }
    expect(seen.size).toBe(10);
  });

  test('a reference of nearly the right length is refused', () => {
    const base = '0'.repeat(26);
    const valid = base + mod10CheckDigit(base);
    expect(isValidQrReference(valid)).toBe(true);
    expect(isValidQrReference(valid.slice(0, 26))).toBe(false);
    expect(isValidQrReference(`${valid}0`)).toBe(false);
  });

  test('the spacing the slip prints is read, but letters are not digits', () => {
    const base = '21000000000313947143000901';
    const valid = base + mod10CheckDigit(base);
    expect(isValidQrReference(valid.replace(/(.{5})/g, '$1 '))).toBe(true);
    expect(isValidQrReference(`${valid.slice(0, 26)}O`)).toBe(false);
  });

  test('a creditor reference is checked the way an IBAN is', () => {
    expect(isValidCreditorReference('RF18539007547034')).toBe(true);
    expect(isValidCreditorReference('rf18 5390 0754 7034')).toBe(true);
    expect(isValidCreditorReference('RF19539007547034')).toBe(false);
  });
});

describe('telling the office which kind it is looking at', () => {
  test('all digits is read as a QR reference, and judged as one', () => {
    const base = '21000000000313947143000901';
    const valid = base + mod10CheckDigit(base);
    expect(checkReference(valid)).toMatchObject({ kind: 'QR', valid: true });
    // The length is reported so a truncated one can be recognised as such.
    expect(checkReference('123')).toMatchObject({ kind: 'QR', valid: false, expectedLength: 27, length: 3 });
  });

  test('RF is read as a creditor reference', () => {
    expect(checkReference('RF18539007547034')).toMatchObject({ kind: 'RF', valid: true });
    expect(checkReference('RF19539007547034')).toMatchObject({ kind: 'RF', valid: false });
  });

  test('anything else is free text, which is valid on a plain IBAN', () => {
    expect(checkReference('Rechnung RE-2026-0042')).toMatchObject({ kind: 'FREE', valid: true });
  });

  test('nothing at all is not a reference', () => {
    for (const empty of ['', '   ', null, undefined]) {
      expect(checkReference(empty)).toMatchObject({ kind: null, valid: false });
    }
  });

  test('a QR-IBAN paired with free text is the classic returned payment', () => {
    // The pairing rule the whole exercise exists for: this account accepts a
    // QR reference and nothing else.
    const account = ibanWithInstitution(30000);
    const reference = checkReference('Rechnung RE-2026-0042');

    expect(isQrIban(account)).toBe(true);
    expect(reference.kind).not.toBe('QR');
  });
});
