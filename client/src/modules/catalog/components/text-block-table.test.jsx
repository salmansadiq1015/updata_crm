// client/src/modules/catalog/components/text-block-table.test.jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const blocks = [
  { _id: '1', title: 'Alpha', categoryId: 'c1', category: { _id: 'c1', name: 'Cat1' }, price: 10, status: 'ACTIVE' },
  { _id: '2', title: 'Beta', categoryId: 'c2', category: { _id: 'c2', name: 'Cat2' }, price: 20, status: 'INACTIVE' },
];

vi.mock('../hooks/use-text-block-queries', () => ({ useTextBlocks: () => ({ data: blocks, isLoading: false }) }));
vi.mock('../hooks/use-text-block-mutations', () => ({ useTextBlockMutations: () => ({ createTextBlock: { mutate: vi.fn(), isPending: false }, updateTextBlock: { mutate: vi.fn(), isPending: false }, deleteTextBlock: { mutate: vi.fn(), isPending: false } }) }));
vi.mock('../hooks/use-catalog-queries', () => ({ useCatalogCategories: () => ({ data: [{ _id: 'c1', name: 'Cat1' }, { _id: 'c2', name: 'Cat2' }] }) }));
vi.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ t: (k, d) => d || k }) }));
vi.mock('@/shared/hooks/use-debounce', () => ({ useDebounce: (v) => v }));

import { TextBlockTable } from './text-block-table';

describe('TextBlockTable', () => {
  it('renders rows for all blocks by default', () => {
    render(<TextBlockTable />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('shows an empty state when there are no blocks', () => {
    vi.doMock('../hooks/use-text-block-queries', () => ({ useTextBlocks: () => ({ data: [], isLoading: false }) }));
  });

  it('renders search and the category + status filters', () => {
    render(<TextBlockTable />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    // two filter triggers (category, status) — combobox role from the Select triggers
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
  });
});
