import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../services/project-service', () => ({
  projectService: {
    searchProjects: vi.fn().mockResolvedValue([
      { _id: 't1', name: 'Standard Heating Install', projectNumber: 'PRJ-2026-00001', projectType: 'NEW_INSTALLATION' },
    ]),
  },
}));

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ t: (_k: string, fallback: string) => fallback, language: 'en' }),
}));

import { CreateFromTemplateDialog } from '../components/create-from-template-dialog';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, {
    client: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  }, children);

describe('CreateFromTemplateDialog', () => {
  it('selects a template project and submits its id with overrides', async () => {
    const onSubmit = vi.fn();
    render(
      React.createElement(CreateFromTemplateDialog, {
        open: true,
        onOpenChange: vi.fn(),
        onSubmit,
        isLoading: false,
      }),
      { wrapper },
    );

    // search for a template
    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'heating' } });

    // result appears and is selectable
    const result = await screen.findByText('Standard Heating Install');
    fireEvent.click(result);

    // submit
    const createBtn = screen.getByRole('button', { name: /create from template/i });
    fireEvent.click(createBtn);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ templateId: 't1' });
  });

  it('disables submit until a template is chosen', () => {
    render(
      React.createElement(CreateFromTemplateDialog, {
        open: true,
        onOpenChange: vi.fn(),
        onSubmit: vi.fn(),
        isLoading: false,
      }),
      { wrapper },
    );
    const createBtn = screen.getByRole('button', { name: /create from template/i });
    expect(createBtn).toBeDisabled();
  });
});
