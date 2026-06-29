import { vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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
    'common.next': 'Next',
  };
  return {
    useLanguage: () => ({
      locale: 'en',
      t: (key: string) => dict[key] ?? key,
    }),
  };
});

vi.mock('@/components/ui/rich-text-editor', () => ({
  RichTextEditor: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      aria-label="Rich description"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(event) => onChange?.(event.currentTarget.value)}
    />
  ),
}));

// Add catalog-specific MSW handlers
beforeEach(() => {
  server.use(
    http.get(`${BASE}/catalog/categories`, () =>
      HttpResponse.json({ success: true, data: [] }),
    ),
    http.get(`${BASE}/catalog/categories/select-options`, () =>
      HttpResponse.json({
        success: true,
        data: [{ _id: 'cat1', name: 'Materials', path: 'Materials', status: 'ACTIVE' }],
      }),
    ),
    http.get(`${BASE}/catalog/units`, () =>
      HttpResponse.json({
        success: true,
        data: [{ code: 'STK', nameDe: 'Stuck', nameFr: 'Piece', nameIt: 'Pezzo', status: 'ACTIVE' }],
      }),
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

const completeArticle = {
  _id: 'art1',
  name: 'Test',
  articleNumber: 'ART-001',
  categoryId: 'cat1',
  salesPrice: 10,
};

async function moveToSupplierStep() {
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
  await screen.findByText(/catalog\.articles\.classificationTitle/i);
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
  await screen.findByText(/catalog\.articles\.pricingTitle/i);
  fireEvent.click(screen.getByRole('button', { name: /next/i }));
  await screen.findByText(/catalog\.articles\.supplierTitle/i);
}

describe('CatalogArticleFormDialog', () => {
  it('renders supplierRef field', () => {
    render(
      <CatalogArticleFormDialog open={true} onClose={() => {}} article={completeArticle} />,
      { wrapper },
    );
    return moveToSupplierStep().then(() => {
      expect(screen.getByLabelText(/supplier reference/i)).toBeInTheDocument();
    });
  });

  it('renders IGH article number field', () => {
    render(
      <CatalogArticleFormDialog open={true} onClose={() => {}} article={completeArticle} />,
      { wrapper },
    );
    return moveToSupplierStep().then(() => {
      expect(screen.getByLabelText(/igh/i)).toBeInTheDocument();
    });
  });

  it('renders image upload section when editing (article prop set)', () => {
    render(
      <CatalogArticleFormDialog
        open={true}
        onClose={() => {}}
        article={completeArticle}
      />,
      { wrapper },
    );
    return moveToSupplierStep().then(() => {
      expect(screen.getByText(/upload image/i)).toBeInTheDocument();
    });
  });
});
