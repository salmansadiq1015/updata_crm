import { describe, expect, test } from 'vitest';
import {
  buildCustomerOptions,
  buildDepartmentOptions,
  buildProjectOptions,
  normalizeReferenceItems,
} from '../utils/document-form-utils';

describe('qop document form reference utilities', () => {
  test('normalizes common list envelopes', () => {
    const items = [{ _id: 'ref-1', name: 'Service' }];

    expect(normalizeReferenceItems(items)).toBe(items);
    expect(normalizeReferenceItems({ data: items })).toBe(items);
    expect(normalizeReferenceItems({ items })).toBe(items);
    expect(normalizeReferenceItems({ results: items })).toBe(items);
    expect(normalizeReferenceItems({ records: items })).toBe(items);
    expect(normalizeReferenceItems(null)).toEqual([]);
  });

  test('builds department options from enveloped payloads', () => {
    expect(buildDepartmentOptions({ data: [{ _id: 'dep-1', name: 'Service', code: 'SVC' }] })).toEqual([
      { value: 'dep-1', label: 'Service', badge: 'SVC' },
    ]);
  });

  test('builds searchable project options from enveloped payloads', () => {
    expect(buildProjectOptions({
      items: [{
        _id: 'project-1',
        name: 'Boiler retrofit',
        projectNumber: 'PRJ-100',
        customerName: 'Updata',
      }],
    })).toEqual([
      {
        value: 'project-1',
        label: 'Boiler retrofit',
        badge: 'PRJ-100',
        keywords: 'PRJ-100 Boiler retrofit Updata',
      },
    ]);
  });

  test('builds customer options from enveloped payloads', () => {
    expect(buildCustomerOptions({ data: [{ id: 'cust-1', name: 'Acme AG', city: 'Bern' }] })).toEqual([
      { value: 'cust-1', label: 'Acme AG', description: 'Bern' },
    ]);
  });
});
