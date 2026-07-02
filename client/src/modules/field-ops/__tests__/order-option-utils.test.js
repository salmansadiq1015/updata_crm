import { describe, expect, it } from 'vitest';
import {
  formatFieldOpsOrderOptionLabel,
  getFieldOpsOrderId,
  toFieldOpsOrderItems,
} from '../utils/order-option-utils';

describe('order option utils', () => {
  it('normalizes array and paginated order responses to item arrays', () => {
    const orders = [{ _id: 'o1' }, { _id: 'o2' }];

    expect(toFieldOpsOrderItems(orders)).toBe(orders);
    expect(toFieldOpsOrderItems({ items: orders, pagination: { hasNext: false } })).toBe(orders);
    expect(toFieldOpsOrderItems({ data: orders })).toBe(orders);
    expect(toFieldOpsOrderItems({ data: { items: orders } })).toBe(orders);
    expect(toFieldOpsOrderItems({ data: { rows: orders } })).toEqual([]);
    expect(toFieldOpsOrderItems(null)).toEqual([]);
  });

  it('extracts stable order ids across backend field variants', () => {
    expect(getFieldOpsOrderId({ _id: 'mongo-id', id: 'public-id' })).toBe('mongo-id');
    expect(getFieldOpsOrderId({ id: 'public-id' })).toBe('public-id');
    expect(getFieldOpsOrderId({ order_id: 'legacy-id' })).toBe('legacy-id');
    expect(getFieldOpsOrderId(null)).toBe('');
  });

  it('formats order select labels with localized title fallbacks', () => {
    expect(formatFieldOpsOrderOptionLabel({ assignmentNumber: 'A-42', title: 'Annual service' }, 'en'))
      .toBe('#A-42 Annual service');
    expect(formatFieldOpsOrderOptionLabel({ assignment_number: 'A-43' }, 'en'))
      .toBe('#A-43 Untitled');
    expect(formatFieldOpsOrderOptionLabel({}, 'de')).toBe('Ohne Titel');
  });
});
