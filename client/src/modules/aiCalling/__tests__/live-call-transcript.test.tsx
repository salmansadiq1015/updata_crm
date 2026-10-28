import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CallRecord, CallTranscriptTurn } from '../types/ai-calling-types';

const api = { getCall: vi.fn() };
vi.mock('../services/ai-calling-api', () => ({ aiCallingApi: api }));
const { CallDetailDrawer } = await import('../ui/call-detail-drawer');
const { CallTranscript } = await import('../ui/call-transcript');
const { CallAnswerChecklist, ConversationInsightsPanel } = await import('../ui/conversation-insights');

const turn = (itemId: string, role: 'assistant' | 'customer', text: string): CallTranscriptTurn => ({ itemId, role, text, at: '2026-10-28T15:00:00Z' });
let call: CallRecord;
beforeEach(() => {
  vi.clearAllMocks();
  call = {
    _id: 'call-1', internalCallId: 'internal-1', attemptNumber: 1, state: 'in_progress', disposition: null, qualification: null,
    durationSeconds: 0, initiatedAt: new Date(Date.now() - 40_000).toISOString(), answeredAt: new Date(Date.now() - 38_000).toISOString(),
    answers: [{ questionFieldKey: 'need', label: 'Service needed', rawAnswer: 'A quote for our office.', normalizedValue: 'Office quote', validation: 'valid', confirmed: false } as CallRecord['answers'][number]],
    reviewRequired: false, provider: 'paired_phone', leadId: { _id: 'lead-1', name: 'Zafar Traders', phone: '+923001234567', email: 'hello@example.test' }, campaignId: { _id: 'campaign-1', name: 'Customer support' },
    transcript: [turn('a1', 'assistant', 'How can we help your team?'), turn('c1', 'customer', 'A quote for our office.')],
    callContext: { agentName: 'Aria', objective: 'Understand service needs', phase: 'ask', currentQuestion: 'When would you like us to call?', answered: 1, total: 2, questions: [{ fieldKey: 'need', label: 'Service needed', text: 'How can we help your team?', required: true }] },
  };
  api.getCall.mockImplementation(async () => call);
});

describe('live call preview', () => {
  it('shows both speakers and keeps the preview open as the call gains answers and ends', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const user = userEvent.setup();
    render(<QueryClientProvider client={client}><CallDetailDrawer callId="call-1" onClose={() => {}} /></QueryClientProvider>);
    expect(await screen.findByText('How can we help your team?')).toBeInTheDocument();
    expect(screen.getByText('A quote for our office.')).toBeInTheDocument();
    expect(screen.getByText('· Lead', { exact: true })).toBeInTheDocument();
    const final = { ...call, state: 'completed', endedAt: new Date().toISOString(), durationSeconds: 45, transcript: [...call.transcript!, turn('a2', 'assistant', 'Thank you. Our team will follow up.')] };
    act(() => client.setQueryData(['ai-calling', 'call', 'call-1'], final));
    expect(await screen.findByText('Thank you. Our team will follow up.')).toBeInTheDocument();
    expect(screen.getByText('Call ended')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Answers' }));
    expect(screen.getByRole('heading', { name: /Service needed/ })).toBeInTheDocument();
    expect(screen.getByText('A quote for our office.')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Details' }));
    expect(screen.getByText('+923001234567')).toBeInTheDocument();
    expect(screen.getByText('Understand service needs')).toBeInTheDocument();
    expect(api.getCall).toHaveBeenCalledWith('call-1');
  });

  it('lets a user read previous speech without jumping away when a new utterance arrives', () => {
    const turns = [turn('a1', 'assistant', 'First question'), turn('c1', 'customer', 'First response')];
    const view = render(<CallTranscript turns={turns} live />);
    const log = screen.getByRole('log', { name: 'Call conversation transcript' });
    Object.defineProperties(log, { scrollHeight: { value: 2000, configurable: true }, clientHeight: { value: 300, configurable: true } });
    log.scrollTop = 500;
    fireEvent.scroll(log);
    view.rerender(<CallTranscript turns={[...turns, turn('a2', 'assistant', 'Next question')]} live />);
    expect(log.scrollTop).toBe(500);
    fireEvent.click(screen.getByRole('button', { name: 'Jump to latest' }));
    expect(log.scrollTop).toBe(2000);
  });

  it('shows unanswered and conditionally excluded questions alongside captured answers and explicit requests', () => {
    call.questionCoverage = { total: 3, applicable: 2, answered: 1, unknown: 0, needsClarification: 0, needsConfirmation: 0, unanswered: 1, notApplicable: 1, requiredGaps: ['timing'], questions: [
      { fieldKey: 'need', label: 'Service needed', question: 'What do you need?', required: true, eligible: true, status: 'answered', rawAnswer: 'Office quote', normalizedValue: 'Office quote', validation: 'valid', confirmed: true, source: 'agent_tool' },
      { fieldKey: 'timing', label: 'Callback time', question: 'When can we call?', required: true, eligible: true, status: 'pending', rawAnswer: '', normalizedValue: null, validation: null, confirmed: false, source: null },
      { fieldKey: 'branch', label: 'Branch', question: 'Which branch?', required: false, eligible: false, status: 'not_applicable', rawAnswer: '', normalizedValue: null, validation: null, confirmed: false, source: null },
    ] };
    call.conversationInsights = { version: 1, basis: 'recorded_evidence', intent: 'human_requested', observations: [{ code: 'human_requested', label: 'Human follow-up requested', evidence: 'Please ask a person to call.' }], nextSteps: ['Assign to a team member.'], participation: { agentTurns: 2, leadTurns: 2, interruptedAgentTurns: 0 }, limitation: 'Only recorded evidence.' };
    render(<><CallAnswerChecklist call={call} /><ConversationInsightsPanel call={call} /></>);
    expect(screen.getByRole('heading', { name: /Callback time/ })).toBeInTheDocument();
    expect(screen.getByText('Awaiting answer')).toBeInTheDocument();
    expect(screen.getByText('Condition not met')).toBeInTheDocument();
    expect(screen.getByText('Please ask a person to call.')).toBeInTheDocument();
    expect(screen.getByText('Assign to a team member.')).toBeInTheDocument();
  });
});
