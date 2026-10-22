// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const api = {
  analytics: vi.fn(async () => ({
    campaignId: 'c1', sessions: 2,
    funnel: { link_issued: 2, sms_sent: 2, delivered: 1, link_opened: 2, chat_started: 2, completed: 1, opted_out: 0 },
    rates: { openRate: 100, startRate: 100, completionRate: 50, optOutRate: 0 },
    perQuestion: [{ fieldKey: 'bill', label: 'Monthly bill', answered: 1, unknown: 1, dropOff: 1, unknownRate: 50 }],
    averageCompletionSeconds: 150, cost: { total: 0.0004, perCompleted: 0.0004 },
  })),
  sessions: vi.fn(async () => ({
    data: [{ id: 's1', campaignId: 'c1', leadId: 'l1', leadName: 'Bilal Traders', callId: 'x', callRecordId: 'r1', status: 'active', outcome: null, language: 'roman_ur', turns: 4, funnel: {}, isTest: false, reminders: { sent: 0, lastSentAt: null }, usage: { cost: 0, modelCalls: 0 }, expiresAt: '', lastActivityAt: '2026-10-22T10:00:00Z', createdAt: '', closedAt: null }],
    pagination: { page: 1, limit: 50, total: 1, pages: 1 },
  })),
  session: vi.fn(async () => ({
    id: 's1', leadName: 'Bilal Traders', status: 'active', language: 'roman_ur', turns: 4, callRecordId: 'r1',
    answers: [{ fieldKey: 'bill', label: 'Monthly bill', value: 18500, validation: 'valid', confirmed: false, unknown: false }],
    transcript: [{ role: 'assistant', text: 'Assalam o Alaikum!', at: '1', source: 'template' }, { role: 'customer', text: 'ji', at: '2', source: 'customer' }],
    disposition: null, qualification: null, reviewRequired: false, openQuestions: [{ text: 'price kya hai?', at: '3' }],
  })),
  revoke: vi.fn(async () => ({ revoked: true })),
  preview: vi.fn(async () => ({ url: 'https://upd.example/c/AAAA', sessionId: 'p1' })),
  exportCsv: vi.fn(),
};
vi.mock('../services/link-assistant-api', () => ({ linkAssistantApi: api }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('../ui/call-review-drawer', () => ({ CallReviewDrawer: () => null }));

const { LinkAssistantPanel } = await import('../ui/link-assistant-panel');

const renderPanel = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <LinkAssistantPanel campaignId="c1" />
  </QueryClientProvider>,
);

describe('LinkAssistantPanel', () => {
  it('shows the funnel, per-question quality and live conversations', async () => {
    renderPanel();
    expect(await screen.findByText('Completion rate')).toBeTruthy();
    expect(screen.getAllByText('50%')).toHaveLength(2); // completion rate + unknown rate
    expect(screen.getByText('Monthly bill')).toBeTruthy();
    expect(await screen.findByText('Bilal Traders')).toBeTruthy();
  });

  it('opens a transcript with answers and questions for the team; revokes the link', async () => {
    renderPanel();
    fireEvent.click(await screen.findByText('Bilal Traders'));
    expect(await screen.findByText('18500')).toBeTruthy();
    expect(screen.getByText('price kya hai?')).toBeTruthy();
    expect(screen.getByText('Assalam o Alaikum!')).toBeTruthy();
    fireEvent.click(screen.getByText('Revoke link'));
    await waitFor(() => expect(api.revoke).toHaveBeenCalledWith('s1'));
  });

  it('"Preview as customer" opens the real page in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderPanel();
    fireEvent.click(screen.getByText('Preview as customer'));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://upd.example/c/AAAA', '_blank', 'noopener,noreferrer'));
  });
});
