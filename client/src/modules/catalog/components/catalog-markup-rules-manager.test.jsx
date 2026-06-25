// client/src/modules/catalog/components/catalog-markup-rules-manager.test.jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const rules = [
  { _id: 'r1', name: 'Global 20', scope: 'GLOBAL', priority: 100, markupPercent: 20, isActive: true },
  { _id: 'r2', name: 'Cat rule', scope: 'CATEGORY', priority: 50, marginPercent: 15, isActive: false, categoryId: { _id: 'c1', name: 'Pipes' } },
];

vi.mock('../hooks/use-catalog-queries', () => ({
  useCatalogMarkupRules: () => ({ data: { data: rules }, isLoading: false, isError: false }),
  useCatalogCategoryOptions: () => ({ data: [{ _id: 'c1', name: 'Pipes' }] }),
}));
vi.mock('../hooks/use-catalog-mutations', () => ({
  useCatalogMarkupMutations: () => ({
    createMarkup: { mutateAsync: vi.fn() },
    updateMarkup: { mutateAsync: vi.fn() },
    removeMarkup: { mutate: vi.fn() },
  }),
}));
vi.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ t: (k, d) => d || k }) }));

import { CatalogMarkupRulesManager } from './catalog-markup-rules-manager';

describe('CatalogMarkupRulesManager', () => {
  it('renders rule rows', () => {
    render(<CatalogMarkupRulesManager />);
    expect(screen.getByText('Global 20')).toBeInTheDocument();
    expect(screen.getByText('Cat rule')).toBeInTheDocument();
  });

  it('renders a search box and scope + status filters', () => {
    render(<CatalogMarkupRulesManager />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
  });
});
