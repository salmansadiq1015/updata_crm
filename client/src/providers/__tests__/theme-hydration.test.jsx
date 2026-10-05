import { render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../theme-provider';
import { FullPageSpinner } from '@/shared/components/loading-spinner';

describe('theme and loading hydration safeguards', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses a non-executable next-themes script during client renders', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(
      <ThemeProvider>
        <div>Application</div>
      </ThemeProvider>,
    );

    expect(container.querySelector('script')).toHaveAttribute('type', 'application/json');
    expect(consoleError).not.toHaveBeenCalledWith(
      expect.stringContaining('Encountered a script tag while rendering React component'),
    );
  });

  it('protects loader text from browser translation before hydration', () => {
    render(<FullPageSpinner />);

    const loader = screen.getByRole('status');
    expect(loader).toHaveAttribute('translate', 'no');
    expect(loader).toHaveAttribute('data-no-translation', 'true');
    expect(loader).toHaveClass('notranslate');
    expect(screen.getByText('Updata ERP')).toBeInTheDocument();
  });
});
