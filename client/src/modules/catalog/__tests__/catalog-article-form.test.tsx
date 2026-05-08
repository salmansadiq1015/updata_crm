import { vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../tasks/__tests__/mocks/server';
import { CatalogArticleFormDialog } from '../components/catalog-article-form-dialog';

const BASE = 'http://localhost:9097/api/v1';

// Mock useLanguage so the component does not require a LanguageProvider
vi.mock('@/lib/i18n/language-context', () => {
  const dict: Record<string, string> = {
    'catalog.articles.supplierRef': 'Supplier Reference',
    'catalog.articles.ighNumber': 'IGH Article Number',
    'catalog.images.upload': 'Upload Image',
    'catalog.images.maxSize': 'Max 2 MB per image',
  };
  return {
    useLanguage: () => ({
      locale: 'en',
      t: (key: string) => dict[key] ?? key,
    }),
  };
});

// Add catalog-specific MSW handlers
beforeEach(() => {
  server.use(
    http.get(`${BASE}/catalog/categories`, () =>
      HttpResponse.json({ success: true, data: [] }),
    ),
    http.get(`${BASE}/catalog/articles/:id/images`, () =>
      HttpResponse.json({ success: true, data: [] }),
    ),
  );
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('CatalogArticleFormDialog', () => {
  it('renders supplierRef field', () => {
    render(
      <CatalogArticleFormDialog open={true} onClose={() => {}} article={null} />,
      { wrapper },
    );
    expect(screen.getByLabelText(/supplier/i)).toBeInTheDocument();
  });

  it('renders IGH article number field', () => {
    render(
      <CatalogArticleFormDialog open={true} onClose={() => {}} article={null} />,
      { wrapper },
    );
    expect(screen.getByLabelText(/igh/i)).toBeInTheDocument();
  });

  it('renders image upload section when editing (article prop set)', () => {
    render(
      <CatalogArticleFormDialog
        open={true}
        onClose={() => {}}
        article={{ _id: 'art1', name: 'Test', articleNumber: 'ART-001' }}
      />,
      { wrapper },
    );
    expect(screen.getByText(/upload image/i)).toBeInTheDocument();
  });
});
