// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LanguageProvider } from '@/lib/i18n/language-context';
import type { IntelligentCallRecord, TransferOffer } from '../types/calling-intelligence-types';

const mocks = vi.hoisted(() => ({
  socketHandlers: new Map<string, (payload: unknown) => void>(),
  api: {
    decide: vi.fn(async () => ({ itemId: 'i2', status: 'user_accepted', leadWrite: { status: 'applied' }, leadFieldUnchanged: false })),
    rerun: vi.fn(async () => ({ status: 'ok' })),
    offers: vi.fn(async () => [] as unknown[]),
    accept: vi.fn(async () => ({ status: 'accepted', mode: 'phone' })),
    decline: vi.fn(async () => ({ declined: true })),
    joined: vi.fn(async () => ({ acknowledged: true })),
  },
}));
vi.mock('../services/calling-intelligence-api', () => ({ callingIntelligenceApi: mocks.api }));
vi.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: () => ({ isAdmin: false, hasPermission: () => true }) }));
vi.mock('@/lib/socket/client', () => ({
  onSocketConnect: (fn: (socket: unknown) => void) => {
    fn({ on: (event: string, handler: (p: unknown) => void) => mocks.socketHandlers.set(event, handler), off: () => {} });
    return () => {};
  },
}));

const { TranscriptWithIntelligence } = await import('../ui/call-intelligence-panel');
const { IncomingTransferHost } = await import('../ui/incoming-transfer-host');

const wrap = (ui: ReactNode) => render(
  <LanguageProvider initialLocale="en"><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider></LanguageProvider>,
);
const at = (s: number) => new Date(Date.UTC(2026, 9, 29, 10, 0, s)).toISOString();

const call = {
  _id: 'rec1', internalCallId: 'call_1', attemptNumber: 1, state: 'completed', disposition: 'answered_partial', qualification: null,
  durationSeconds: 60, answers: [], reviewRequired: false, endedAt: at(60),
  transcript: [
    { itemId: 'a0', role: 'assistant', text: 'Our starter plan is 39,000 PKR.', at: at(0) },
    { itemId: 'c1', role: 'customer', text: 'Mera budget 50000 hai, lekin price zyada hai.', at: at(5) },
    { itemId: 'c2', role: 'customer', text: 'Faisla mere partner karte hain.', at: at(9) },
  ],
  knowledge: { version: 3, mode: 'pinned' },
  intelligence: {
    version: 1, status: 'partial', pendingReview: 1, rejected: [{ category: 'timeline', quote: 'x', turnIndex: 1, reason: 'quote_not_in_turn' }],
    complianceFlags: [{ kind: 'unapproved_price', turnIndex: 0, quote: '39,000 PKR', detail: 'Amount 39000 is not in the approved knowledge (version 3)', severity: 'high' }],
    items: [
      { id: 'i1', category: 'budget', value: '50000 PKR', normalized: 50000, quote: 'Mera budget 50000 hai', turnIndex: 1, speaker: 'lead', confidence: 0.92, status: 'accepted', reviewReasons: [], leadWrite: { status: 'applied', fieldKey: 'budget' } },
      { id: 'i2', category: 'authority', value: 'Partner decides', normalized: 'influencer', quote: 'Faisla mere partner karte hain.', turnIndex: 2, speaker: 'lead', confidence: 0.6, status: 'needs_review', reviewReasons: ['low_confidence'] },
    ],
  },
  handoff: {
    requestedAt: at(20), reason: 'Asked for a person', summary: 'Wants a custom price', status: 'timeout', events: [{ at: at(20), type: 'requested' }, { at: at(50), type: 'timeout' }],
    fallback: { script: 'Sorry, nobody is free.', language: 'en', followUp: { state: 'created', kind: 'task', preferredTime: 'tomorrow 3 pm' } },
  },
} as unknown as IntelligentCallRecord;

beforeEach(() => { vi.clearAllMocks(); mocks.socketHandlers.clear(); Element.prototype.scrollIntoView = vi.fn(); });

describe('call intelligence in the call drawer', () => {
  it('groups facts by category with their quotes, flags unapproved prices, and shows the transfer outcome', () => {
    wrap(<TranscriptWithIntelligence call={call} live={false} agentName="Ayesha" leadName="Karachi Bakers" />);
    const panel = screen.getByRole('region', { name: 'Call intelligence' });
    expect(within(panel).getByText('Budget · 1')).toBeTruthy();
    expect(within(panel).getByText('Decision authority · 1')).toBeTruthy();
    expect(within(panel).getByText('Mera budget 50000 hai')).toBeTruthy();
    expect(within(panel).getByText('Written to lead')).toBeTruthy();
    expect(within(panel).getByText(/1 agent statement\(s\) not backed/)).toBeTruthy();
    expect(within(panel).getByText(/Approved knowledge version 3 \(Pinned version\)/)).toBeTruthy();
    expect(within(panel).getByText(/1 model proposal\(s\) were discarded/)).toBeTruthy();
    const handoff = screen.getByRole('region', { name: 'Human transfer' });
    expect(within(handoff).getByText(/Nobody answered in time/)).toBeTruthy();
    expect(within(handoff).getByText(/Preferred callback time: tomorrow 3 pm/)).toBeTruthy();
  });

  it('clicking a quote scrolls to its turn and marks the exact words', () => {
    const { container } = wrap(<TranscriptWithIntelligence call={call} live={false} agentName="Ayesha" leadName="Karachi Bakers" />);
    fireEvent.click(screen.getByRole('button', { name: 'Show this quote in the transcript (turn 2)' }));
    expect(Element.prototype.scrollIntoView).toBeDefined();
    const mark = container.querySelector('#call-turn-rec1-1 mark');
    expect(mark?.textContent).toBe('Mera budget 50000 hai');
  });

  it('accepts a needs-review item through the review API', async () => {
    wrap(<TranscriptWithIntelligence call={call} live={false} agentName="Ayesha" leadName="Karachi Bakers" />);
    fireEvent.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => expect(mocks.api.decide).toHaveBeenCalledWith('rec1', 'i2', { decision: 'accept' }));
  });

  it('a correction needs a valid normalized option', async () => {
    wrap(<TranscriptWithIntelligence call={call} live={false} agentName="Ayesha" leadName="Karachi Bakers" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Correct' })[1]);
    fireEvent.change(screen.getByLabelText('Normalized value'), { target: { value: 'no_authority' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save correction' }));
    await waitFor(() => expect(mocks.api.decide).toHaveBeenCalledWith('rec1', 'i2', { decision: 'edit', value: 'Partner decides', normalized: 'no_authority' }));
  });
});

describe('incoming transfer host', () => {
  const offer: TransferOffer = {
    recordId: 'rec9', callId: 'call_9', agentName: 'Ayesha', campaignName: 'Bakeries', lead: { _id: 'l1', name: 'Karachi Bakers', city: 'Karachi' },
    reason: 'Asked for a person', summary: 'Budget 50k', transcript: [{ role: 'customer', text: 'Kisi insaan se baat karwa dein', at: at(1) }],
    captured: [{ fieldKey: 'active', label: 'Active', value: 'Yes' }], extracted: [], expiresAt: new Date(Date.now() + 30_000).toISOString(), modes: { web: true, phone: true },
  };

  it('shows the context card for a realtime offer and accepts to phone', async () => {
    wrap(<IncomingTransferHost />);
    await waitFor(() => expect(mocks.socketHandlers.has('ai-calling:transfer-offer')).toBe(true));
    act(() => mocks.socketHandlers.get('ai-calling:transfer-offer')?.(offer));
    const dialog = await screen.findByRole('dialog', { name: /Incoming call transfer/ });
    expect(within(dialog).getByText('Karachi Bakers')).toBeTruthy();
    expect(within(dialog).getByText('Asked for a person')).toBeTruthy();
    expect(within(dialog).getByText('Kisi insaan se baat karwa dein')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: /Take it on my phone/ }));
    await waitFor(() => expect(mocks.api.accept).toHaveBeenCalledWith('rec9', 'phone'));
    expect(await screen.findByText(/your phone will ring shortly/)).toBeTruthy();
  });

  it('closes when another colleague takes it, and declines on request', async () => {
    wrap(<IncomingTransferHost />);
    await waitFor(() => expect(mocks.socketHandlers.has('ai-calling:transfer-closed')).toBe(true));
    act(() => mocks.socketHandlers.get('ai-calling:transfer-offer')?.(offer));
    await screen.findByRole('dialog', { name: /Incoming call transfer/ });
    act(() => mocks.socketHandlers.get('ai-calling:transfer-closed')?.({ recordId: 'rec9', status: 'taken' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Incoming call transfer/ })).toBeNull());
    act(() => mocks.socketHandlers.get('ai-calling:transfer-offer')?.({ ...offer, recordId: 'rec10' }));
    const dialog = await screen.findByRole('dialog', { name: /Incoming call transfer/ });
    fireEvent.click(within(dialog).getAllByRole('button', { name: 'Decline' }).at(-1) as HTMLElement);
    await waitFor(() => expect(mocks.api.decline).toHaveBeenCalledWith('rec10'));
  });
});
