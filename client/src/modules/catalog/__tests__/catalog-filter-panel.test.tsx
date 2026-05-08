import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CatalogFilterPanel } from '../components/catalog-filter-panel';

// Mock useLanguage
vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ t: (key: string) => key, locale: 'de' }),
}));

// Mock useArticleFacets to avoid HTTP setup complexity
vi.mock('../hooks/use-catalog-queries', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/use-catalog-queries')>();
  return {
    ...actual,
    useArticleFacets: () => ({
      data: {
        types: [{ value: 'MATERIAL', count: 8 }, { value: 'SERVICE', count: 2 }],
        statuses: [{ value: 'ACTIVE', count: 9 }, { value: 'INACTIVE', count: 1 }],
        sources: [{ value: 'INTERNAL', count: 7 }, { value: 'IGH', count: 3 }],
        priceRange: { min: 10, max: 5000 },
        total: 10,
      },
      isLoading: false,
    }),
  };
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe('CatalogFilterPanel', () => {
  it('renders type facets with counts', () => {
    render(
      <CatalogFilterPanel filters={{}} onFiltersChange={() => {}} />,
      { wrapper }
    );
    expect(screen.getByText('MATERIAL')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('calls onFiltersChange when a type badge is clicked', () => {
    const onChange = vi.fn();
    render(
      <CatalogFilterPanel filters={{}} onFiltersChange={onChange} />,
      { wrapper }
    );
    fireEvent.click(screen.getByText('MATERIAL'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'MATERIAL' }));
  });

  it('shows reset button only when filters are active', () => {
    render(
      <CatalogFilterPanel filters={{ type: 'MATERIAL' }} onFiltersChange={() => {}} />,
      { wrapper }
    );
    expect(screen.getByText(/catalog\.filter\.reset/i)).toBeInTheDocument();
  });

  it('does NOT show reset button when no filters are active', () => {
    render(
      <CatalogFilterPanel filters={{}} onFiltersChange={() => {}} />,
      { wrapper }
    );
    expect(screen.queryByText(/catalog\.filter\.reset/i)).not.toBeInTheDocument();
  });
});
