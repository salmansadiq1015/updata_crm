import { beforeEach, describe, expect, test } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAccountingCurrency, useAccountingFilters } from '../state/accounting-currency';
import { formatMoney } from '../utils/accounting-ui';
import { defaultFixedAssetForm } from '../utils/fixed-assets';
import { CURRENCY_CODES } from '@/shared/data/currencies';

beforeEach(() => { localStorage.clear(); useAccountingCurrency.setState({ currency: 'CHF' }); });
describe('shared accounting currency', () => {
  test('selection propagates to every subscriber and persists', () => {
    const first = renderHook(() => useAccountingCurrency());
    const second = renderHook(() => useAccountingCurrency());
    act(() => first.result.current.setCurrency('pkr'));
    expect(second.result.current.currency).toBe('PKR');
    expect(JSON.parse(localStorage.getItem('updata-accounting-currency')).state.currency).toBe('PKR');
    expect(defaultFixedAssetForm().currency).toBe('PKR');
    act(() => first.result.current.setCurrency('ZZZ'));
    expect(second.result.current.currency).toBe('PKR');
  });
  test('shared filter updates preserve local filters across pages', () => {
    const first = renderHook(() => useAccountingFilters({ status: 'ACTIVE', currency: 'CHF' }));
    const second = renderHook(() => useAccountingFilters({ status: 'ALL', currency: 'CHF' }));
    act(() => first.result.current[1](current => ({ ...current, currency: 'USD' })));
    expect(second.result.current[0]).toEqual({ status: 'ALL', currency: 'USD' });
    expect(first.result.current[0].status).toBe('ACTIVE');
  });
  test('all currencies format with their declared minor units', () => {
    expect(CURRENCY_CODES).toEqual(expect.arrayContaining(['PKR', 'USD', 'AED', 'JPY', 'KWD', 'XCG', 'ZWG']));
    expect(formatMoney(123, 'JPY')).not.toContain('.00');
    expect(formatMoney(1.234, 'KWD')).toContain('1.234');
    for (const currency of CURRENCY_CODES) expect(() => formatMoney(1, currency)).not.toThrow();
  });
});
