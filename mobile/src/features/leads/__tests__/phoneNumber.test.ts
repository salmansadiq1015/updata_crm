import {
  DIAL_COUNTRIES,
  hasCountryCode,
  isValidLeadPhone,
  suggestInternationalNumber,
} from '../utils/phoneNumber';

describe('isValidLeadPhone (server lead.validation.js parity)', () => {
  it.each([
    ['', true],
    ['+41 44 123 45 67', true],
    ['044 123 45 67', true], // Swiss national format is accepted by the server
    ['0041 44 123 45 67', true],
    ['+41 (0)44 123 45 67', true],
    ['+92 3054949624', true],
    ['+49 30 1234567', true],
    ['0049 30 1234567', true],
    ['03054949624', false], // Pakistani local number: rejected by the server
    ['030 1234567', true], // 0 + 9 digits reads as Swiss national (server rule)
    ['030 123456', false], // German local: ambiguous without a country code
    ['+41 44 123 45', false], // Swiss numbers have 9 digits after the code
    ['+0 1234567', false],
    ['call reception', false],
    [`+49 ${'1'.repeat(60)}`, false],
  ])('%s → %s', (value, expected) => {
    expect(isValidLeadPhone(value)).toBe(expected);
  });
});

describe('suggestInternationalNumber', () => {
  it('converts a Pakistani 03xx mobile to +92 3xx', () => {
    expect(suggestInternationalNumber('03054949624', 'PK')).toBe('+92 3054949624');
    expect(suggestInternationalNumber('0305-4949624', 'pk')).toBe('+92 3054949624');
  });

  it('converts a Swiss 0xx number to +41 xx', () => {
    expect(suggestInternationalNumber('044 123 45 67', 'CH')).toBe('+41 441234567');
    expect(suggestInternationalNumber('079 765 43 21', 'CH')).toBe('+41 797654321');
  });

  it('turns a 00 prefix into + regardless of the chosen country', () => {
    expect(suggestInternationalNumber('0041 44 123 45 67', 'PK')).toBe('+41 44 123 45 67');
    expect(suggestInternationalNumber('0092 305 4949624')).toBe('+92 305 4949624');
  });

  it('keeps countries without a trunk prefix intact (Italy)', () => {
    expect(suggestInternationalNumber('06 1234 5678', 'IT')).toBeNull(); // national part may not start with 0 after stripping
    expect(suggestInternationalNumber('347 123 4567', 'IT')).toBe('+39 3471234567');
  });

  it('suggests nothing it cannot stand behind', () => {
    expect(suggestInternationalNumber('+41 44 123 45 67', 'CH')).toBeNull(); // already international
    expect(suggestInternationalNumber('', 'CH')).toBeNull();
    expect(suggestInternationalNumber('call me', 'CH')).toBeNull();
    expect(suggestInternationalNumber('0441234', 'CH')).toBeNull(); // too short for CH
    expect(suggestInternationalNumber('03054949624', 'XX')).toBeNull(); // unknown country
    expect(suggestInternationalNumber('03054949624', null)).toBeNull();
  });

  it('every suggestion it makes passes the server rule', () => {
    for (const country of DIAL_COUNTRIES) {
      const local = `${country.trunkPrefix ?? ''}${'3'.repeat(country.minDigits)}`;
      const suggestion = suggestInternationalNumber(local, country.iso2);
      expect(suggestion).not.toBeNull();
      expect(isValidLeadPhone(suggestion)).toBe(true);
    }
  });

  it('hasCountryCode', () => {
    expect(hasCountryCode('+41 44')).toBe(true);
    expect(hasCountryCode(' 0041 44')).toBe(true);
    expect(hasCountryCode('044 123')).toBe(false);
  });
});
