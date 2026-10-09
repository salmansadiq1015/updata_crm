import { describe, expect, it } from 'vitest';
import { detailMatchesRecord } from '../src/shared/utils';

describe('detailMatchesRecord', () => {
  it('accepts the same place id', () => {
    expect(detailMatchesRecord({ placeIdentifier: '0x1:0x2', businessName: 'X' }, { placeIdentifier: '0x1:0x2', businessName: 'Y' })).toBe(true);
  });
  it('accepts the same name (accents/punctuation-insensitive)', () => {
    expect(detailMatchesRecord({ businessName: "Hôtel de l'Europe" }, { businessName: 'Hôtel de l’Europe' })).toBe(true);
    expect(detailMatchesRecord({ businessName: 'Terminus Lyon Hotel - Paris' }, { businessName: 'Terminus Lyon Hotel' })).toBe(true);
  });
  it('rejects the previous business still shown in the detail tab', () => {
    expect(detailMatchesRecord(
      { placeIdentifier: '0xaaa:0x1', businessName: 'Terminus Lyon Hotel - Paris' },
      { placeIdentifier: '0xbbb:0x2', businessName: 'Première Classe Plaisir' },
    )).toBe(false);
  });
  it('rejects when a name is missing and ids differ', () => {
    expect(detailMatchesRecord({ placeIdentifier: 'a', businessName: '' }, { placeIdentifier: 'b', businessName: 'Hotel' })).toBe(false);
  });
});
