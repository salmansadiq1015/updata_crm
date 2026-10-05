import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '@/lib/i18n/language-context';
import { ResultPagination } from '../ui/result-pagination';

function renderPagination(overrides: Partial<React.ComponentProps<typeof ResultPagination>> = {}) {
  const props: React.ComponentProps<typeof ResultPagination> = {
    pageIndex: 0,
    pageSize: 50,
    total: 2333,
    loadedPages: 1,
    hasNextPage: true,
    onFirst: vi.fn(),
    onPrevious: vi.fn(),
    onNext: vi.fn(),
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
  it('shows an exact range and total page count for large result sets', () => {
    renderPagination();
    expect(screen.getByText(/1.*50.*2,333|1.*50.*2333/)).toBeInTheDocument();
    expect(screen.getByText(/page 1 of 47/i)).toBeInTheDocument();
  });

  it('fetches only when the user requests the next page', () => {
    const props = renderPagination();
    expect(props.onNext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /next page/i }));
    expect(props.onNext).toHaveBeenCalledTimes(1);
  });

  it('disables navigation while a cursor page is loading', () => {
    renderPagination({ pageIndex: 1, loadedPages: 2, isFetching: true });
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled();
  });

  it('offers one explicit retry after a failed next page', () => {
    const retry = vi.fn();
    renderPagination({ isError: true, onRetry: retry });
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
