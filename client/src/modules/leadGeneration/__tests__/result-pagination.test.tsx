import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/lib/i18n/language-context';
import { ResultPagination } from '../ui/result-pagination';

function renderPagination(overrides: Partial<React.ComponentProps<typeof ResultPagination>> = {}) {
  const props: React.ComponentProps<typeof ResultPagination> = {
    pageSize: 500,
    total: 2333,
    loadedCount: 500,
    hasNextPage: true,
    onLoadMore: vi.fn(),
    onPageSizeChange: vi.fn(),
    ...overrides,
  };
  render(
    <LanguageProvider>
      <ResultPagination {...props} />
    </LanguageProvider>,
  );
  return props;
}

describe('ResultPagination', () => {
  it('shows the loaded result count for large result sets', () => {
    renderPagination();
    expect(screen.getByText(/showing 500 of 2,333|showing 500 of 2333/i)).toBeInTheDocument();
  });

  it('fetches only when the user requests more results', () => {
    const props = renderPagination();
    expect(props.onLoadMore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /load more results/i }));
    expect(props.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('disables loading while a cursor page is loading', () => {
    renderPagination({ isFetching: true });
    expect(screen.getByRole('button', { name: /load more results/i })).toBeDisabled();
  });

  it('offers one explicit retry after a failed next page', () => {
    const retry = vi.fn();
    renderPagination({ isError: true, onRetry: retry });
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
