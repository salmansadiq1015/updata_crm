import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { TablePagination } from './table-pagination';
import { LanguageProvider } from '@/lib/i18n/language-context';

vi.mock('@/lib/i18n/language-context', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useLanguage: () => ({ t: (key, fallback) => fallback ?? key }),
  };
});

describe('TablePagination', () => {
  const renderWithProvider = (component) => {
    return render(<LanguageProvider>{component}</LanguageProvider>);
  };

  it('shows the current range and total', () => {
    renderWithProvider(<TablePagination page={1} pageSize={10} total={42} onPageChange={() => {}} />);
    expect(screen.getByText(/1.*10.*42/)).toBeInTheDocument();
  });

  it('renders nothing when total fits one page', () => {
    const { container } = renderWithProvider(
      <TablePagination page={1} pageSize={10} total={8} onPageChange={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('advances to the next page', () => {
    const onPageChange = vi.fn();
    renderWithProvider(<TablePagination page={1} pageSize={10} total={42} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('does not go past the last page', () => {
    const onPageChange = vi.fn();
    renderWithProvider(<TablePagination page={5} pageSize={10} total={42} onPageChange={onPageChange} />);
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onPageChange).not.toHaveBeenCalled();
  });
});
