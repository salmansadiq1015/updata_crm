import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../services/price-service', () => ({
  priceService: {
    update: vi.fn().mockResolvedValue({ data: { batchId: 'batch123', articlesUpdated: 5 } }),
    preview: vi.fn().mockResolvedValue({ data: { articleCount: 1, rows: [] } }),
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
    result.current.updatePrices.mutate({ type: 'bulk', updates: [{ articleId: 'a1', newPrice: 99 }] });
    await waitFor(() => expect(result.current.updatePrices.isSuccess).toBe(true));
    expect(result.current.updatePrices.data?.data?.batchId).toBe('batch123');
  });

  it('previewPrices calls preview and returns article count', async () => {
    const { result } = renderHook(() => usePriceMutations(), { wrapper });
    result.current.previewPrices.mutate({ type: 'bulk', updates: [{ articleId: 'a1', newPrice: 99 }] });
    await waitFor(() => expect(result.current.previewPrices.isSuccess).toBe(true));
    expect(result.current.previewPrices.data?.data?.articleCount).toBe(1);
  });

  it('rollbackBatch calls rollback', async () => {
    const { result } = renderHook(() => usePriceMutations(), { wrapper });
    result.current.rollbackBatch.mutate('batch123');
    await waitFor(() => expect(result.current.rollbackBatch.isSuccess).toBe(true));
  });
});
