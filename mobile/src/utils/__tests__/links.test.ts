import { extractResetToken } from '@/features/auth/utils/resetToken';

import { toMailtoUri, toMapsUrl, toTelUri, toWebUrl } from '../links';

describe('toTelUri', () => {
  it.each([
    ['+41 44 123 45 67', 'tel:+41441234567'],
    ['0041 44 123 45 67', 'tel:+41441234567'],
    ['044 / 123 45-67', 'tel:0441234567'],
    ['12', null],
    ['', null],
    [null, null],
  ])('%p → %p', (input, expected) => expect(toTelUri(input)).toBe(expected));
});

describe('toMailtoUri', () => {
  it('accepts plausible addresses only', () => {
    expect(toMailtoUri(' ana@example.com ')).toBe('mailto:ana@example.com');
    expect(toMailtoUri('not-an-email')).toBeNull();
  });
});

describe('toWebUrl', () => {
  it.each([
    ['example.com', 'https://example.com'],
    ['http://example.com/a?b=1', 'http://example.com/a?b=1'],
    ['javascript:alert(1)', null],
    ['ftp://example.com', null],
    ['not a url', null],
    ['', null],
  ])('%p → %p', (input, expected) => expect(toWebUrl(input)).toBe(expected));
});

describe('toMapsUrl', () => {
  it('prefers the stored provider link, otherwise searches the address', () => {
    expect(toMapsUrl('https://maps.google.com/?cid=1', 'x')).toBe('https://maps.google.com/?cid=1');
    expect(toMapsUrl(null, 'Bahnhofstrasse 1, Zürich')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Bahnhofstrasse%201%2C%20Z%C3%BCrich',
    );
    expect(toMapsUrl(null, null)).toBeNull();
  });
});

describe('extractResetToken', () => {
  const token = 'a1B2c3D4e5F6g7H8i9J0';
  it('reads the token from the emailed web link or accepts a bare token', () => {
    expect(extractResetToken(`https://crm.example.com/reset-password?token=${token}`)).toBe(token);
    expect(extractResetToken(`  ${token}  `)).toBe(token);
  });
  it('rejects anything else', () => {
    expect(extractResetToken('hello world')).toBeNull();
    expect(extractResetToken('https://crm.example.com/reset-password')).toBeNull();
    expect(extractResetToken('')).toBeNull();
  });
});
