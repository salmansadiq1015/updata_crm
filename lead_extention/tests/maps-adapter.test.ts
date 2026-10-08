import { describe, expect, it } from 'vitest';
import { MapsAdapter } from '../src/content/maps-adapter';

type AdapterInternals = {
  parseRating(value: string): number | null;
  parseReviewCount(value: string): number | null;
  starLevelFromLabel(label: string): 1 | 2 | 3 | 4 | 5 | null;
  reviewCountFromHistogramLabel(label: string): number | null;
  extractPlaceIdentifier(value: string): string | null;
  coordinatesFromUrl(value: string): { latitude: number; longitude: number } | null;
  looksLikeDomain(value: string): boolean;
  addressParts(value: string | null): {
    street: string | null;
    area: string | null;
    city: string | null;
    postalCode: string | null;
    country: string | null;
  };
};

const adapter = new MapsAdapter() as unknown as AdapterInternals;

describe('Google Maps extraction parsing', () => {
  it('parses localized ratings and compact or localized review counts', () => {
    expect(adapter.parseRating('4,7 étoiles')).toBe(4.7);
    expect(adapter.parseReviewCount('1.2K reviews')).toBe(1_200);
    expect(adapter.parseReviewCount('4.9 (1.2K)')).toBe(1_200);
    expect(adapter.parseReviewCount('(1,234)')).toBe(1_234);
    expect(adapter.parseReviewCount('1 234 avis')).toBe(1_234);
  });

  it('reads a rating-histogram star level from localized aria-labels', () => {
    expect(adapter.starLevelFromLabel('5 stars, 1,234 reviews')).toBe(5);
    expect(adapter.starLevelFromLabel('1 234 avis, 5 étoiles')).toBe(5);
    expect(adapter.starLevelFromLabel('3 Sterne')).toBe(3);
    expect(adapter.starLevelFromLabel('no stars mentioned here')).toBeNull();
  });

  it('reads a histogram count only when tied to a reviews word (never from a rating or percentage)', () => {
    expect(adapter.reviewCountFromHistogramLabel('5 stars, 1,234 reviews')).toBe(1_234);
    expect(adapter.reviewCountFromHistogramLabel('5 étoiles, 1 234 avis')).toBe(1_234);
    expect(adapter.reviewCountFromHistogramLabel('2 stars, 0 reviews')).toBe(0);
    // The overall-rating label must NOT be mistaken for a bar count.
    expect(adapter.reviewCountFromHistogramLabel('Rated 4.5 out of 5 stars')).toBeNull();
    // A percentage is a proportion, not a count.
    expect(adapter.reviewCountFromHistogramLabel('5 stars, 73%')).toBeNull();
  });

  it('uses stable place identifiers from parameters and Maps data tokens', () => {
    expect(adapter.extractPlaceIdentifier('https://www.google.com/maps/place/Acme?query_place_id=ChIJ123')).toBe('ChIJ123');
    expect(adapter.extractPlaceIdentifier('https://www.google.com/maps/place/Acme/data=!4m2!3m1!16s%2Fg%2Fabc')).toBe('/g/abc');
  });

  it('extracts coordinates from both Maps URL formats', () => {
    expect(adapter.coordinatesFromUrl('https://www.google.com/maps/place/Acme/@48.8566,2.3522,17z')).toEqual({ latitude: 48.8566, longitude: 2.3522 });
    expect(adapter.coordinatesFromUrl('https://www.google.com/maps/data=!3d31.5204!4d74.3587')).toEqual({ latitude: 31.5204, longitude: 74.3587 });
  });

  it('accepts valid multi-level domains and rejects Google navigation links', () => {
    expect(adapter.looksLikeDomain('hotel.example.co.uk/contact')).toBe(true);
    expect(adapter.looksLikeDomain('https://www.google.com/maps/place/Acme')).toBe(false);
  });

  it('maps a postal address into CRM-compatible location fields', () => {
    expect(adapter.addressParts('1 Rue Exemple, 75001 Paris, France')).toEqual({
      street: '1 Rue Exemple',
      area: null,
      city: 'Paris',
      postalCode: '75001',
      country: 'France'
    });
  });

  it('keeps a real country (e.g. Pakistan) in the last segment', () => {
    expect(adapter.addressParts('123 Main Rd, Johar Town, 54000 Lahore, Pakistan')).toMatchObject({
      city: 'Lahore',
      postalCode: '54000',
      country: 'Pakistan',
    });
  });

  it('drops a non-country last segment (a stray Maps chip) instead of storing it as the country', () => {
    // A "PRESS CONFERENCE" section header captured as the address must NOT
    // become the country — the CRM resolves the real country from coordinates.
    expect(adapter.addressParts('Singapore Kitchen, 159 new, Garden Town, Lahore, PRESS CONFERENCE').country).toBeNull();
  });
});
