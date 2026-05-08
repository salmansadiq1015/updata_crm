import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../services/price-service', () => ({
  priceService: {
    update: vi.fn().mockResolvedValue({ data: { batchId: 'batch123', articlesUpdated: 5 } }),
    rollback: vi.fn().mockResolvedValue({ data: { rolledBack: 5 } }),
    schedule: vi.fn().mockResolvedValue({ data: { batchId: 'sched1' } }),
    getBatches: vi.fn().mockResolvedValue({ data: [] }),
    getHistory: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

import { usePriceMutations } from '../hooks/use-price-mutations';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, {
    client: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  }, children);

describe('usePriceMutations', () => {
  it('updatePrices calls update and returns batchId', async () => {
    const { result } = renderHook(() => usePriceMutations(), { wrapper });
    result.current.updatePrices.mutate({ articleIds: ['a1'], newPrice: 99 });
    await waitFor(() => expect(result.current.updatePrices.isSuccess).toBe(true));
    expect(result.current.updatePrices.data?.data?.batchId).toBe('batch123');
  });

  it('rollbackBatch calls rollback', async () => {
    const { result } = renderHook(() => usePriceMutations(), { wrapper });
    result.current.rollbackBatch.mutate('batch123');
    await waitFor(() => expect(result.current.rollbackBatch.isSuccess).toBe(true));
  });
});
