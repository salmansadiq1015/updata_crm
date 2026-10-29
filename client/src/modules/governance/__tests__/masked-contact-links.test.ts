import { describe, expect, it } from 'vitest';
import { toMailtoHref, toTelHref, toWhatsAppHref } from '@/modules/leads/ui/lead-ui-utils';

// A masked value must never turn into a dial / mail / WhatsApp target (it would
// dial a wrong, truncated number); real values keep working.
describe('contact links with PII masking', () => {
  it('refuses masked values', () => {
    expect(toTelHref('+41 *** ***4321')).toBeNull();
    expect(toWhatsAppHref('+41 *** ***4321')).toBeNull();
    expect(toMailtoHref('j***@example.ch')).toBeNull();
  });
  it('keeps real values working', () => {
    expect(toTelHref('+41 79 765 43 21')).toBe('tel:+41797654321');
    expect(toMailtoHref('jane@example.ch')).toBe('mailto:jane@example.ch');
    expect(toWhatsAppHref('+41 79 765 43 21')).toContain('phone=41797654321');
  });
});
