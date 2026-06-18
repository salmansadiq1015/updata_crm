import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

const useTemplatesMock = vi.hoisted(() => vi.fn());
const routerPushMock = vi.hoisted(() => vi.fn());
const createMutateAsync = vi.hoisted(() => vi.fn());
const updateMutateAsync = vi.hoisted(() => vi.fn());
const duplicateMutateAsync = vi.hoisted(() => vi.fn());
const deleteMutateAsync = vi.hoisted(() => vi.fn());

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    locale: 'en',
    t: (key, fallback) => fallback || key,
  }),
}));

vi.mock('@/lib/toast', () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock('@/modules/doctpl/hooks/useTemplateQueries', () => ({
  useTemplates: (filters) => useTemplatesMock(filters),
}));

vi.mock('@/modules/doctpl/hooks/useTemplateMutations', () => ({
  useCreateTemplate: () => ({ mutateAsync: createMutateAsync, isPending: false }),
  useUpdateTemplate: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useDuplicateTemplate: () => ({ mutateAsync: duplicateMutateAsync, isPending: false }),
  useDeleteTemplate: () => ({ mutateAsync: deleteMutateAsync, isPending: false }),
}));

import AdminTemplatesPage, { buildTemplateFilters } from '../../../app/(platform)/admin/templates/page';

describe('AdminTemplatesPage', () => {
  beforeEach(() => {
    routerPushMock.mockReset();
    createMutateAsync.mockReset();
    updateMutateAsync.mockReset();
    duplicateMutateAsync.mockReset();
    deleteMutateAsync.mockReset();
    createMutateAsync.mockResolvedValue({ data: { _id: 'tpl-new' } });
    duplicateMutateAsync.mockResolvedValue({});
    useTemplatesMock.mockReset();
    useTemplatesMock.mockReturnValue({
      data: {
        items: [
          {
            _id: 'tpl-1',
            name: 'Quotation Default',
            templateType: 'quotation',
            isActive: true,
            currentVersion: 3,
            updatedAt: '2026-06-15T09:00:00.000Z',
          },
        ],
        pagination: { hasNext: false },
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  test('builds cursor filters for search type status and sort', () => {
    expect(buildTemplateFilters({
      cursor: 'next-cursor',
      search: ' invoice ',
      typeFilter: 'invoice_final',
      statusFilter: 'active',
      sortValue: 'name:asc',
    })).toEqual({
      limit: 24,
      cursor: 'next-cursor',
      search: 'invoice',
      templateType: 'invoice_final',
      isActive: true,
      sortBy: 'name',
      sortOrder: 'asc',
    });
  });

  test('renders template management actions and duplicates through the mutation hook', async () => {
    render(<AdminTemplatesPage />);

    expect(screen.getByText('Quotation Default')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Duplicate'));

    await waitFor(() => {
      expect(duplicateMutateAsync).toHaveBeenCalledWith({ id: 'tpl-1' });
    });
  });

  test('creates a template from the built-in profile dialog and opens the editor', async () => {
    render(<AdminTemplatesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Create template' }));
    fireEvent.change(await screen.findByLabelText('Name'), { target: { value: 'Custom Cover' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Create template' }).at(-1));

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith(expect.objectContaining({
        templateType: 'cover_letter',
        name: 'Custom Cover',
        isActive: true,
      }));
    });
    const payload = createMutateAsync.mock.calls[0][0];
    expect(Object.keys(payload.textBlocks)).toEqual(['de', 'fr', 'it', 'en']);
    expect(payload.sections.map((section) => section.type)).toEqual(['header', 'body', 'footer']);
    expect(payload.tableColumns).toEqual([]);
    expect(routerPushMock).toHaveBeenCalledWith('/admin/templates/tpl-new');
  });
});
