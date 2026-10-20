// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { SimCallCampaign, SimCallTask } from '../types/sim-call-types';

vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('@/modules/leads/services/lead-api', () => ({
  leadApi: { listLeads: vi.fn(async () => ({ data: [{ id: 'l1', name: 'Acme AG', mobile: '+41790000000', phone: null }], pagination: {} })) },
}));
const api = {
  list: vi.fn(), get: vi.fn(), create: vi.fn(), action: vi.fn(), retry: vi.fn(), tasks: vi.fn(), events: vi.fn(),
  retrySync: vi.fn(), reschedule: vi.fn(), cancelCallback: vi.fn(), callbacks: vi.fn(),
};
vi.mock('../services/sim-calls-api', () => ({ simCallsApi: api }));

const { SimCallsWorkspace } = await import('../ui/sim-calls-workspace');
const { SimCallCampaignDetail } = await import('../ui/sim-call-campaign-detail');

const summary = { total: 4, pending: 1, inProgress: 0, scheduled: 1, needsReview: 1, completed: 2, skipped: 0, ineligible: 0, cancelled: 0, answered: 1, noAnswer: 1, busy: 0, rejected: 0, callbacks: 1, callbacksDue: 0, wrongNumber: 0, failed: 0, syncFailed: 1, attempts: 3 };
const campaign = (status: SimCallCampaign['status']): SimCallCampaign => ({
  _id: 'c1', name: 'Garage outreach', description: '', status, instructions: '', questionsVersion: 1,
  questionnaire: { questions: [{ fieldKey: 'interest', label: 'Interest', text: 'How interested?', type: 'single_choice', required: true, order: 1, options: ['high', 'low'] }] },
  settings: { timezone: 'Asia/Karachi', callWindow: { start: '09:00', end: '19:00' }, daysOfWeek: [1, 2, 3, 4, 5], countdownSeconds: 10, autoDial: false, maxAttempts: 2, retryDelayMinutes: 60, readAloud: true },
  subscriptionId: null, startsAt: null, summary, lastActivityAt: new Date().toISOString(), createdAt: new Date().toISOString(),
});
const task: SimCallTask = {
  id: 't1', campaignId: 'c1', leadId: 'l1', lead: { id: 'l1', name: 'Acme AG', leadNumber: null, contactName: null, status: 'new', city: 'Bern' },
  state: 'completed', outcome: 'answered', notBefore: null, destinationMasked: '•••• 0000', eligibility: { eligible: true, reasons: [] }, attemptCount: 1,
  answers: [{ fieldKey: 'interest', status: 'answered', value: 'high', normalizedValue: 'high' }], callback: null,
  attempts: [{ attemptId: 'a1', dialedAt: new Date().toISOString(), outcome: 'answered', interest: 'interested', evidence: 'call_state', offhookDurationSec: 61, durationSec: null, notes: 'Wants a demo', transcript: '', completedAt: new Date().toISOString(), sync: { status: 'failed', error: 'CRM down' } }],
};
const cbTask: SimCallTask = { ...task, id: 't2', state: 'scheduled', outcome: 'callback_requested', callback: { at: new Date(Date.now() + 86400000).toISOString(), timezone: 'Asia/Karachi', reason: 'In a meeting', status: 'pending' }, overdue: false };
const page = <T,>(data: T[]) => ({ data, pagination: { page: 1, limit: 50, total: data.length, pages: 1 } });

function wrap(ui: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  cleanup();
  Object.values(api).forEach((fn) => fn.mockReset());
  api.events.mockResolvedValue(page([{ _id: 'e1', type: 'task.completed', at: new Date().toISOString(), leadId: { name: 'Acme AG' } }]));
  api.tasks.mockImplementation(async (_id: string, params: { state?: string }) => page(params.state === 'scheduled' ? [cbTask] : [task]));
});

describe('SIM call campaigns (web)', () => {
  it('lists server campaigns with progress and opens the detail', async () => {
    api.list.mockResolvedValue(page([campaign('running')]));
    api.callbacks.mockResolvedValue(page([]));
    api.get.mockResolvedValue(campaign('running'));
    wrap(<SimCallsWorkspace />);
    expect(await screen.findByText('Garage outreach')).toBeTruthy();
    expect(screen.getByText('2/4 (50%)')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'paused' } });
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'paused' })));
  });

  it('shows only the valid actions and the answers, notes and sync state of each lead', async () => {
    api.get.mockResolvedValue(campaign('running'));
    wrap(<SimCallCampaignDetail campaignId="c1" onClose={() => {}} />);
    expect(await screen.findByText('Pause')).toBeTruthy();
    expect(screen.queryByText('Start')).toBeNull();
    expect(screen.queryByText('Resume')).toBeNull();
    expect(screen.getByText(/CRM sync failed for 1 call/)).toBeTruthy();
    fireEvent.click(await screen.findByText('Acme AG'));
    expect(screen.getByText('high')).toBeTruthy();
    expect(screen.getByText('Notes: Wants a demo')).toBeTruthy();
    expect(screen.getByText(/61s off-hook \(not talk time\)/)).toBeTruthy();
    api.retrySync.mockResolvedValue(task);
    fireEvent.click(screen.getByText('Retry CRM sync'));
    await waitFor(() => expect(api.retrySync).toHaveBeenCalledWith('t1'));
    api.action.mockResolvedValue(campaign('paused'));
    fireEvent.click(screen.getByText('Pause'));
    await waitFor(() => expect(api.action).toHaveBeenCalledWith('c1', 'pause'));
  });

  it('a draft can be started; a cancelled campaign offers no actions', async () => {
    api.get.mockResolvedValueOnce(campaign('draft'));
    const { unmount } = wrap(<SimCallCampaignDetail campaignId="c1" onClose={() => {}} />);
    expect(await screen.findByText('Start')).toBeTruthy();
    unmount();
    api.get.mockResolvedValueOnce(campaign('cancelled'));
    wrap(<SimCallCampaignDetail campaignId="c1" onClose={() => {}} />);
    await screen.findByText('Garage outreach');
    for (const label of ['Start', 'Resume', 'Pause', 'Cancel', 'Retry unreached']) expect(screen.queryByText(label)).toBeNull();
  });

  it('reschedules a callback in an explicit timezone and rejects past times', async () => {
    api.get.mockResolvedValue(campaign('running'));
    wrap(<SimCallCampaignDetail campaignId="c1" onClose={() => {}} />);
    fireEvent.click(await screen.findByText('Callbacks (1)'));
    expect(await screen.findByText('In a meeting')).toBeTruthy();
    fireEvent.click(screen.getByText('Reschedule'));
    const local = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    fireEvent.change(local, { target: { value: '2020-01-01T10:00' } });
    fireEvent.click(screen.getByText('Save'));
    expect(await screen.findByText('That time is in the past.')).toBeTruthy();
    fireEvent.change(local, { target: { value: '2099-01-02T10:00' } });
    api.reschedule.mockResolvedValue(cbTask);
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(api.reschedule).toHaveBeenCalledWith('t2', { at: '2099-01-02T05:00:00.000Z', timezone: 'Asia/Karachi' }));
  });

  it('validates the create form before saving to the server', async () => {
    api.list.mockResolvedValue(page([]));
    api.callbacks.mockResolvedValue(page([]));
    wrap(<SimCallsWorkspace />);
    fireEvent.click(await screen.findByText('New campaign'));
    fireEvent.click(screen.getByText('Create campaign'));
    expect(await screen.findByText('Enter a campaign name.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Campaign name'), { target: { value: 'Q4 garages' } });
    fireEvent.click(screen.getByText('Create campaign'));
    expect(await screen.findByText('Select at least one lead.')).toBeTruthy();
    fireEvent.click(await screen.findByText('Acme AG'));
    api.create.mockResolvedValue(campaign('draft'));
    api.get.mockResolvedValue(campaign('draft'));
    fireEvent.click(screen.getByText('Create campaign'));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    const input = api.create.mock.calls[0]![0];
    expect(input).toMatchObject({ name: 'Q4 garages', leadIds: ['l1'] });
    expect(input.questionnaire.questions[2].condition).toEqual({ all: [{ field: 'interest', in: ['high', 'medium'] }] });
  });
});
