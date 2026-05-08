import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useUnitMutations } from '../hooks/use-unit-mutations';
import React from 'react';

vi.mock('../services/unit-service', () => ({
  unitService: {
    create: vi.fn().mockResolvedValue({ data: { _id: 'u1', code: 'PAL', nameDe: 'Palette', nameFr: 'Palette', nameIt: 'Pallet', isSystem: false } }),
    remove: vi.fn().mockResolvedValue({ data: { deleted: true } }),
    update: vi.fn().mockResolvedValue({ data: {} }),
  }
}));

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: new QueryClient() }, children);

describe('useUnitMutations', () => {
  it('createUnit fires POST and returns created unit', async () => {
    const { result } = renderHook(() => useUnitMutations(), { wrapper });
    result.current.createUnit.mutate({ code: 'PAL', nameDe: 'Palette', nameFr: 'Palette', nameIt: 'Pallet' });
    await waitFor(() => expect(result.current.createUnit.isSuccess).toBe(true));
    expect(result.current.createUnit.data?.data?.code).toBe('PAL');
  });

  it('deleteUnit fires DELETE', async () => {
    const { result } = renderHook(() => useUnitMutations(), { wrapper });
    result.current.deleteUnit.mutate('PAL');
    await waitFor(() => expect(result.current.deleteUnit.isSuccess).toBe(true));
  });
});
