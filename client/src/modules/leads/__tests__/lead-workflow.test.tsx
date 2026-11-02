import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import type { AxiosResponse } from 'axios';
import { server } from './mocks/server';
import { server as tasksServer } from '../../tasks/__tests__/mocks/server';
import { BASE } from './mocks/handlers';
import { ok } from './mocks/data';

vi.mock('@/lib/api/client', async () => {
  const axios = await import('axios');
  const instance = axios.default.create({ baseURL: BASE });
  instance.interceptors.response.use((response) => {
    const body = response.data;
    if (body && typeof body === 'object' && 'success' in body) {
      return { data: body.data, meta: body.meta || {}, pagination: body.pagination || null } as unknown as AxiosResponse;
    }
    return response;
  });
  instance.interceptors.response.use(undefined, (error) => Promise.reject({
    statusCode: error.response?.status, code: error.response?.data?.error?.code, message: 'request failed',
  }));
  return { default: instance, normalizeApiError: (error: unknown) => error };
});
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('@/lib/i18n/language-context', () => {
  const t = (key: string, fallback?: string | null, vars?: Record<string, unknown>) => {
    const text = fallback ?? key;
    return vars ? text.replace(/\{(\w+)\}/g, (_, name) => (vars[name] != null ? String(vars[name]) : `{${name}}`)) : text;
  };
  const value = { locale: 'en', language: 'en', dir: 'ltr', isRTL: false, t };
  return { useLanguage: () => value, LanguageProvider: ({ children }: { children: ReactNode }) => children };
});
const auth = vi.hoisted(() => ({ permissions: ['lead:read', 'lead:write'] as string[] }));
vi.mock('@/stores/auth-store', () => {
  const state = { user: { id: 'u-me', get permissions() { return auth.permissions; } }, isAuthenticated: true, isLoading: false, accessToken: null };
  const useAuthStore = Object.assign(
    (selector?: (value: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => state },
  );
  return { useAuthStore };
});
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/modules/tasks/hooks/use-workspace-users', () => ({
  useWorkspaceUsers: () => ({ data: [{ id: 'u-me', firstName: 'Me' }, { id: 'u-ben', firstName: 'Ben' }] }),
}));

import { LeadConversationHistory } from '../ui/lead-conversation-history';
import { QualificationFieldHistory } from '../ui/qualification-field-history';
import { FollowUpInbox } from '../ui/follow-up-inbox';
import { LeadSlaBadge } from '../ui/lead-sla-badge';
import { parseFollowUp, parseHistoryEntry, parsePolicy, parseTimelineEntry } from '../services/lead-workflow-api';
import { readLeadSla } from '../schemas/lead-sla-schema';
import { showError } from '@/lib/toast';

const L = `${BASE}/crm/leads`;
const FU = `${BASE}/crm/follow-ups`;
const NOW = Date.now();
const iso = (offset: number) => new Date(NOW + offset).toISOString();

const QUAL_ENTRY = {
  id: 'qualification:aaaaaaaaaaaaaaaaaaaaaaaa', type: 'qualification', at: iso(-60_000), leadId: 'l1', mergedFrom: null, channel: null,
  direction: null, title: 'Budget', status: 'answered', summary: null, body: null, actor: null,
  links: { historyId: 'aaaaaaaaaaaaaaaaaaaaaaaa', callRecordId: 'cccccccccccccccccccccccc' },
  meta: {
    fieldKey: 'budget', previous: { value: 5000, status: 'answered' }, current: { value: 3000, status: 'answered' }, source: 'ai_call_agent',
    evidence: 'our budget is 3000', transcriptRef: { callRecordId: 'cccccccccccccccccccccccc', turnIndex: 1, startMs: null, quote: 'our budget is 3000' },
  },
};
const SMS_ENTRY = {
  id: 'sms_message:bbbbbbbbbbbbbbbbbbbbbbbb', type: 'sms_message', at: iso(-120_000), leadId: 'l1', mergedFrom: 'l0', channel: 'sms',
  direction: 'inbound', title: 'SMS reply', status: 'received', summary: 'Call me tomorrow', body: 'Call me tomorrow', actor: null,
  links: { smsMessageId: 'bbbbbbbbbbbbbbbbbbbbbbbb' }, meta: {},
};

function renderUi(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

beforeAll(() => {
  tasksServer.close();
  server.listen({ onUnhandledRequest: 'bypass' });
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  HTMLElement.prototype.hasPointerCapture ??= vi.fn(() => false);
  HTMLElement.prototype.releasePointerCapture ??= vi.fn();
  HTMLElement.prototype.scrollIntoView ??= vi.fn();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
beforeEach(() => { vi.clearAllMocks(); auth.permissions = ['lead:read', 'lead:write']; });

describe('lead workflow parsing', () => {
  it('parses timeline, history, follow-up, policy and SLA payloads tolerantly', () => {
    expect(parseTimelineEntry({ id: 'x' })).toBeNull();
    const e = parseTimelineEntry({ ...SMS_ENTRY, transcript: { available: true, excerpt: [{ index: 0, role: 'assistant', text: 'Hi' }] } });
    expect(e).toMatchObject({ channel: 'sms', direction: 'inbound', mergedFrom: 'l0' });
    expect(e?.transcript?.excerpt[0]).toMatchObject({ role: 'assistant', text: 'Hi' });
    const h = parseHistoryEntry({ _id: 'h1', fieldKey: 'budget', current: { value: 1, status: 'answered' }, transcriptRef: { turnIndex: 2 } });
    expect(h).toMatchObject({ id: 'h1', source: null, previous: null, transcriptRef: { turnIndex: 2, callRecordId: null } });
    const f = parseFollowUp({ id: 'f1', status: 'weird', bucket: 'overdue', suppression: { suppressed: true, reason: 'do_not_contact', reasons: ['do_not_contact'] } });
    expect(f).toMatchObject({ status: 'open', bucket: 'overdue', timezone: null, suppression: { suppressed: true } });
    expect(parsePolicy(null)).toMatchObject({ enabled: false, strategy: 'round_robin', sla: { firstResponseMinutes: 240 } });
    expect(readLeadSla({})).toBeUndefined();
    expect(readLeadSla({ slaStatus: 'bogus', firstResponseDueAt: 'not a date' })).toMatchObject({ slaStatus: 'none', firstResponseDueAt: null });
  });
});

describe('LeadSlaBadge', () => {
  it('shows a countdown, an overdue state and nothing without an SLA', () => {
    const base = { assignedAt: null, assignmentSource: null, firstRespondedAt: null, firstResponseChannel: null, escalationLevel: 0 };
    const { rerender } = renderUi(<LeadSlaBadge sla={{ ...base, slaStatus: 'pending', firstResponseDueAt: iso(90 * 60_000) }} />);
    expect(screen.getByText(/Respond within 1h (29|30)m/)).toBeInTheDocument();
    rerender(<QueryClientProvider client={new QueryClient()}><LeadSlaBadge sla={{ ...base, slaStatus: 'overdue', escalationLevel: 1, firstResponseDueAt: iso(-30 * 60_000) }} /></QueryClientProvider>);
    expect(screen.getByText(/Response overdue/)).toBeInTheDocument();
    rerender(<QueryClientProvider client={new QueryClient()}><LeadSlaBadge sla={{ ...base, slaStatus: 'none', firstResponseDueAt: null }} /></QueryClientProvider>);
    expect(screen.queryByText(/Respon/)).not.toBeInTheDocument();
  });
});

describe('LeadConversationHistory', () => {
  it('lists entries, filters by channel, and opens the call transcript at the evidence turn', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(`${L}/:id/timeline`, ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        const data = url.searchParams.get('channel') === 'sms' ? [SMS_ENTRY] : [QUAL_ENTRY, SMS_ENTRY];
        return HttpResponse.json({ ...ok(data), pagination: { hasNext: false, nextCursor: null } });
      }),
      http.get(`${L}/:id/timeline/calls/:callId/transcript`, () => HttpResponse.json(ok({
        callRecordId: 'cccccccccccccccccccccccc', campaignName: 'Autumn', turns: [
          { index: 0, role: 'assistant', text: 'What is your budget?', at: iso(-200_000) },
          { index: 1, role: 'customer', text: 'Well, our budget is 3000.', at: iso(-190_000) },
        ],
      }))),
    );
    const user = userEvent.setup();
    renderUi(<LeadConversationHistory leadId="l1" />);
    expect(await screen.findByText('Budget changed')).toBeInTheDocument();
    expect(screen.getByText('From merged lead')).toBeInTheDocument();

    const item = screen.getByText('Budget changed').closest('li') as HTMLElement;
    await user.click(within(item).getByRole('button', { name: 'Show details' }));
    expect(within(item).getByText('AI call agent (from the call)')).toBeInTheDocument();
    await user.click(within(item).getByRole('button', { name: 'Open transcript at turn 2' }));
    const dialog = await screen.findByRole('dialog');
    const turn = await within(dialog).findByText('Well, our budget is 3000.');
    expect(turn.closest('li')).toHaveAttribute('aria-current', 'true');

    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'SMS' }));
    await waitFor(() => expect(requests.some((u) => u.searchParams.get('channel') === 'sms')).toBe(true));
    await waitFor(() => expect(screen.queryByText('Budget changed')).not.toBeInTheDocument());
  });
});

describe('QualificationFieldHistory', () => {
  it('shows versions and submits a correction with a reason, linked to the latest version', async () => {
    let posted: Record<string, unknown> | null = null;
    server.use(
      http.get(`${L}/:id/qualification/history`, () => HttpResponse.json({ ...ok([
        { _id: 'h2', fieldKey: 'budget', previous: { value: 5000, status: 'answered' }, current: { value: 3000, status: 'answered', evidence: 'budget is 3000' }, source: 'ai_call_agent', changedAt: iso(-1000), changedByName: null },
      ]), pagination: { hasNext: false } })),
      http.post(`${L}/:id/qualification/corrections`, async ({ request }) => {
        posted = await request.json() as Record<string, unknown>;
        return HttpResponse.json(ok({ _id: 'h3', fieldKey: 'budget', current: { value: '2500', status: 'answered' }, source: 'user_correction' }), { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderUi(<QualificationFieldHistory leadId="l1" fieldKey="budget" label="Budget" canWrite />);
    await user.click(screen.getByRole('button', { name: 'Answer history for Budget' }));
    expect(await screen.findByText('“budget is 3000”')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Correct this answer' }));
    await user.type(screen.getByLabelText('Correct value'), '2500');
    const save = screen.getByRole('button', { name: 'Save correction' });
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('Reason (required)'), 'Lead confirmed by e-mail');
    await user.click(save);
    await waitFor(() => expect(posted).toEqual({ fieldKey: 'budget', status: 'answered', value: '2500', reason: 'Lead confirmed by e-mail', correctionOf: 'h2' }));
  });

  it('hides the correction action without lead:write', async () => {
    server.use(http.get(`${L}/:id/qualification/history`, () => HttpResponse.json({ ...ok([]), pagination: { hasNext: false } })));
    const user = userEvent.setup();
    renderUi(<QualificationFieldHistory leadId="l1" fieldKey="budget" label="Budget" canWrite={false} />);
    await user.click(screen.getByRole('button', { name: 'Answer history for Budget' }));
    expect(await screen.findByText(/No recorded changes/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Correct this answer' })).not.toBeInTheDocument();
  });
});

describe('FollowUpInbox', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 'f1', leadId: 'l1', lead: { id: 'l1', name: 'Acme AG', leadNumber: 'L-1', status: 'new' }, owner: { id: 'u-me', name: 'Me' },
    dueAt: iso(-3_600_000), nextDueAt: iso(-3_600_000), timezone: 'Asia/Tokyo', channel: 'phone', note: 'Call back about the offer',
    status: 'open', bucket: 'overdue', snoozeCount: 0, source: { type: 'communication' }, suppression: { suppressed: false, reasons: [], limited: false }, ...over,
  });

  it('shows due times in both zones, blocks suppressed leads and completes follow-ups', async () => {
    let completed: unknown = null;
    server.use(
      http.get(`${FU}/summary`, () => HttpResponse.json(ok({ overdue: 2, today: 0, upcoming: 0, timezone: 'UTC' }))),
      http.get(FU, () => HttpResponse.json({ ...ok([
        row({}),
        row({ id: 'f2', lead: { id: 'l2', name: 'Blocked GmbH' }, leadId: 'l2', suppression: { suppressed: true, reason: 'do_not_contact', reasons: ['do_not_contact'] } }),
      ]), pagination: { hasNext: false, nextCursor: null } })),
      http.post(`${FU}/:id/complete`, async ({ request }) => { completed = await request.json(); return HttpResponse.json(ok(row({ status: 'done', bucket: 'done' }))); }),
      http.get(`${FU}/:id/contact-check`, () => HttpResponse.json(ok({ allowed: true, suppressed: false }))),
    );
    const user = userEvent.setup();
    renderUi(<FollowUpInbox />);
    const acme = (await screen.findByText('Acme AG')).closest('li') as HTMLElement;
    expect(within(acme).getByText(/\(Asia\/Tokyo\)/)).toBeInTheDocument();
    expect(within(acme).getByText(/your time/)).toBeInTheDocument();
    const blocked = screen.getByText('Blocked GmbH').closest('li') as HTMLElement;
    expect(within(blocked).getByText('Suppressed — do not contact')).toBeInTheDocument();
    expect(within(blocked).getByRole('button', { name: 'Contact blocked' })).toBeDisabled();

    await user.click(within(acme).getByRole('button', { name: 'Contact' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/leads?detail=l1'));

    await user.click(within(acme).getByRole('button', { name: 'Done' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Outcome note (optional)'), 'Reached them');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(completed).toEqual({ note: 'Reached them' }));
  });

  it('hides editing controls for read-only viewers and supports keyboard bucket navigation', async () => {
    auth.permissions = ['lead:read'];
    server.use(
      http.get(`${FU}/summary`, () => HttpResponse.json(ok({ overdue: 1, today: 0, upcoming: 0, done: 3 }))),
      http.get(FU, () => HttpResponse.json({ ...ok([row({})]), pagination: { hasNext: false, nextCursor: null } })),
    );
    const user = userEvent.setup();
    renderUi(<FollowUpInbox />);
    expect(await screen.findByText('Acme AG')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New follow-up' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done', exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /More actions/ })).not.toBeInTheDocument();
    const done = screen.getByRole('tab', { name: /Done/ });
    expect(done).toHaveTextContent('3');
    screen.getByRole('tab', { name: /Overdue/ }).focus();
    await user.keyboard('{End}');
    expect(done).toHaveFocus();
    expect(done).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', done.id);
  });

  it('hides lifecycle actions for a team member but keeps them available to the creator', async () => {
    server.use(
      http.get(`${FU}/summary`, () => HttpResponse.json(ok({ overdue: 2, today: 0, upcoming: 0, done: 0 }))),
      http.get(FU, () => HttpResponse.json({ ...ok([
        row({ owner: { id: 'u-ben', name: 'Ben' } }),
        row({ id: 'f2', lead: { id: 'l2', name: 'My assigned follow-up' }, owner: { id: 'u-ben', name: 'Ben' }, createdBy: 'u-me' }),
      ]), pagination: { hasNext: false, nextCursor: null } })),
    );
    renderUi(<FollowUpInbox />);
    const other = (await screen.findByText('Acme AG')).closest('li') as HTMLElement;
    expect(within(other).queryByRole('button', { name: 'Done', exact: true })).not.toBeInTheDocument();
    const own = screen.getByText('My assigned follow-up').closest('li') as HTMLElement;
    expect(within(own).getByRole('button', { name: 'Done', exact: true })).toBeEnabled();
  });

  it('re-checks suppression at action time and refuses to open the lead when blocked', async () => {
    server.use(
      http.get(`${FU}/summary`, () => HttpResponse.json(ok({ overdue: 1, today: 0, upcoming: 0, timezone: 'UTC' }))),
      http.get(FU, () => HttpResponse.json({ ...ok([row({})]), pagination: { hasNext: false, nextCursor: null } })),
      http.get(`${FU}/:id/contact-check`, () => HttpResponse.json({ success: false, error: { code: 'CONTACT_SUPPRESSED' } }, { status: 409 })),
    );
    const user = userEvent.setup();
    renderUi(<FollowUpInbox />);
    const acme = (await screen.findByText('Acme AG')).closest('li') as HTMLElement;
    await user.click(within(acme).getByRole('button', { name: 'Contact' }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith('Contact is blocked for this lead (suppressed).'));
    expect(push).not.toHaveBeenCalled();
  });
});
