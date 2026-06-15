import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CatalogBulkImportDialog } from '../components/catalog-bulk-import-dialog';

// Mock useLanguage so the component does not require a LanguageProvider
vi.mock('@/lib/i18n/language-context', () => {
  const dict: Record<string, string> = {
    'catalog.articles.importTitle': 'Bulk Import',
    'catalog.articles.importDescription': 'Upload a CSV or JSON file to import articles.',
    'catalog.articles.importDownloadTemplate': 'Download Template',
    'catalog.articles.importErrors': 'Import Errors',
    'catalog.articles.bulkImport': 'Bulk Import',
  };
  return {
    useLanguage: () => ({
      locale: 'en',
      t: (key: string) => dict[key] ?? key,
    }),
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('CatalogBulkImportDialog', () => {
  it('renders file input and download template link', () => {
    render(
      <CatalogBulkImportDialog open={true} onClose={() => {}} />,
      { wrapper }
    );
    expect(screen.getByText(/download template/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bulk import/i })).toBeInTheDocument();
  });

  it('shows error table when importErrors prop provided', () => {
    render(
      <CatalogBulkImportDialog
        open={true}
        onClose={() => {}}
        importErrors={[{ row: 2, field: 'articleNumber', message: 'Duplicate' }]}
      />,
      { wrapper }
    );
    expect(screen.getByText('Duplicate')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
