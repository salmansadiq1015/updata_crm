import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../services/document-service', () => ({
  documentService: {
    restoreDocument: vi.fn().mockResolvedValue({ _id: 'd1', isDeleted: false }),
    deleteDocument: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ t: (_k: string, fallback: string) => fallback }),
}));

import { documentService } from '../services/document-service';
import { useDocumentMutations } from '../hooks/use-document-mutations';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, {
    client: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
  }, children);

describe('useDocumentMutations.restore', () => {
  it('calls documentService.restoreDocument with project + doc id', async () => {
    const onRestore = vi.fn();
    const { result } = renderHook(() => useDocumentMutations('proj1', { onRestore }), { wrapper });

    result.current.restore.mutate('d1');

    await waitFor(() => expect(result.current.restore.isSuccess).toBe(true));
    expect(documentService.restoreDocument).toHaveBeenCalledWith('proj1', 'd1');
    expect(onRestore).toHaveBeenCalled();
  });
});
