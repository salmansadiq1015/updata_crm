'use client';
import { useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isSupportedCurrency } from '@/shared/data/currencies';

export const useAccountingCurrency = create(persist((set) => ({
  currency: 'CHF',
  setCurrency: currency => {
    const normalized = String(currency).trim().toUpperCase();
    if (isSupportedCurrency(normalized)) set({ currency: normalized });
  },
}), {
  name: 'updata-accounting-currency',
  partialize: state => ({ currency: state.currency }),
  merge: (saved, current) => ({ ...current, currency: isSupportedCurrency(saved?.currency) ? saved.currency : current.currency }),
}));

export const getAccountingCurrency = () => useAccountingCurrency.getState().currency;

// Currency is one shared filter; unrelated page filters retain their local state.
export function useAccountingFilters(initial, currencyKey = 'currency') {
  const [local, setLocal] = useState(initial);
  const { currency, setCurrency } = useAccountingCurrency();
  const filters = { ...local, [currencyKey]: currency };
  const setFilters = update => {
    const next = typeof update === 'function' ? update(filters) : update;
    if (next[currencyKey] && next[currencyKey] !== currency) setCurrency(next[currencyKey]);
    setLocal(next);
  };
  return [filters, setFilters];
}
