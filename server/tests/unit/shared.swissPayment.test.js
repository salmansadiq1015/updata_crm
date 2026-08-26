import { describe, expect, test } from '@jest/globals';
import {
  checkReference,
  formatIban,
  isQrIban,
  isSwissIban,
  isValidCreditorReference,
  isValidIban,
  isValidQrReference,
  mod10CheckDigit,
} from '../../src/shared/validation/swissPayment.js';

describe('Swiss payment coordinates', () => {
  // The published ISO 13616 examples, plus the Swiss QR-bill specimens.
  const VALID = ['CH9300762011623852957', 'CH5604835012345678009', 'GB82WEST12345698765432', 'DE89370400440532013000', 'LI21088100002324013AA'];

  test('accepts IBANs that check out', () => {
    for (const iban of VALID) expect(isValidIban(iban)).toBe(true);
  });

  test('rejects an IBAN with a single mistyped digit', () => {
    // This is the whole point: the shape is identical, the checksum is not,
    // and the existing validator accepts it on shape alone.
    expect(isValidIban('CH9300762011623852958')).toBe(false);
    expect(isValidIban('CH9300762011623852957'.replace('9300', '9301'))).toBe(false);
    expect(isValidIban('DE89370400440532013001')).toBe(false);
  });

  test('rejects what is not an IBAN at all', () => {
    for (const value of ['', null, undefined, 'CH93', 'not an iban', '9300762011623852957']) {
      expect(isValidIban(value)).toBe(false);
    }
  });

  test('reads through spaces and the printed grouping', () => {
    expect(isValidIban('CH93 0076 2011 6238 5295 7')).toBe(true);
    expect(formatIban('CH9300762011623852957')).toBe('CH93 0076 2011 6238 5295 7');
  });

  test('tells a Swiss IBAN from a foreign one', () => {
    expect(isSwissIban('CH9300762011623852957')).toBe(true);
    expect(isSwissIban('LI21088100002324013AA')).toBe(true);
    expect(isSwissIban('DE89370400440532013000')).toBe(false);
  });

  test('tells a QR-IBAN from a plain one', () => {
    // 30000–31999 in the institution identifier means a QR reference is
    // mandatory; quoting the wrong kind is the classic rejected payment.
    expect(isQrIban('CH4431999123000889012')).toBe(true);
    expect(isQrIban('CH9300762011623852957')).toBe(false);
  });

  test('validates the recursive modulo-10 of a QR reference', () => {
    expect(mod10CheckDigit('21000000000313947143000090')).toBe(1);
    expect(isValidQrReference('210000000003139471430009017')).toBe(true);
    expect(isValidQrReference('21 00000 00003 13947 14300 09017')).toBe(true);
  });

  test('rejects a QR reference of the wrong length or check digit', () => {
    expect(isValidQrReference('210000000003139471430009018')).toBe(false);
    expect(isValidQrReference('21000000000313947143000901')).toBe(false);
    expect(isValidQrReference('')).toBe(false);
  });

  test('validates an ISO 11649 creditor reference', () => {
    expect(isValidCreditorReference('RF18539007547034')).toBe(true);
    expect(isValidCreditorReference('RF19539007547034')).toBe(false);
  });

  test('says which kind of reference it is looking at', () => {
    expect(checkReference('210000000003139471430009017')).toMatchObject({ kind: 'QR', valid: true });
    expect(checkReference('RF18539007547034')).toMatchObject({ kind: 'RF', valid: true });
    expect(checkReference('Rechnung 4711')).toMatchObject({ kind: 'FREE', valid: true });
    expect(checkReference('')).toMatchObject({ kind: null, valid: false });
  });
});
