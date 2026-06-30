import { describe, expect, it } from 'vitest';
import {
  buildSequencePreview,
  getNumberingSummary,
  getSequencePreviewParts,
  isSequenceFormDirty,
  normalizeSequenceForm,
  sanitizeSequenceForm,
  validateSequenceForm,
} from '@/modules/qop/utils/numbering-formatters';

const PREVIEW_DATE = new Date('2026-06-30T10:00:00.000Z');

describe('numbering formatters', () => {
  it('builds previews with the same prefix-year-number order used by the API', () => {
    expect(
      buildSequencePreview(
        {
          prefix: 'OFF',
          separator: '-',
          yearFormat: 'YYYY',
          paddingLength: 4,
        },
        41,
        PREVIEW_DATE,
      ),
    ).toBe('OFF-2026-0042');
  });

  it('supports compact year and empty separators', () => {
    expect(
      buildSequencePreview(
        {
          prefix: 'RE',
          separator: '',
          yearFormat: 'YY',
          paddingLength: 3,
        },
        6,
        PREVIEW_DATE,
      ),
    ).toBe('RE26007');
  });

  it('returns preview parts for the editable format breakdown', () => {
    expect(
      getSequencePreviewParts(
        {
          prefix: 'AUF',
          separator: '/',
          yearFormat: 'none',
          paddingLength: 2,
        },
        8,
        PREVIEW_DATE,
      ),
    ).toEqual([
      { id: 'prefix', label: 'Prefix', value: 'AUF' },
      { id: 'number', label: 'Number', value: '09' },
    ]);
  });

  it('validates required limits before save', () => {
    expect(validateSequenceForm({ prefix: '', separator: '----', yearFormat: 'YYYY', paddingLength: 12 })).toEqual({
      prefix: 'required',
      separator: 'maxLength',
      paddingLength: 'range',
    });
  });

  it('normalizes, sanitizes, and detects unsaved changes', () => {
    const sequence = {
      prefix: ' OFF ',
      separator: '-',
      yearFormat: 'YYYY',
      paddingLength: 4,
      resetsAnnually: true,
      isActive: true,
    };

    const form = normalizeSequenceForm(sequence);
    expect(isSequenceFormDirty(sequence, form)).toBe(false);

    expect(sanitizeSequenceForm({ ...form, prefix: ' QUOTATION-LONG ' })).toMatchObject({
      prefix: 'QUOTATION-',
      paddingLength: 4,
    });
    expect(isSequenceFormDirty(sequence, { ...form, paddingLength: 5 })).toBe(true);
  });

  it('summarizes issued, active, inactive, and annual reset sequences', () => {
    expect(
      getNumberingSummary([
        { currentValue: 10, isActive: true, resetsAnnually: true },
        { currentValue: 5, isActive: false, resetsAnnually: false },
        { currentValue: 2 },
      ]),
    ).toEqual({
      total: 3,
      activeCount: 2,
      inactiveCount: 1,
      annualResetCount: 2,
      totalIssued: 17,
    });
  });
});
