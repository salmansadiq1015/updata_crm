import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

const previewMock = vi.hoisted(() => vi.fn());
const previewVersionMock = vi.hoisted(() => vi.fn());

vi.mock('../services/TemplateService', () => ({
  templateService: {
    preview: previewMock,
    previewVersion: previewVersionMock,
  },
}));

import { usePreviewTemplate, usePreviewTemplateVersion } from '../hooks/useTemplateMutations';

function wrapper({ children }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('usePreviewTemplate', () => {
  test('sends draft template data for unsaved previews', async () => {
    previewMock.mockResolvedValue({ data: { downloadUrl: 'preview.pdf' } });
    const draftTemplate = { layout: { margins: { top: 30, bottom: 20, left: 20, right: 15 } } };
    const { result } = renderHook(() => usePreviewTemplate(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'tpl-1',
        sampleData: {},
        language: 'de',
        draftTemplate,
      });
    });

    expect(previewMock).toHaveBeenCalledWith('tpl-1', {
      sampleData: {},
      language: 'de',
      draftTemplate,
    });
  });

  test('sends version preview requests for historical template previews', async () => {
    previewVersionMock.mockResolvedValue({ data: { downloadUrl: 'preview-v2.pdf' } });
    const { result } = renderHook(() => usePreviewTemplateVersion(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: 'tpl-1',
        version: 2,
        sampleData: {},
        language: 'en',
      });
    });

    expect(previewVersionMock).toHaveBeenCalledWith('tpl-1', 2, {
      sampleData: {},
      language: 'en',
    });
  });
});
