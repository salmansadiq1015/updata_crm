import { describe, expect, it } from '@jest/globals';
import { sanitizeCsvCell, sanitizeCsvRows } from '../../src/modules/messaging/csvSafety.js';

describe('messaging CSV export safety', () => {
  it.each([
    ['=HYPERLINK("https://example.test")', "'=HYPERLINK(\"https://example.test\")"],
    ['+41791234567', "'+41791234567"],
    ['  -2+3', "'  -2+3"],
    ['@SUM(1,1)', "'@SUM(1,1)"],
    ['\t=cmd', "'\t=cmd"],
  ])('neutralizes formula-shaped text %s', (value, expected) => {
    expect(sanitizeCsvCell(value)).toBe(expected);
  });

  it('preserves ordinary strings, dates, empty values, and numeric evidence', () => {
    const values = ['Alice Example', '2026-10-13T00:00:00.000Z', '', null, undefined, -12.5, 0];
    expect(values.map(sanitizeCsvCell)).toEqual(values);
  });

  it('sanitizes every string field without mutating the source rows', () => {
    const source = [{ leadName: '=2+2', destination: '+12025550123', attempts: 2 }];
    const result = sanitizeCsvRows(source);

    expect(result).toEqual([{ leadName: "'=2+2", destination: "'+12025550123", attempts: 2 }]);
    expect(source).toEqual([{ leadName: '=2+2', destination: '+12025550123', attempts: 2 }]);
  });
});
