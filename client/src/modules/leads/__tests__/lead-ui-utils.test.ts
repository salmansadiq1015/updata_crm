import { describe, expect, it } from 'vitest';
import {
  buildGoogleMapsUrl,
  formatAddressOneLine,
  getAddressLines,
  getLeadCreatorName,
  getUserDisplayName,
  resolveLeadVars,
  toMailtoHref,
  toSafeWebUrl,
  toTelHref,
  toWhatsAppHref,
} from '../ui/lead-ui-utils';
import type { Lead } from '../types/lead-types';

const emptyMeta: Lead['sourceMetadata'] = {
  googlePlaceId: null,
  discoverySessionId: null,
  discoveryResultId: null,
  businessType: null,
  keyword: null,
  discoveredAt: null,
};

describe('links are only built from data a lead really has', () => {
  it('builds tel: links from dialable numbers only', () => {
    expect(toTelHref('+41 44 123 45 67')).toBe('tel:+41441234567');
    expect(toTelHref('044/123 45 67')).toBe('tel:0441234567');
    expect(toTelHref('')).toBeNull();
    expect(toTelHref(null)).toBeNull();
    expect(toTelHref('n/a')).toBeNull();
  });

  it('builds mailto: links from plausible addresses only', () => {
    expect(toMailtoHref(' info@example.ch ')).toBe('mailto:info@example.ch');
    expect(toMailtoHref('info@')).toBeNull();
    expect(toMailtoHref(null)).toBeNull();
  });

  it('only ever links http(s) URLs', () => {
    expect(toSafeWebUrl('https://example.ch/path')).toBe('https://example.ch/path');
    expect(toSafeWebUrl('example.ch')).toBe('https://example.ch/');
    expect(toSafeWebUrl('javascript:alert(1)')).toBeNull();
    expect(toSafeWebUrl('data:text/html,<script>1</script>')).toBeNull();
    expect(toSafeWebUrl('   ')).toBeNull();
    expect(toSafeWebUrl(null)).toBeNull();
  });

  it('builds wa.me links from international-ish numbers, stripping cosmetics', () => {
    expect(toWhatsAppHref('+41 44 123 45 67')).toBe('https://web.whatsapp.com/send?phone=41441234567');
    // A leading 00 international prefix is dropped; + / spaces / dashes are too.
    expect(toWhatsAppHref('0041 44 123 45 67')).toBe('https://web.whatsapp.com/send?phone=41441234567');
    expect(toWhatsAppHref('+41 79 123 45 67', 'Hi there')).toBe('https://web.whatsapp.com/send?phone=41791234567&text=Hi%20there');
    expect(toWhatsAppHref(null)).toBeNull();
    expect(toWhatsAppHref('12345')).toBeNull();
  });

  it('offers Google Maps only when the lead has coordinates', () => {
    expect(buildGoogleMapsUrl({ location: null, sourceMetadata: emptyMeta })).toBeNull();

    const pin = buildGoogleMapsUrl({ location: { lat: 47.3769, lng: 8.5417 }, sourceMetadata: emptyMeta });
    expect(pin).toBe('https://www.google.com/maps/search/?api=1&query=47.3769%2C8.5417');

    const place = buildGoogleMapsUrl({
      location: { lat: 47.3769, lng: 8.5417 },
      sourceMetadata: { ...emptyMeta, googlePlaceId: 'ChIJ123' },
    });
    expect(place).toContain('query_place_id=ChIJ123');
  });
});

describe('resolveLeadVars', () => {
  const lead = {
    name: 'Alpine Bakery AG',
    address: { city: 'Zürich' },
    phone: '+41 44 123 45 67',
    mobile: null,
    email: 'info@example.ch',
    website: 'https://example.ch',
    websiteDomain: 'example.ch',
  } as unknown as Lead;

  it('substitutes known {{vars}} and leaves unknown ones untouched', () => {
    expect(resolveLeadVars('Hi {{businessName}} in {{city}}', lead)).toBe('Hi Alpine Bakery AG in Zürich');
    expect(resolveLeadVars('Ref {{unknown}}', lead)).toBe('Ref {{unknown}}');
    expect(resolveLeadVars('{{website}}', lead)).toBe('example.ch');
    expect(resolveLeadVars('', lead)).toBe('');
  });
});

describe('display helpers', () => {
  it('skips unset address parts and hides the home country', () => {
    const address = { street: 'Bahnhofstrasse 1', addressSupplement: null, postalCode: '8001', city: 'Zürich', canton: 'ZH', country: 'CH' };
    expect(getAddressLines(address)).toEqual(['Bahnhofstrasse 1', '8001 Zürich', 'ZH']);
    expect(formatAddressOneLine({ ...address, street: null, country: 'DE' })).toBe('8001 Zürich, ZH, DE');
    expect(getAddressLines({ street: null, addressSupplement: null, postalCode: null, city: null, canton: null, country: 'CH' })).toEqual([]);
  });

  it('names a user, falling back to the e-mail address', () => {
    expect(getUserDisplayName({ id: '1', firstName: 'Mia', lastName: 'Meier' })).toBe('Mia Meier');
    expect(getUserDisplayName({ id: '2', firstName: '', lastName: '', email: 'x@example.ch' })).toBe('x@example.ch');
    expect(getUserDisplayName(undefined)).toBe('');
  });
});

describe('getLeadCreatorName', () => {
  const directory = [
    { id: 'u-2', firstName: 'Noah', lastName: 'Frei', email: 'noah@example.ch' },
    { id: 'u-3', firstName: 'Mia', lastName: 'Meier', email: 'mia@example.ch' },
  ];

  it('names a populated creator without needing the directory', () => {
    expect(getLeadCreatorName({ id: 'u-9', firstName: 'Olivia', lastName: 'Keller', email: 'o@example.ch' })).toBe(
      'Olivia Keller',
    );
    expect(getLeadCreatorName({ id: 'u-9', firstName: null, lastName: null, email: 'o@example.ch' })).toBe('o@example.ch');
  });

  it('resolves a bare id through the user directory', () => {
    expect(getLeadCreatorName('u-2', directory)).toBe('Noah Frei');
  });

  it('falls back to the directory when the populated creator has no name at all', () => {
    expect(getLeadCreatorName({ id: 'u-3' }, directory)).toBe('Mia Meier');
  });

  it('prefers the populated name over the directory entry', () => {
    expect(getLeadCreatorName({ id: 'u-2', firstName: 'Noah', lastName: 'Frei-Keller' }, directory)).toBe(
      'Noah Frei-Keller',
    );
  });

  it('is empty (never throws) when nobody can be named', () => {
    expect(getLeadCreatorName(null)).toBe('');
    expect(getLeadCreatorName(null, directory)).toBe('');
    expect(getLeadCreatorName('u-unknown', directory)).toBe('');
    expect(getLeadCreatorName('u-2')).toBe('');
    expect(getLeadCreatorName({ id: 'u-unknown' }, directory)).toBe('');
  });
});
