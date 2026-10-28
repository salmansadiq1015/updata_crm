// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Campaign } from '../types/ai-calling-types';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  listLeads: vi.fn(),
  recipients: [
    { _id: 'r1', state: 'draft', attemptCount: 0, eligibility: { eligible: true, reasons: [] }, phoneSnapshot: '+41791234561', leadId: { name: 'Lead One', leadNumber: 'L-1', mobile: '+41791234561', phone: null } },
    { _id: 'r2', state: 'ineligible', attemptCount: 0, eligibility: { eligible: false, reasons: ['consent_required'] }, phoneSnapshot: '+41791234562', leadId: { _id: 'lead-2', name: 'Lead Two', leadNumber: 'L-2', mobile: '+41791234562', phone: null } },
  ],
  preview: { total: 2, found: 2, unavailable: 0, eligible: 2, reasonCounts: {}, leads: [] },
}));

vi.mock('@/modules/leads/services/lead-api', () => ({
  leadApi: { listLeads: mocks.listLeads, getLead: vi.fn() },
}));

vi.mock('../hooks/use-ai-calling', () => ({
  useCampaignMutations: () => ({
    create: { isPending: false, mutateAsync: mocks.create },
    update: { isPending: false, mutateAsync: mocks.update },
  }),
  useTelephonyHealth: () => ({ data: { configured: true, livekitReady: true, reachable: true, eligible: true, reason: null } }),
  useAgentLanguages: () => ({ data: { defaultLanguage: 'en', languages: [{ code: 'en', name: 'English', nativeName: 'English', support: 'full', rtl: false }] }, isLoading: false, isError: false }),
  useRecipients: () => ({ data: { data: mocks.recipients, pagination: { total: mocks.recipients.length, pages: 1 } }, isLoading: false, isError: false, refetch: vi.fn() }),
  usePreviewEligibility: () => ({ data: mocks.preview, isLoading: false, isError: false }),
  useRemoveRecipients: () => ({ mutate: vi.fn(), isPending: false }),
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
    expect(screen.getByText('Lead One')).toBeTruthy();
    expect(screen.getByText(/2 recipients enrolled/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Call consent not recorded . record consent/ }).getAttribute('href')).toBe('/leads?detail=lead-2');
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

  it('creates a campaign from leads picked in the list (explicit ids, no filters)', async () => {
    const lead = (id: string, name: string) => ({
      id, name, status: 'new', phone: '+923001234567', mobile: null, tags: [], source: 'manual',
      address: { street: null, addressSupplement: null, area: null, postalCode: null, city: 'Lahore', canton: null, region: null, country: 'PK', formatted: null },
      sourceMetadata: { businessType: 'restaurant' }, providerMeta: {},
    });
    mocks.listLeads.mockResolvedValue({ data: [lead('6ae0c32d329ce14e6f8246b1', 'Cafe One'), lead('6ae0c32d329ce14e6f8246b2', 'Cafe Two')], pagination: { hasNext: false, nextCursor: null, limit: 50, total: 2 } });
    mocks.create.mockResolvedValue({ _id: 'campaign-new' });
    const { CampaignWizard } = await import('../ui/campaign-wizard');
    const saved = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <CampaignWizard onClose={vi.fn()} onCreated={saved} />
      </QueryClientProvider>,
    );
    const field = (label: string) => screen.getByText(label).closest('label')!.querySelector('input')!;
    fireEvent.change(field('Campaign name'), { target: { value: 'Lahore cafes' } });
    fireEvent.change(field('Company name (disclosed)'), { target: { value: 'Updata' } });
    fireEvent.change(field('Call objective'), { target: { value: 'Qualify interest.' } });
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.change(screen.getByLabelText('Question 1 label'), { target: { value: 'Interest' } });
    fireEvent.change(screen.getByLabelText('Question 1 text'), { target: { value: 'Are you interested?' } });
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));

    // No lead picked yet: the step explains instead of moving on.
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    expect(await screen.findByText('Select at least one lead to call.')).toBeTruthy();

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Cafe Two' }));
    expect(screen.getByText('1 / 500 selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create draft campaign' }));

    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce());
    expect(mocks.create.mock.calls[0][0].selection).toEqual({ mode: 'explicit', leadIds: ['6ae0c32d329ce14e6f8246b2'] });
    expect(saved).toHaveBeenCalledWith('campaign-new');
  });
});
