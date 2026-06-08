import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../services/project-service', () => ({
  projectService: {
    createProject: vi.fn().mockResolvedValue({ _id: 'p1' }),
    createFromTemplate: vi.fn().mockResolvedValue({ _id: 'p2', projectNumber: 'PRJ-2026-00001' }),
    updateProject: vi.fn().mockResolvedValue({ _id: 'p1' }),
    deleteProject: vi.fn().mockResolvedValue({ ok: true }),
    archiveProject: vi.fn().mockResolvedValue({ _id: 'p1', status: 'ARCHIVED' }),
    restoreProject: vi.fn().mockResolvedValue({ _id: 'p1', isDeleted: false }),
  },
}));

vi.mock('@/lib/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ t: (_k: string, fallback: string) => fallback }),
}));

import { projectService } from '../services/project-service';
import { useProjectMutations } from '../hooks/use-project-mutations';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, {
    client: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }),
  }, children);

describe('useProjectMutations.createFromTemplate', () => {
  it('calls projectService.createFromTemplate with template id + overrides', async () => {
    const onCreate = vi.fn();
    const { result } = renderHook(() => useProjectMutations({ onCreate }), { wrapper });

    result.current.createFromTemplate.mutate({ templateId: 't1', name: 'New Roof' });

    await waitFor(() => expect(result.current.createFromTemplate.isSuccess).toBe(true));
    expect(projectService.createFromTemplate).toHaveBeenCalledWith({ templateId: 't1', name: 'New Roof' });
    expect(onCreate).toHaveBeenCalledWith({ _id: 'p2', projectNumber: 'PRJ-2026-00001' });
  });

  it('archive calls projectService.archiveProject', async () => {
    const onArchive = vi.fn();
    const { result } = renderHook(() => useProjectMutations({ onArchive }), { wrapper });
    result.current.archive.mutate('p1');
    await waitFor(() => expect(result.current.archive.isSuccess).toBe(true));
    expect(projectService.archiveProject).toHaveBeenCalledWith('p1');
    expect(onArchive).toHaveBeenCalled();
  });

  it('restore calls projectService.restoreProject', async () => {
    const onRestore = vi.fn();
    const { result } = renderHook(() => useProjectMutations({ onRestore }), { wrapper });
    result.current.restore.mutate('p1');
    await waitFor(() => expect(result.current.restore.isSuccess).toBe(true));
    expect(projectService.restoreProject).toHaveBeenCalledWith('p1');
    expect(onRestore).toHaveBeenCalled();
  });
});
