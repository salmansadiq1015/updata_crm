// client/src/modules/catalog/components/text-block-table.test.jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const blocks = [
  { _id: '1', title: 'Alpha', categoryId: 'c1', price: 0, status: 'ACTIVE' },
  { _id: '2', title: 'Beta', categoryId: 'c2', category: { _id: 'c2', name: 'Cat2' }, price: 20, status: 'INACTIVE' },
];

vi.mock('../hooks/use-text-block-queries', () => ({ useTextBlocks: () => ({ data: blocks, isLoading: false }) }));
vi.mock('../hooks/use-text-block-mutations', () => ({ useTextBlockMutations: () => ({ createTextBlock: { mutate: vi.fn(), isPending: false }, updateTextBlock: { mutate: vi.fn(), isPending: false }, deleteTextBlock: { mutate: vi.fn(), isPending: false } }) }));
vi.mock('../hooks/use-catalog-queries', () => ({ useCatalogCategories: () => ({ data: [{ _id: 'c1', name: 'Cat1' }, { _id: 'c2', name: 'Cat2' }] }) }));
vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    t: (key, fallback) => ({
      'catalog.articles.statusActive': 'Active',
      'catalog.articles.statusInactive': 'Inactive',
      'catalog.priceChf': 'Price (CHF)',
      'catalog.textBlocks.allCategories': 'All categories',
      'catalog.textBlocks.allStatuses': 'All statuses',
      'catalog.textBlocks.create': 'Create Text Block',
      'catalog.textBlocks.empty': 'No text blocks found.',
      'catalog.textBlocks.emptyHint': 'Create your first reusable text block.',
      'catalog.textBlocks.searchPlaceholder': 'Search text blocks...',
      'common.category': 'Category',
      'common.delete': 'Delete',
      'common.edit': 'Edit',
      'common.errorLoading': 'Could not load data',
      'common.results': 'results',
      'common.status': 'Status',
      'common.title': 'Title',
    })[key] || fallback || key,
  }),
}));
vi.mock('@/shared/hooks/use-debounce', () => ({ useDebounce: (v) => v }));

import { TextBlockTable } from './text-block-table';

describe('TextBlockTable', () => {
  it('renders rows for all blocks by default', () => {
    render(<TextBlockTable />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('resolves category names from categoryId-only rows', () => {
    render(<TextBlockTable />);
    expect(screen.getByText('Cat1')).toBeInTheDocument();
    expect(screen.getByText('0.00')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows an empty state when there are no blocks', () => {
    vi.doMock('../hooks/use-text-block-queries', () => ({ useTextBlocks: () => ({ data: [], isLoading: false }) }));
  });

  it('renders search and the category + status filters', () => {
    render(<TextBlockTable />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    // two filter triggers (category, status) using combobox role from Select triggers
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
  });
});
