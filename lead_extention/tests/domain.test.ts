import { describe, expect, it } from 'vitest';
import { dedupeKey, isSameLead, makeLead } from '../src/shared/normalize';
import { haversineDistanceMeters, normalizeEmail, normalizePhone, normalizeText } from '../src/shared/utils';
import { createXlsx, escapeCsv, summaryFor, toCsv } from '../src/export/exporters';
import { extractEmails } from '../src/enrichment/website-discovery';
import type { Lead } from '../src/shared/types';

const lead = (overrides: Partial<Lead> = {}): Lead => ({
  id: '1', source: 'google-maps', sourceUrl: 'https://www.google.com/maps/place/Acme', googleMapsUrl: 'https://www.google.com/maps/place/Acme', placeIdentifier: 'abc', businessName: 'Acme Cafe', category: 'Cafe', categories: ['Cafe'], phone: '+92 300 1234567', internationalPhone: '+923001234567', website: 'https://acme.example', emails: ['hello@acme.example'], address: 'Main Street', street: null, area: null, city: 'Lahore', state: null, postalCode: null, country: 'Pakistan', latitude: 31.5204, longitude: 74.3587, distanceMeters: 1500, distanceKm: 1.5, rating: 4.5, reviewCount: 12, businessStatus: 'Open', openingHours: ['Mon 9 AM'], priceLevel: null, emailSource: 'website/contact', emailConfidence: 'high', enrichmentStatus: 'complete', discoveredAt: '2026-10-06T00:00:00.000Z', updatedAt: '2026-10-06T00:00:00.000Z', searchId: 'search', ...overrides
});

describe('normalization and distance', () => {
  it('normalizes text, phone, and obfuscated email values', () => {
    expect(normalizeText('  Café — Gulberg  ')).toBe('café gulberg');
    expect(normalizePhone('00 92 (300) 123-4567')).toBe('+923001234567');
    expect(normalizeEmail('Sales [at] Example [dot] COM')).toBe('sales@example.com');
  });

  it('calculates a geographic distance with Haversine', () => {
    expect(haversineDistanceMeters({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(111_195, -2);
  });

  it('deduplicates by stable place identifier before fallback fields', () => {
    expect(dedupeKey(lead({ placeIdentifier: 'same-place' }))).toBe(dedupeKey(lead({ id: '2', placeIdentifier: 'same-place' })));
    expect(dedupeKey(lead({ placeIdentifier: null, googleMapsUrl: '', businessName: 'Same', address: 'One', phone: '+1' }))).toContain('fields:');
  });

  it('uses a narrow same-name geographic fallback without merging distant businesses', () => {
    const nearby = lead({ placeIdentifier: null, googleMapsUrl: 'https://www.google.com/maps/place/A', address: null, phone: null, latitude: 31.5204, longitude: 74.3587 });
    const sameNearby = lead({ id: '2', placeIdentifier: null, googleMapsUrl: 'https://www.google.com/maps/place/B', address: null, phone: null, latitude: 31.5209, longitude: 74.3588 });
    const distant = lead({ id: '3', placeIdentifier: null, googleMapsUrl: 'https://www.google.com/maps/place/C', address: null, phone: null, latitude: 31.5404, longitude: 74.3587 });
    expect(isSameLead(nearby, sameNearby)).toBe(true);
    expect(isSameLead(nearby, distant)).toBe(false);
  });
});

describe('local exports', () => {
  it('escapes CSV commas, quotes, line breaks, and Unicode', () => {
    expect(escapeCsv('A "quoted", café\n')).toBe('"A ""quoted"", café\n"');
    expect(toCsv([lead()])).toContain('\uFEFFname,type,status,');
  });

  it('summarizes selected local leads', () => {
    const summary = summaryFor([lead(), lead({ id: '2', emails: [], phone: null, website: null, rating: 3.5 })], null);
    expect(summary.uniqueLeads).toBe(2);
    expect(summary.phoneAvailable).toBe(1);
    expect(summary.averageRating).toBe(4);
  });

  it('creates a local XLSX ZIP workbook without a parser dependency', () => {
    const bytes = new Uint8Array(createXlsx([lead()], null));
    expect(String.fromCharCode(...bytes.slice(0, 2))).toBe('PK');
    expect(bytes.length).toBeGreaterThan(1_000);
  });
});

describe('raw record normalization', () => {
  it('does not fabricate missing contact data', () => {
    const normalized = makeLead({ businessName: 'No Contact Co', googleMapsUrl: 'https://www.google.com/maps/place/No+Contact' }, 'search');
    expect(normalized.phone).toBeNull();
    expect(normalized.website).toBeNull();
    expect(normalized.emails).toEqual([]);
  });

  it('extracts public and obfuscated email formats without inventing contacts', () => {
    expect(extractEmails('sales@example.com and hello [at] example [dot] org')).toEqual(['sales@example.com', 'hello@example.org']);
    expect(extractEmails('No email published here')).toEqual([]);
  });
});
