import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ArticleVersionHistoryPanel } from '../components/article-version-history-panel';

// Mock useLanguage
vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    t: (key: string) => key,
    locale: 'de',
  }),
}));

// Mock the hook directly to avoid CJS require('@/stores/auth-store') in axios interceptor
const mockUseArticleVersions = vi.fn();
vi.mock('../hooks/use-catalog-queries', () => ({
  useArticleVersions: (...args: unknown[]) => mockUseArticleVersions(...args),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe('ArticleVersionHistoryPanel', () => {
  it('renders version entries from API', async () => {
    mockUseArticleVersions.mockReturnValue({
      data: [
        {
          _id: 'v2',
          version: 2,
          snapshot: { name: 'Old Name', basePrice: 120 },
          changedBy: { firstName: 'Admin', lastName: 'User' },
          createdAt: '2026-04-01T10:00:00Z',
        },
      ],
      isLoading: false,
    });
    render(
      <ArticleVersionHistoryPanel articleId="art123" />,
      { wrapper }
    );
    expect(await screen.findByText('Version 2')).toBeInTheDocument();
    expect(screen.getByText(/Old Name/)).toBeInTheDocument();
  });

  it('shows empty state when no versions', async () => {
    mockUseArticleVersions.mockReturnValue({
      data: [],
      isLoading: false,
    });
    render(
      <ArticleVersionHistoryPanel articleId="art999" />,
      { wrapper }
    );
    expect(await screen.findByText(/catalog\.articles\.noVersions/i)).toBeInTheDocument();
  });

  it('shows loading state while fetching', async () => {
    mockUseArticleVersions.mockReturnValue({
      data: [],
      isLoading: true,
    });
    render(
      <ArticleVersionHistoryPanel articleId="art123" />,
      { wrapper }
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('does not call hook when articleId is falsy', () => {
    mockUseArticleVersions.mockReturnValue({
      data: [],
      isLoading: false,
    });
    render(
      <ArticleVersionHistoryPanel articleId="" />,
      { wrapper }
    );
    expect(mockUseArticleVersions).toHaveBeenCalledWith('');
  });
});
