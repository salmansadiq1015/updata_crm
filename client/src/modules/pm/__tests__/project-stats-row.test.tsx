import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

vi.mock('../services/project-service', () => ({
  projectService: {
    getDashboardSummary: vi.fn().mockResolvedValue({
      total: 10,
      byStatus: { DRAFT: 2, PLANNING: 3, IN_PROGRESS: 1, ON_HOLD: 4, COMPLETED: 5 },
      risk: { overdue: 0 },
      upcomingMilestones: 0,
    }),
  },
}));

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ t: (_k: string, fallback: string) => fallback, language: 'en' }),
}));

import { ProjectStatsRow } from '../components/project-stats-row';

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, {
    client: new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  }, children);

describe('ProjectStatsRow status breakdown (PROJ-007 AC-1)', () => {
  it('renders a count for every lifecycle status', async () => {
    render(React.createElement(ProjectStatsRow), { wrapper });

    // The four headline KPI cards keep working
    await screen.findByText('Total Projects');

    // Per-status breakdown: each status label + its count is shown
    for (const label of ['Draft', 'Planning', 'On Hold', 'Completed']) {
      expect(await screen.findByText(label)).toBeInTheDocument();
    }
    // counts present (Draft=2, On Hold=4, Completed=5)
    await waitFor(() => {
      expect(screen.getByTestId('status-count-DRAFT')).toHaveTextContent('2');
      expect(screen.getByTestId('status-count-ON_HOLD')).toHaveTextContent('4');
      expect(screen.getByTestId('status-count-COMPLETED')).toHaveTextContent('5');
    });
  });
});
