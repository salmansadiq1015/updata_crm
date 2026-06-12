import { describe, test, expect } from '@jest/globals';
import swissPlzService from '../../src/shared/ai/swissPlz.service.js';

describe('Swiss PLZ address parsing', () => {
  test('parses standard Zurich address', () => {
    const result = swissPlzService.parseAddress('Bahnhofstrasse 12, 8001 Zurich');
    expect(result.postalCode).toBe('8001');
    expect(result.city).toBe('Zürich');
    expect(result.canton).toBe('ZH');
    expect(result.street).toContain('Bahnhofstrasse');
    expect(result.houseNumber).toBe('12');
    expect(result.isValid).toBe(true);
  });

  test('detects PLZ-city mismatch', () => {
    const result = swissPlzService.parseAddress('Hauptstrasse 1, 8001 Bern');
    expect(result.validationErrors).toContain('plz_city_mismatch');
  });

  test('normalizes street suffix', () => {
    const result = swissPlzService.parseAddress('Industriestr 42, 8005 Zurich');
    expect(result.street).toContain('Strasse');
  });

  test('validates PLZ lookup', () => {
    const v = swissPlzService.validatePlzCity('3000', 'Bern');
    expect(v.valid).toBe(true);
    expect(v.canton).toBe('BE');
  });
});
