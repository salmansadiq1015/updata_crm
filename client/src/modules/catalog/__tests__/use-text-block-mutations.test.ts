import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../services/text-block-service', () => ({
  textBlockService: {
    create: vi.fn().mockResolvedValue({ data: { _id: 'tb1', title: 'Warranty Terms', bodyHtml: '<p>12 months</p>', status: 'ACTIVE' } }),
    remove: vi.fn().mockResolvedValue({ data: { deleted: true } }),
    update: vi.fn().mockResolvedValue({ data: { _id: 'tb1', title: 'Updated' } }),
    list: vi.fn().mockResolvedValue({ data: [] }),
  },
}));

import { useTextBlockMutations } from '../hooks/use-text-block-mutations';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) }, children);

describe('useTextBlockMutations', () => {
  it('createTextBlock fires create and returns block', async () => {
    const { result } = renderHook(() => useTextBlockMutations(), { wrapper });
    result.current.createTextBlock.mutate({ title: 'Warranty Terms', bodyHtml: '<p>12 months</p>' });
    await waitFor(() => expect(result.current.createTextBlock.isSuccess).toBe(true));
    expect(result.current.createTextBlock.data?.data?.title).toBe('Warranty Terms');
  });

  it('deleteTextBlock fires remove', async () => {
    const { result } = renderHook(() => useTextBlockMutations(), { wrapper });
    result.current.deleteTextBlock.mutate('tb1');
    await waitFor(() => expect(result.current.deleteTextBlock.isSuccess).toBe(true));
  });
});
