import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArticlePickerDialog } from '../components/article-picker-dialog';
import React from 'react';

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    locale: 'en',
    t: (k: string, fallback?: string | null, vars?: Record<string, string>) => {
      const messages: Record<string, string> = {
        'catalog.picker.articleTitle': 'Select Article',
        'catalog.picker.articleDescription': 'Search catalog articles and insert a snapshot into the current document.',
        'catalog.picker.articleSearchPlaceholder': 'Search by name or article number...',
        'catalog.picker.searching': 'Searching...',
        'catalog.picker.startArticleSearch': 'Start typing to search the catalog.',
        'catalog.picker.noArticlesFor': 'No articles found for "{query}".',
        'catalog.picker.addFreeText': 'Add as free text: "{query}"',
        'catalog.articles.purchaseShort': 'Buy',
      };
      const value = messages[k] ?? fallback ?? k;
      return value.replace(/\{(\w+)\}/g, (_, key) => vars?.[key] ?? `{${key}}`);
    },
  }),
}));

// Mock apiClient — vi.mock is hoisted so the factory must not reference
// variables declared later. Use vi.fn() directly inside the factory.
vi.mock('@/lib/api/client', () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

const mockArticles = [
  {
    _id: 'art1',
    articleNumber: 'A001',
    name: 'Rohr 28mm',
    description: 'Kupferrohr 28mm',
    unitOfMeasure: 'm',
    basePrice: 14.5,
    type: 'MATERIAL',
    source: 'INTERNAL',
  },
  {
    _id: 'art2',
    articleNumber: 'SVC-001',
    name: 'Stundenlohn',
    description: 'Standard-Stundenlohn',
    unitOfMeasure: 'h',
    basePrice: 110,
    type: 'SERVICE',
    source: 'INTERNAL',
  },
];

// Import the mocked module to get a reference to the mock fn
import apiClient from '@/lib/api/client';

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  }
  return Wrapper;
};

beforeEach(() => {
  vi.mocked(apiClient.get).mockResolvedValue({ data: mockArticles });
  vi.mocked(apiClient.post).mockResolvedValue({ data: { success: true } });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ArticlePickerDialog', () => {
  it('renders search input when open', () => {
    render(
      <ArticlePickerDialog open={true} onClose={() => {}} onSelect={() => {}} />,
      { wrapper: makeWrapper() }
    );
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it('renders articles after query fires', async () => {
    render(
      <ArticlePickerDialog open={true} onClose={() => {}} onSelect={() => {}} />,
      { wrapper: makeWrapper() }
    );
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'Rohr');
    expect(await screen.findByText('Rohr 28mm', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('calls onSelect with the snapshot once the article is confirmed', async () => {
    const onSelect = vi.fn();
    render(
      <ArticlePickerDialog open={true} onClose={() => {}} onSelect={onSelect} />,
      { wrapper: makeWrapper() }
    );
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'Rohr');
    // Two steps since the picker gained its options: clicking an article
    // selects it and offers to include the description and the price, and the
    // snapshot is only taken when the office confirms.
    fireEvent.click(await screen.findByText('Rohr 28mm', {}, { timeout: 5000 }));
    expect(onSelect).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: /übernehmen|confirm/i }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      catalogArticleId: 'art1',
      articleNumber: 'A001',
      name: 'Rohr 28mm',
      description: 'Kupferrohr 28mm',
      unitOfMeasure: 'm',
      snapshotPrice: 14.5,
      type: 'MATERIAL',
      source: 'INTERNAL',
      catalogSnapshot: expect.objectContaining({
        catalogArticleId: 'art1',
        snapshotBasePrice: 14.5,
        catalogSource: 'INTERNAL',
      }),
    }));
  });

  it('shows free-text button when no articles found', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
    const onSelect = vi.fn();
    render(
      <ArticlePickerDialog open={true} onClose={() => {}} onSelect={onSelect} />,
      { wrapper: makeWrapper() }
    );
    await userEvent.type(screen.getByPlaceholderText(/search/i), 'Custom item');
    const freeTextBtn = await screen.findByRole('button', { name: /add as free text/i }, { timeout: 5000 });
    fireEvent.click(freeTextBtn);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ catalogArticleId: null, name: 'Custom item', catalogSnapshot: null })
    );
  });
});
