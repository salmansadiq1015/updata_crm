import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { DocumentsTable } from '../components/DocumentsTable';

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    t: (key, fallback) => fallback || key,
  }),
}));

vi.mock('../components/DocumentPreviewDrawer', () => ({
  DocumentPreviewDrawer: () => null,
}));

const documents = [
  {
    _id: 'doc-1',
    documentType: 'quotation',
    fileName: 'OFF-2026-0042_Muster_AG.pdf',
    generatedAt: '2026-06-15T08:00:00.000Z',
    fileSizeBytes: 102400,
  },
  {
    _id: 'doc-2',
    documentType: 'invoice_final',
    fileName: 'INV-2026-0042_Muster_AG.pdf',
    generatedAt: '2026-06-15T09:00:00.000Z',
    fileSizeBytes: 204800,
  },
];

function renderTable(props = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DocumentsTable documents={documents} {...props} />
    </QueryClientProvider>,
  );
}

describe('DocumentsTable', () => {
  test('renders selectable generated documents and toggles all rows', () => {
    const onSelectionChange = vi.fn();
    renderTable({ selectedIds: [], onSelectionChange });

    expect(screen.getByText('OFF-2026-0042_Muster_AG.pdf')).toBeInTheDocument();
    expect(screen.getByText('INV-2026-0042_Muster_AG.pdf')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Select all documents'));
    expect(onSelectionChange).toHaveBeenCalledWith(['doc-1', 'doc-2']);
  });

  test('shows an explicit error state', () => {
    renderTable({ error: true });
    expect(screen.getByText('Documents could not be loaded.')).toBeInTheDocument();
  });
});
