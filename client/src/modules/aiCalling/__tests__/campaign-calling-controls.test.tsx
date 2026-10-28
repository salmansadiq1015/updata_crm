// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '@/lib/i18n/language-context';
import type { Campaign } from '../types/ai-calling-types';

const mocks = vi.hoisted(() => ({ getCampaign: vi.fn(), runStatus: vi.fn(), start: vi.fn(), resume: vi.fn(), pause: vi.fn(), activeCalls: vi.fn(), write: true }));
vi.mock('../services/ai-calling-api', () => ({ aiCallingApi: mocks }));
vi.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: () => ({ isAdmin: false, hasPermission: () => mocks.write }) }));
vi.mock('../hooks/use-ai-calling-realtime', () => ({ useAiCallingRealtime() {} }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('../ui/simulate-console', () => ({ SimulateConsole: () => <p>Simulation only</p> }));
vi.mock('../ui/web-call-console', () => ({ WebCallConsole: () => null }));
vi.mock('../ui/call-review-drawer', () => ({ CallReviewDrawer: () => null }));
vi.mock('../ui/link-assistant-panel', () => ({ LinkAssistantPanel: () => null }));

const { CampaignDetailDrawer } = await import('../ui/campaign-detail-drawer');
let campaign: Campaign;
beforeEach(() => {
  vi.clearAllMocks(); mocks.write = true;
  campaign = {
    _id: 'campaign-1', name: 'Customer follow-up', status: 'paused', transport: 'paired_phone', isTest: true,
    questionnaireVersion: 1, questionnaire: { questions: [] }, statusRules: [], agentConfig: { agentName: 'Salman' },
    schedule: { timezone: 'Asia/Karachi', callWindow: { start: '09:00', end: '18:00' }, maxConcurrency: 1 },
    summary: { total: 2, eligible: 2, ineligible: 0, queued: 2, inProgress: 0, completed: 0, answered: 0, noAnswer: 0, failed: 0, retryScheduled: 0, qualified: 0, unqualified: 0, callbacks: 0, needsReview: 0, doNotContact: 0, suppressed: 0, missingPhone: 0, totalCallSeconds: 0, actualCost: 0 },
  };
  mocks.getCampaign.mockImplementation(async () => campaign);
  mocks.runStatus.mockImplementation(async () => ({ status: campaign.status, pending: 2, inProgress: 0, canStart: true, blockers: [], waits: [], nextAt: null }));
  mocks.activeCalls.mockResolvedValue([]);
  mocks.start.mockImplementation(async () => { campaign = { ...campaign, status: 'running' }; return campaign; });
  mocks.resume.mockImplementation(async () => { campaign = { ...campaign, status: 'running' }; return campaign; });
  mocks.pause.mockImplementation(async () => { campaign = { ...campaign, status: 'paused' }; return campaign; });
});
function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<LanguageProvider initialLocale="en"><QueryClientProvider client={client}><CampaignDetailDrawer campaignId="campaign-1" onClose={() => {}} /></QueryClientProvider></LanguageProvider>);
  return client;
}

describe('campaign calling controls', () => {
  it('keeps Start calling visible on Simulate and prevents duplicate starts before showing Pause', async () => {
    let release: (value: Campaign) => void = () => {};
    mocks.resume.mockImplementation(() => new Promise<Campaign>(resolve => { release = resolve; }));
    const client = open();
    fireEvent.click(await screen.findByRole('tab', { name: 'Simulate' }));
    expect(screen.getByRole('region', { name: 'Campaign calling status' })).toBeTruthy();
    const start = screen.getByRole('button', { name: 'Start calling' });
    fireEvent.click(start);
    await waitFor(() => expect(start).toBeDisabled());
    fireEvent.click(start);
    expect(mocks.resume).toHaveBeenCalledTimes(1);
    campaign = { ...campaign, status: 'running' }; release(campaign);
    expect(await screen.findByRole('button', { name: 'Pause calling' })).toBeTruthy();
    expect((client.getQueryData(['ai-calling', 'campaign', 'campaign-1']) as Campaign).status).toBe('running');
    fireEvent.click(screen.getByRole('button', { name: 'Pause calling' }));
    expect(await screen.findByRole('button', { name: 'Start calling' })).toBeTruthy();
    expect(mocks.pause).toHaveBeenCalledWith('campaign-1');
  });

  it('shows a failed start honestly and keeps the campaign paused', async () => {
    mocks.resume.mockRejectedValue(new Error('The calling service is offline.'));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Start calling' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('The calling service is offline.');
    expect(screen.getByText(/^paused$/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Pause calling' })).toBeNull();
  });

  it('explains a calling-hours wait on every tab and never places a call just by viewing it', async () => {
    campaign = { ...campaign, status: 'running' };
    mocks.runStatus.mockResolvedValue({ status: 'running', pending: 2, inProgress: 0, canStart: false, blockers: [], waits: [{ code: 'calling_hours', message: 'Waiting for the campaign’s calling hours.' }], nextAt: '2026-10-28T04:00:00Z' });
    open();
    expect(await screen.findByText('Waiting for the campaign’s calling hours.')).toBeTruthy();
    expect(screen.getByText(/Next permitted opening:/)).toHaveTextContent('Asia/Karachi');
    expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.resume).not.toHaveBeenCalled();
  });

  it('does not allow a read-only user to start or pause calling', async () => {
    mocks.write = false;
    open();
    expect(await screen.findByRole('button', { name: 'Start calling' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Start calling' }));
    expect(mocks.resume).not.toHaveBeenCalled();
  });

  it('explains and disables Start when no eligible recipients are waiting', async () => {
    mocks.runStatus.mockResolvedValue({ status: 'paused', pending: 0, inProgress: 0, canStart: false, blockers: [{ code: 'no_pending_leads', message: 'No eligible leads are waiting. Check Recipients.' }], waits: [], nextAt: null });
    open();
    expect(await screen.findByText('No eligible leads are waiting. Check Recipients.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start calling' })).toBeDisabled();
    expect(mocks.resume).not.toHaveBeenCalled();
  });

  it('keeps scheduled calling separate from the immediate Start control', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Start on schedule' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith('campaign-1', null, false));
  });

  it('does not show stale calling-hours waits for an immediate run', async () => {
    campaign = { ...campaign, status: 'running', runMode: 'immediate' };
    mocks.runStatus.mockResolvedValue({ status: 'running', pending: 2, inProgress: 0, canStart: false, blockers: [], waits: [{ code: 'calling_hours', message: 'Stale hours warning' }], nextAt: '2026-10-28T04:00:00Z' });
    open();
    expect(await screen.findByText(/no waiting for calling hours/)).toBeTruthy();
    expect(screen.queryByText('Stale hours warning')).toBeNull();
    expect(screen.queryByText(/Next permitted opening:/)).toBeNull();
  });

  it('lets an existing agent campaign switch its waiting queue to immediate calling', async () => {
    campaign = { ...campaign, agentId: 'agent-1', status: 'running', runMode: 'immediate', waitReason: 'calling_hours' };
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Start calling now' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith('campaign-1', null, true));
    expect(mocks.resume).not.toHaveBeenCalled();
  });
});
