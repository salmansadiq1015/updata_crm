import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { JobsViewer } from './jobs-viewer';
import { useSystemJobs } from '../hooks/use-platform-queries';

vi.mock('../hooks/use-platform-queries', () => ({
  useSystemJobs: vi.fn(),
}));

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

const mockedUseSystemJobs = vi.mocked(useSystemJobs);

describe('JobsViewer', () => {
  it('renders queue stats with stable row keys', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockedUseSystemJobs.mockReturnValue({
      data: {
        data: [
          { name: 'auth-email', waiting: 1, active: 0, completed: 12, failed: 0, delayed: 2 },
          { name: 'audit-log', waiting: 0, active: 1, completed: 30, failed: 1, delayed: 0 },
        ],
      },
      error: null,
      isError: false,
      isLoading: false,
    } as ReturnType<typeof useSystemJobs>);

    try {
      render(<JobsViewer />);

      expect(screen.getByText('auth-email')).toBeInTheDocument();
      expect(screen.getByText('audit-log')).toBeInTheDocument();
      expect(consoleError).not.toHaveBeenCalledWith(
        expect.stringContaining('Each child in a list should have a unique "key" prop'),
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
