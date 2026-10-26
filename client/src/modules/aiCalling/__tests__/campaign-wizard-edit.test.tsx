// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Campaign } from '../types/ai-calling-types';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock('../hooks/use-ai-calling', () => ({
  useCampaignMutations: () => ({
    create: { isPending: false, mutateAsync: mocks.create },
    update: { isPending: false, mutateAsync: mocks.update },
  }),
  useTelephonyHealth: () => ({ data: { configured: true, livekitReady: true, reachable: true, eligible: true, reason: null } }),
  useAgentLanguages: () => ({ data: { defaultLanguage: 'en', languages: [{ code: 'en', name: 'English', nativeName: 'English', support: 'full', rtl: false }] }, isLoading: false, isError: false }),
}));
vi.mock('../hooks/use-paired-phone', () => ({ usePairedDevices: () => ({ data: [], isLoading: false }) }));
vi.mock('../ui/language-select', () => ({
  LanguageSelect: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <select aria-label="Agent language" value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="en">English</option>
    </select>
  ),
}));
vi.mock('@/shared/components/confirm-dialog', () => ({ ConfirmDialog: () => null }));

const summary = {
  total: 2, eligible: 2, ineligible: 0, queued: 0, inProgress: 0, completed: 0, answered: 0,
  noAnswer: 0, failed: 0, retryScheduled: 0, qualified: 0, unqualified: 0, callbacks: 0,
  needsReview: 0, doNotContact: 0, suppressed: 0, missingPhone: 0, totalCallSeconds: 0, actualCost: 0,
};

const editable: Campaign = {
  _id: 'campaign-edit',
  name: 'Existing outreach',
  description: 'Renewal calls',
  status: 'draft',
  questionnaireVersion: 2,
  questionnaire: { questions: [{ fieldKey: 'renewal', label: 'Renewal', text: 'Would you like to renew?', type: 'boolean', required: true, order: 1 }] },
  statusRules: [],
  agentConfig: {
    agentName: 'Maya', organizationName: 'Updata', objective: 'Confirm renewal interest.', language: 'en', voice: 'coral',
    speakingStyle: 'professional', maxCallSeconds: 300, recordCall: false, disclosure: 'I am an AI assistant calling for Updata.',
  },
  schedule: {
    timezone: 'Europe/Zurich', callWindow: { start: '09:00', end: '17:00' }, daysOfWeek: [1, 2, 3, 4, 5],
    maxConcurrency: 1, maxAttemptsPerLead: 2, maxCallsPerDay: 50,
  },
  summary,
  channel: 'voice',
  transport: 'cloud_sip',
  isTest: false,
  selection: { mode: 'explicit', leadIds: ['lead-1', 'lead-2'], selectedAt: '2026-10-25T10:00:00.000Z' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue(editable);
});

describe('CampaignWizard editing', () => {
  it('preloads a draft, locks recipient identity, and sends only supported update fields', async () => {
    const { CampaignWizard } = await import('../ui/campaign-wizard');
    const saved = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CampaignWizard campaign={editable} onClose={vi.fn()} onCreated={saved} />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Edit calling campaign')).toBeTruthy();
    expect(screen.getByDisplayValue('Existing outreach')).toBeTruthy();
    expect(screen.getByRole('radio', { name: /AI phone call/ })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(screen.getByText(/Lead selection is preserved/)).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Test campaign/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save campaign' }));

    await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
    const request = mocks.update.mock.calls[0][0];
    expect(request.id).toBe('campaign-edit');
    expect(request.input).not.toHaveProperty('selection');
    expect(request.input).not.toHaveProperty('channel');
    expect(request.input).not.toHaveProperty('isTest');
    expect(saved).toHaveBeenCalledWith('campaign-edit');
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
