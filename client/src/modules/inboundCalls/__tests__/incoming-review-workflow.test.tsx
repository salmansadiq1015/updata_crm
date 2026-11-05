// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { inboundCallsTranslations } from '@/lib/i18n/inbound-calls-translations';
import {
  addTemplateQuestions, closingKey, closingQuestionsPayload, filtersToQuery, inboundPayload, leadTarget, moveItem, statusByResultPatch, workPatch,
} from '../inbound-domain';
import { DEFAULT_STATUS_BY_RESULT, type ClosingQuestion, type InboundCallDetail } from '../types/inbound-call-types';

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => {
    const dict = inboundCallsTranslations.en as Record<string, string>;
    const t = (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const v = vars ?? (typeof fallback === 'object' ? fallback : undefined);
      const raw = dict[key] ?? (typeof fallback === 'string' ? fallback : key);
      return raw.replace(/\{(\w+)\}/g, (_m: string, k: string) => (v?.[k] != null ? String(v[k]) : `{${k}}`));
    };
    return { t, locale: 'en', isRTL: false };
  },
  useOptionalLanguage: () => null,
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('@/modules/users/hooks/use-user-directory', () => ({
  useUserDirectory: () => ({ data: [{ _id: 'u1', firstName: 'Anna', lastName: 'Keller' }, { _id: 'u2', firstName: 'Ben', lastName: 'Roth' }], isLoading: false }),
}));
const api = vi.hoisted(() => ({
  get: vi.fn(), updateWork: vi.fn(), decideRecommendation: vi.fn(), scheduleFollowUp: vi.fn(), createLead: vi.fn(), devices: vi.fn(), questionTemplates: vi.fn(),
}));
vi.mock('../services/inbound-calls-api', () => ({ inboundCallsApi: api }));

const { WorkPanel } = await import('../ui/work-panel');
const { FollowUpDialog } = await import('../ui/inbound-primitives');
const { CallDetailDrawer, ClosingQuestionsList } = await import('../ui/call-detail-drawer');
const { AgentInboundFields } = await import('../ui/agent-inbound-fields');

const t = (_k: string, fallback?: string, vars?: Record<string, unknown>) => (fallback ?? _k).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? `{${k}}`));
const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const q = (over: Partial<ClosingQuestion> = {}): ClosingQuestion => ({ key: '', label: 'Q', question: 'Ask?', type: 'text', required: false, options: [], ...over });

beforeEach(() => { cleanup(); Object.values(api).forEach((f) => f.mockReset()); api.devices.mockResolvedValue([]); });

describe('review workflow helpers', () => {
  it('sends only what changed in the work PATCH, plus the note', () => {
    expect(workPatch({ status: 'new', assigneeId: null }, { status: 'new', assigneeId: '', note: 'x' })).toBeNull();
    expect(workPatch({ status: 'new', assigneeId: null }, { status: 'in_progress', assigneeId: '', note: ' calling back ' })).toEqual({ status: 'in_progress', note: 'calling back' });
    expect(workPatch({ status: 'new', assigneeId: 'u1' }, { status: 'new', assigneeId: '', note: '' })).toEqual({ assignedTo: null });
  });
  it('maps the lead choice to leadId / createLead', () => {
    expect(leadTarget({ kind: 'lead', leadId: 'l1' })).toEqual({ leadId: 'l1' });
    expect(leadTarget({ kind: 'create' })).toEqual({ createLead: true });
    expect(leadTarget(null)).toEqual({});
  });
  it('filters by open work and assignee', () => {
    expect(filtersToQuery({ workStatus: 'open', assignedTo: 'me' })).toEqual({ workStatus: 'open', assignedTo: 'me' });
  });
  it('stores only routing overrides that differ from the defaults, for known results', () => {
    expect(statusByResultPatch({ QUALIFIED: 'new', NOT_QUALIFIED: 'spam' }, DEFAULT_STATUS_BY_RESULT)).toEqual({ NOT_QUALIFIED: 'spam' });
    const p = inboundPayload({ greeting: 'Hi', assignToUserId: '', assignOverridesLeadOwner: true, statusByResult: { MISSED: 'follow_up', QUALIFIED: 'new', BOGUS: 'x' } as Record<string, string>, closingQuestions: [q({ label: ' ', question: 'skip me' }), q({ key: 'email', label: 'Email', question: 'Your email?', type: 'email' })] });
    expect(p).toEqual({ greeting: 'Hi', assignToUserId: null, assignOverridesLeadOwner: true, statusByResult: { MISSED: 'follow_up' },
      closingQuestions: [{ key: 'email', label: 'Email', question: 'Your email?', type: 'email', required: false, options: [] }] });
  });
});

describe('closing questions helpers', () => {
  it('keys standard fields as themselves and the rest as custom_<slug>', () => {
    expect(closingKey({ key: 'email', label: 'Email' })).toBe('email');
    expect(closingKey({ key: '', label: 'Delivery Time!' })).toBe('custom_delivery_time');
    expect(closingKey({ key: 'custom_issue', label: 'x' })).toBe('custom_issue');
  });
  it('inserts a template without duplicating keys already present', () => {
    const current = [q({ key: 'email', label: 'Email', question: 'Mail?' }), q({ key: '', label: 'Issue', question: 'What happened?' })]; // custom_issue
    const tpl = { questions: [q({ key: 'custom_issue', label: 'Issue', question: 'Describe it' }), q({ key: 'email', label: 'Email', question: 'Email?' }), q({ key: 'custom_urgency', label: 'Urgency', question: 'How urgent?', type: 'choice', options: ['urgent', 'today'] })] };
    const r = addTemplateQuestions(current, tpl);
    expect(r.added).toBe(1);
    expect(r.skipped).toBe(2);
    expect(r.questions.map((x) => x.key)).toEqual(['email', '', 'custom_urgency']);
  });
  it('stops at 20 questions and cleans the payload', () => {
    const many = Array.from({ length: 19 }, (_, i) => q({ key: `custom_${i}`, label: `L${i}` }));
    const r = addTemplateQuestions(many, { questions: [q({ key: 'custom_a', label: 'A' }), q({ key: 'custom_b', label: 'B' })] });
    expect(r.questions).toHaveLength(20);
    expect(r.skipped).toBe(1);
    expect(closingQuestionsPayload([q({ label: 'Pick', question: 'Which?', type: 'choice', options: [' a ', '', 'b'] }), q({ label: 'Pick', question: 'dup' })]))
      .toEqual([{ key: 'custom_pick', label: 'Pick', question: 'Which?', type: 'choice', required: false, options: ['a', 'b'] }]);
    expect(moveItem([1, 2, 3], 2, 0)).toEqual([3, 1, 2]);
  });
});

describe('status control', () => {
  const work: NonNullable<InboundCallDetail['work']> = {
    status: 'new', reason: 'qualification_qualified', source: 'agent', updatedAt: '2026-11-04T08:00:00Z', updatedBy: null, assignee: null,
    history: [{ from: null, to: 'new', source: 'agent', reason: 'qualification_qualified', note: null, at: '2026-11-04T08:00:00Z', by: null, assignedTo: { id: 'u1', name: 'Anna Keller' }, assignedFrom: null }],
  };
  it('shows who set it, the history, and saves status + assignee + note', () => {
    const onSave = vi.fn();
    render(<WorkPanel work={work} users={[{ id: 'u1', name: 'Anna Keller' }, { id: 'u2', name: 'Ben Roth' }]} t={t} onSave={onSave} />);
    expect(screen.getByText(/Set by AI agent/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Status history (1)' }));
    const history = screen.getByRole('list', { name: 'Status history' });
    expect(within(history).getByText(/assigned to Anna Keller/)).toBeTruthy();
    expect(within(history).getByText(/Qualified/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'in_progress' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Assigned to' }), { target: { value: 'u2' } });
    fireEvent.change(screen.getByPlaceholderText('Why is the status changing?'), { target: { value: 'Calling back today' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({ status: 'in_progress', assignedTo: 'u2', note: 'Calling back today' });
  });
});

describe('follow-up without a linked lead', () => {
  const candidates = [{ id: 'l1', name: 'Meier AG', number: 'L-1' }, { id: 'l2', name: 'Meier GmbH', number: 'L-2' }];
  it('requires a lead choice; sends leadId for a match', () => {
    const onSubmit = vi.fn();
    render(<FollowUpDialog t={t} hasLead={false} candidates={candidates} onSubmit={onSubmit} onClose={vi.fn()} />);
    const save = screen.getByRole('button', { name: 'Schedule' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(screen.getByText('Nothing is sent to the caller.', { exact: false })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: /Meier GmbH/ }));
    fireEvent.click(save);
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ leadId: 'l2', action: 'ARRANGE_CALLBACK' }));
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('createLead');
  });
  it('can create a new lead even when the number matched others', () => {
    const onSubmit = vi.fn();
    render(<FollowUpDialog t={t} hasLead={false} candidates={candidates} onSubmit={onSubmit} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('radio', { name: 'None of these — create a new lead for this caller' }));
    fireEvent.click(screen.getByRole('button', { name: 'Schedule' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ createLead: true }));
  });
  it('preselects "create a lead" when nothing matched, and blocks a withheld caller', () => {
    const onSubmit = vi.fn();
    render(<FollowUpDialog t={t} hasLead={false} onSubmit={onSubmit} onClose={vi.fn()} />);
    expect((screen.getByRole('radio', { name: 'Create a lead for this caller' }) as HTMLInputElement).checked).toBe(true);
    cleanup();
    render(<FollowUpDialog t={t} hasLead={false} canCreate={false} onSubmit={onSubmit} onClose={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toMatch(/withheld their number/);
    expect((screen.getByRole('button', { name: 'Schedule' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

const detail = (over: Partial<InboundCallDetail> = {}) => ({
  id: 'c1', callId: 'in_1', caller: { name: 'Hans', number: '+41791234567', presentation: 'available' }, callerType: 'ambiguous', lead: null,
  status: 'COMPLETED', aiStatus: 'ended', audioStatus: 'closed', handling: 'ai', answeredBy: 'ai', outcome: 'handled_by_ai', agent: null, rule: null, aiBlockedBy: null,
  sim: { slot: null, label: null }, device: null, durationSeconds: 60, ringSeconds: 3, primaryInquiry: null, qualification: null, callbackRequested: false, humanRequested: false,
  detectedAt: '2026-11-04T08:00:00Z', answeredAt: null, endedAt: null, createdBy: 'u0', leadDetail: null,
  match: { status: 'ambiguous', candidates: [{ id: 'l1', name: 'Meier AG', number: 'L-1' }, { id: 'l2', name: 'Meier GmbH', number: 'L-2' }] },
  handlingDetail: null, language: null, transcript: [], events: [], fields: [],
  qa: { aiQuestions: [], callerQuestions: [], unanswered: [], missingInformation: [], closingQuestions: [] },
  intentsDetail: null, summary: null, qualificationDetail: null,
  recommendations: [
    { id: 'REVIEW_CALLER_MATCH', action: 'REVIEW_CALLER_MATCH', reason: 'Several leads match.', status: 'pending', followUpId: null, decidedBy: null, decidedAt: null, automatic: false },
    { id: 'ARRANGE_CALLBACK', action: 'ARRANGE_CALLBACK', reason: 'Callback asked.', status: 'pending', followUpId: null, decidedBy: null, decidedAt: null, automatic: false },
  ],
  followUpIds: [], callback: null, handoff: null, doNotContact: false, notes: [], audio: null, codec: null, pendingCommand: null, error: null, processedAt: null, endReason: null,
  transcriptStats: { turns: 0, callerTurns: 0 }, cost: null, work: { status: 'new', reason: null, source: 'agent', updatedAt: null, updatedBy: null, assignee: null, history: [] }, ...over,
}) as unknown as InboundCallDetail;

describe('call drawer: execute without a lead', () => {
  it('REVIEW_CALLER_MATCH opens the lead chooser and links the chosen lead', async () => {
    api.get.mockResolvedValue(detail());
    api.decideRecommendation.mockResolvedValue(detail());
    wrap(<CallDetailDrawer callId="c1" onClose={vi.fn()} />);
    const execute = await screen.findAllByRole('button', { name: 'Execute' });
    fireEvent.click(execute[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Review the caller match' });
    fireEvent.click(within(dialog).getByRole('radio', { name: /Meier AG/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Link call' }));
    await waitFor(() => expect(api.decideRecommendation).toHaveBeenCalledWith('c1', 'REVIEW_CALLER_MATCH', { decision: 'execute', leadId: 'l1' }));
  });
  it('a callback without a lead asks for the lead, then sends createLead with the follow-up', async () => {
    api.get.mockResolvedValue(detail());
    api.decideRecommendation.mockResolvedValue(detail());
    wrap(<CallDetailDrawer callId="c1" onClose={vi.fn()} />);
    const execute = await screen.findAllByRole('button', { name: 'Execute' });
    fireEvent.click(execute[1]);
    const dialog = await screen.findByRole('dialog', { name: 'Arrange a callback' });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'None of these — create a new lead for this caller' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Execute' }));
    await waitFor(() => expect(api.decideRecommendation).toHaveBeenCalledWith('c1', 'ARRANGE_CALLBACK', expect.objectContaining({ decision: 'execute', createLead: true, dueAt: expect.any(String) })));
  });
  it('saves a status change from the drawer header', async () => {
    api.get.mockResolvedValue(detail());
    api.updateWork.mockResolvedValue(detail({ work: { status: 'resolved', reason: 'set_by_user', source: 'user', updatedAt: null, updatedBy: { id: 'u1', name: 'Anna Keller' }, assignee: null, history: [] } }));
    wrap(<CallDetailDrawer callId="c1" onClose={vi.fn()} />);
    fireEvent.change(await screen.findByRole('combobox', { name: 'Status' }), { target: { value: 'resolved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateWork).toHaveBeenCalledWith('c1', { status: 'resolved' }));
  });
});

describe('questions before goodbye in the call details', () => {
  it('lists each question with Answered / Declined / Not asked and the value', () => {
    render(<ClosingQuestionsList t={t} items={[
      { key: 'email', label: 'Email', question: 'Your email?', type: 'email', required: true, status: 'answered', value: 'hans@meier.ch', explicit: true },
      { key: 'alternate_phone', label: 'Alternate number', question: 'Another number?', type: 'phone', required: false, status: 'declined', value: null, explicit: null },
      { key: 'custom_dietary', label: 'Allergies', question: 'Any allergies?', type: 'long_text', required: false, status: 'not_asked', value: null, explicit: null },
    ]} />);
    expect(screen.getByText('Questions before goodbye (1/3 answered)')).toBeTruthy();
    expect(screen.getByText('hans@meier.ch')).toBeTruthy();
    expect(screen.getByText('Declined')).toBeTruthy();
    expect(screen.getByText('Not asked')).toBeTruthy();
    expect(screen.getByText('Important')).toBeTruthy();
  });
});

describe('agent editor: routing + closing questions', () => {
  it('edits routing and adds a template without duplicates, keeping the other inbound keys', async () => {
    api.questionTemplates.mockResolvedValue({ templates: [{ id: 'contact_details', name: 'Contact details', description: 'x', questions: [
      q({ key: 'full_name', label: 'Full name', question: 'Name?' }), q({ key: 'email', label: 'Email', question: 'Email?', type: 'email' }),
    ] }], types: [], standardKeys: [] });
    let value: Record<string, unknown> = { greeting: 'Hello', instructions: '', escalationInstructions: '', closingQuestions: [q({ key: 'email', label: 'Email', question: 'Mail?', type: 'email' })] };
    const onChange = vi.fn((next) => { value = next; });
    const view = wrap(<AgentInboundFields value={value} onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Assign calls to' }), { target: { value: 'u2' } });
    expect(value).toMatchObject({ greeting: 'Hello', assignToUserId: 'u2' });
    const client = new QueryClient();
    const rerender = () => view.rerender(<QueryClientProvider client={client}><AgentInboundFields value={value} onChange={onChange} /></QueryClientProvider>);
    rerender();
    fireEvent.click(screen.getByRole('switch', { name: 'Even when the lead already has an owner' }));
    rerender();
    fireEvent.change(screen.getByRole('combobox', { name: 'Missed call' }), { target: { value: 'follow_up' } });
    expect(value).toMatchObject({ assignOverridesLeadOwner: true, statusByResult: { MISSED: 'follow_up' } });
    expect(inboundPayload(value as never)).toMatchObject({ assignToUserId: 'u2', assignOverridesLeadOwner: true, statusByResult: { MISSED: 'follow_up' } });
    rerender();
    fireEvent.click(screen.getByRole('button', { name: 'Add from template' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'Add from template' }), { key: 'Enter' });
    fireEvent.click(await screen.findByText('Contact details'));
    const questions = (value.closingQuestions as ClosingQuestion[]).map((x) => x.key);
    expect(questions).toEqual(['email', 'full_name']); // email was already there
    expect(value).toMatchObject({ greeting: 'Hello', assignToUserId: 'u2' });
  });
});
