import { describe, expect, test } from '@jest/globals';
import { createSession, listResults } from '../discovery.validation.js';

describe('business discovery validation', () => {
  test('defaults result cursor pages to the 300-row initial load size', () => {
    const { error, value } = listResults.query.validate({
      sortBy: 'discoveredAt',
      sortOrder: 'desc',
    }, { convert: true });

    expect(error).toBeUndefined();
    expect(value).toEqual(expect.objectContaining({
      limit: 300,
      sortBy: 'discoveredAt',
      sortOrder: 'desc',
    }));
  });

  test('accepts bounded larger cursor pages for explicit load-more requests', () => {
    const { error, value } = listResults.query.validate({
      limit: '500',
      sortBy: 'discoveredAt',
      sortOrder: 'desc',
    }, { convert: true });

    expect(error).toBeUndefined();
    expect(value).toEqual(expect.objectContaining({
      limit: 500,
      sortBy: 'discoveredAt',
      sortOrder: 'desc',
    }));
  });

  test('accepts the client name sort alias used by the results UI', () => {
    const { error, value } = listResults.query.validate({
      limit: '500',
      sortBy: 'name',
      sortOrder: 'asc',
    }, { convert: true });

    expect(error).toBeUndefined();
    expect(value.sortBy).toBe('name');
  });

  test('does not reject a verbose geocoder country label in location.countryCode', () => {
    const { error, value } = createSession.body.validate({
      location: {
        name: 'Paris',
        mode: 'search',
        center: { lat: 48.8566, lng: 2.3522 },
        countryCode: 'France',
        country: 'France',
        formattedAddress: 'Paris, Île-de-France, France métropolitaine, France',
      },
      area: { type: 'radius', radiusMeters: 5000 },
      businessTypes: ['restaurant'],
    }, { convert: true, stripUnknown: true });

    expect(error).toBeUndefined();
    expect(value.location.countryCode).toBeUndefined();
    expect(value.location.country).toBe('France');
  });
});
