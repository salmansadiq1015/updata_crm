import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArticlePickerDialog } from '../components/article-picker-dialog';
import React from 'react';

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ locale: 'en', t: (k: string) => k }),
}));

// Mock apiClient — vi.mock is hoisted so the factory must not reference
// variables declared later. Use vi.fn() directly inside the factory.
vi.mock('@/lib/api/client', () => ({
  default: { get: vi.fn() },
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
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
};

beforeEach(() => {
  vi.mocked(apiClient.get).mockResolvedValue({ data: mockArticles });
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
    expect(await screen.findByText('Rohr 28mm', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('calls onSelect with snapshot when article clicked', async () => {
    const onSelect = vi.fn();
    render(
      <ArticlePickerDialog open={true} onClose={() => {}} onSelect={onSelect} />,
      { wrapper: makeWrapper() }
    );
    fireEvent.click(await screen.findByText('Rohr 28mm', {}, { timeout: 5000 }));
    expect(onSelect).toHaveBeenCalledWith({
      catalogArticleId: 'art1',
      articleNumber: 'A001',
      name: 'Rohr 28mm',
      description: 'Kupferrohr 28mm',
      unitOfMeasure: 'm',
      snapshotPrice: 14.5,
      type: 'MATERIAL',
      source: 'INTERNAL',
    });
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
      expect.objectContaining({ catalogArticleId: null, name: 'Custom item' })
    );
  });
});
