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
import { makeLeadDTO, ok } from './mocks/data';

// ── Module mocks (mirrors lead-list-view.test.tsx) ────────────────────────────

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
  return { default: instance, normalizeApiError: (error: unknown) => error };
});

vi.mock('@/lib/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showLoading: vi.fn(),
  dismissToast: vi.fn(),
  showPromise: vi.fn(),
}));

// `leads.*` always resolves to the English fallback; `common.*`/`doctpl.*` come
// from the real English dictionary. Placeholders are interpolated.
vi.mock('@/lib/i18n/language-context', async () => {
  const { translations } = await import('@/lib/i18n/translations');
  const dictionary = (translations as unknown as Record<string, Record<string, string>>).en;
  const t = (key: string, fallback?: string | null, vars?: Record<string, unknown>) => {
    const raw = key.startsWith('leads.') ? fallback : (dictionary[key] ?? fallback);
    const text = raw ?? key;
    return vars ? text.replace(/\{(\w+)\}/g, (_, name) => (vars[name] != null ? String(vars[name]) : `{${name}}`)) : text;
  };
  const value = { locale: 'en', language: 'en', dir: 'ltr', isRTL: false, t };
  return { useLanguage: () => value, LanguageProvider: ({ children }: { children: ReactNode }) => children };
});

// Mutable permission set so each test can vary what the user may do.
const auth = vi.hoisted(() => ({
  permissions: ['lead:read', 'lead:write', 'lead:convert', 'lead:delete', 'crm:write', 'lead:whatsapp'] as string[],
}));

vi.mock('@/stores/auth-store', () => {
  const state = {
    user: {
      id: 'u-me',
      get permissions() {
        return auth.permissions;
      },
    },
    isAuthenticated: true,
    isLoading: false,
    accessToken: null,
  };
  const useAuthStore = Object.assign(
    (selector?: (value: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => ({ ...state, setTokens: vi.fn(), setAuth: vi.fn(), clearAuth: vi.fn() }) },
  );
  return { useAuthStore };
});

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { LeadDetailDrawer } from '../ui/lead-detail-drawer';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const L = `${BASE}/crm/leads`;
const D = `${BASE}/doctpl`;

const LEAD_FULL = makeLeadDTO({
  id: 'lead-full',
  name: 'Alpine Bakery AG',
  email: 'info@example.ch',
  phone: '+41 44 123 45 67',
});
const LEAD_NO_PHONE = makeLeadDTO({
  id: 'lead-no-phone',
  name: 'Basel Dental GmbH',
  email: 'hello@dental.ch',
  phone: null,
  mobile: null,
  normalizedPhone: null,
});
const LEAD_NO_EMAIL = makeLeadDTO({
  id: 'lead-no-email',
  name: 'Chur Yoga Studio',
  email: null,
  phone: '+41 81 555 00 11',
});
const LEADS = [LEAD_FULL, LEAD_NO_PHONE, LEAD_NO_EMAIL];
const leadFor = (id: unknown) => LEADS.find((lead) => lead.id === id) ?? LEAD_FULL;

const CONTACT_LOG = [
  { id: 'c-1', channel: 'whatsapp', subject: null, note: 'Sent intro on WhatsApp', createdAt: new Date().toISOString() },
  { id: 'c-2', channel: 'phone', subject: 'Called about pricing', note: null, createdAt: new Date().toISOString() },
];

// ── Harness ───────────────────────────────────────────────────────────────────

beforeAll(() => {
  tasksServer.close();
  server.listen({ onUnhandledRequest: 'bypass' });
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLElement.prototype.hasPointerCapture ??= vi.fn(() => false);
  HTMLElement.prototype.releasePointerCapture ??= vi.fn();
  HTMLElement.prototype.scrollIntoView ??= vi.fn();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

beforeEach(() => {
  vi.clearAllMocks();
  auth.permissions = ['lead:read', 'lead:write', 'lead:convert', 'lead:delete', 'crm:write', 'lead:whatsapp'];
  server.use(
    http.get(`${L}/:id/contact-log`, () => HttpResponse.json(ok(CONTACT_LOG))),
    http.get(`${L}/:id`, ({ params }) => HttpResponse.json(ok(leadFor(params.id)))),
    http.get(`${D}/emails`, () => HttpResponse.json(ok([]))),
    http.get(`${D}/email-templates`, () => HttpResponse.json(ok([]))),
    http.get(`${BASE}/messaging/templates`, () => HttpResponse.json(ok([]))),
    http.get(`${BASE}/messaging/campaigns`, () => HttpResponse.json({
      ...ok([{
        _id: '507f1f77bcf86cd799439011', name: 'October nurture', channel: 'email', status: 'completed',
        summary: { total: 1, eligible: 1, ineligible: 0, queued: 0, accepted: 0, sent: 0, delivered: 1, read: 0, failed: 0, unknown: 0, suppressed: 0, missingContact: 0, invalidContact: 0, duplicate: 0, optedOut: 0 },
      }]),
      pagination: { page: 1, limit: 100, total: 1, pages: 1 },
    })),
    http.get(`${BASE}/messaging/leads/:id/history`, () => HttpResponse.json(ok([]))),
    http.get(`${BASE}/ai-calling/leads/:id/history`, () => HttpResponse.json(ok([]))),
    http.get(`${BASE}/ai-calling/leads/:id/transitions`, () => HttpResponse.json(ok([]))),
    http.get(`${BASE}/ai-calling/leads/:id/consent`, () => HttpResponse.json(ok({ status: 'missing', destinationAvailable: true }))),
    http.get(`${BASE}/messaging/leads/:id/consent`, ({ params }) => HttpResponse.json(ok({
      leadId: String(params.id),
      channels: [
        { channel: 'email', status: 'granted', effectiveStatus: 'granted', hasDestination: true, evidence: 'Signed contact form', source: 'signed_form', capturedAt: '2026-10-01T10:00:00.000Z', changedAt: '2026-10-01T10:00:00.000Z', suppression: null },
        { channel: 'sms', status: 'unknown', effectiveStatus: 'unknown', hasDestination: true, evidence: '', source: null, suppression: null },
        { channel: 'whatsapp', status: 'unknown', effectiveStatus: 'unknown', hasDestination: true, evidence: '', source: null, suppression: null },
      ],
    }))),
  );
});

function renderDrawer(leadId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  const view = render(<LeadDetailDrawer leadId={leadId} open onOpenChange={() => {}} users={[]} />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { user, queryClient, ...view };
}

const openDrawer = async (leadId: string, name: string) => {
  renderDrawer(leadId);
  return screen.findByRole('dialog', { name });
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('lead detail drawer — contact actions', () => {
  it('shows focused sections and supports keyboard navigation between tabs', async () => {
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');
    const user = userEvent.setup();
    const overview = within(drawer).getByRole('tab', { name: 'Overview' });
    expect(overview).toHaveAttribute('aria-selected', 'true');
    // 8 sections + the unified conversation history tab.
    expect(within(drawer).getAllByRole('tab')).toHaveLength(9);
    expect(within(drawer).queryByText('Channel consent')).not.toBeInTheDocument();
    expect(within(drawer).queryByText('No emails sent')).not.toBeInTheDocument();
    overview.focus();
    await user.keyboard('{ArrowRight}');
    expect(within(drawer).getByRole('tab', { name: 'Responses' })).toHaveAttribute('aria-selected', 'true');
    expect(await within(drawer).findByText('Received messages')).toBeInTheDocument();
    expect(within(drawer).queryByRole('combobox', { name: 'Status' })).not.toBeInTheDocument();
  });

  it('requests only received messages in Responses and preserves multiline reply text', async () => {
    const requests: URL[] = [];
    server.use(http.get(`${BASE}/messaging/leads/:id/history`, ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json(ok([{
        _id: 'reply-1', direction: 'inbound', channel: 'sms', status: 'received', provider: 'textbee',
        createdAt: new Date().toISOString(), rendered: { bodyText: 'Interested in pricing.\nPlease call tomorrow after 3 pm.' },
      }]));
    }));
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');
    const user = userEvent.setup();
    await user.click(within(drawer).getByRole('tab', { name: 'Responses' }));
    const reply = await within(drawer).findByText(/Interested in pricing/);
    expect(reply).toHaveTextContent('Please call tomorrow after 3 pm.');
    expect(reply).toHaveClass('whitespace-pre-wrap');
    expect(requests.every(url => url.searchParams.get('status') === 'received')).toBe(true);
    expect(within(drawer).queryByRole('combobox', { name: 'History status' })).not.toBeInTheDocument();
    await user.click(within(drawer).getByRole('tab', { name: 'Activity' }));
    expect(await within(drawer).findByRole('combobox', { name: 'History status' })).toBeInTheDocument();
    await waitFor(() => expect(requests.some(url => !url.searchParams.has('status'))).toBe(true));
  });

  it('shows automatic notes under AI Calls and lead answers under Responses', async () => {
    server.use(http.get(`${BASE}/ai-calling/leads/:id/history`, () => HttpResponse.json(ok([{
      _id: 'call-1', internalCallId: 'call_test', attemptNumber: 1, state: 'completed', disposition: 'answered_completed',
      durationSeconds: 45, campaignId: { _id: 'campaign-1', name: 'Pricing follow-up' },
      answers: [{ questionFieldKey: 'need', label: 'Lead need', rawAnswer: 'We need five seats.', normalizedValue: 'Five seats', validation: 'valid' }],
      callNotes: { description: 'Discussed the team plan.', summary: 'Send a quote for five seats.', blockers: ['Budget approval pending'], source: 'ai_agent', generatedAt: new Date().toISOString() },
    }]))));
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');
    const user = userEvent.setup();
    await user.click(within(drawer).getByRole('tab', { name: 'AI Calls' }));
    expect(await within(drawer).findByText('Send a quote for five seats.')).toBeInTheDocument();
    expect(within(drawer).getByText('Discussed the team plan.')).toBeInTheDocument();
    expect(within(drawer).getByText('Budget approval pending')).toBeInTheDocument();
    expect(within(drawer).queryByText('AI calling consent')).not.toBeInTheDocument();
    await user.click(within(drawer).getByRole('tab', { name: 'Responses' }));
    expect(await within(drawer).findByText('We need five seats.')).toBeInTheDocument();
  });

  it('offers Email, SMS, and WhatsApp when the lead has the data and the user has the rights', async () => {
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');

    expect(await within(drawer).findByRole('button', { name: 'Email' })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'SMS' })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'WhatsApp' })).toBeInTheDocument();
    // The plain phone/website actions are still links, not the composer buttons.
    expect(within(drawer).getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+41441234567');
  });

  it('hides WhatsApp when the lead has no usable phone', async () => {
    const drawer = await openDrawer('lead-no-phone', 'Basel Dental GmbH');

    expect(await within(drawer).findByRole('button', { name: 'Email' })).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'SMS' })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'WhatsApp' })).not.toBeInTheDocument();
  });

  it('hides Email when the lead has no email address', async () => {
    const drawer = await openDrawer('lead-no-email', 'Chur Yoga Studio');

    expect(await within(drawer).findByRole('button', { name: 'WhatsApp' })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'SMS' })).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Email' })).not.toBeInTheDocument();
  });

  it('hides all outreach actions when the user lacks the permissions', async () => {
    auth.permissions = ['lead:read'];
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');

    // Wait for the body to settle (Call still appears for a read-only user).
    expect(await within(drawer).findByRole('link', { name: 'Call' })).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Email' })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'SMS' })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'WhatsApp' })).not.toBeInTheDocument();
  });

  it('opens the unified email campaign composer for exactly that lead', async () => {
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');
    const user = userEvent.setup();

    await user.click(await within(drawer).findByRole('button', { name: 'Email' }));

    const dialogs = await screen.findAllByRole('dialog');
    const composer = dialogs.find((dialog) => within(dialog).queryByText('New outreach campaign'));
    expect(composer).toBeDefined();
    expect(within(composer!).getByLabelText('Subject')).toBeInTheDocument();
    expect(within(composer!).getByRole('button', { name: 'Email' })).toHaveClass('text-primary');
  });

  it('uses the Meta template composer and never opens a WhatsApp Web deep link', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');
    const user = userEvent.setup();

    await user.click(await within(drawer).findByRole('button', { name: 'WhatsApp' }));
    expect(await screen.findByText(/Select a Meta-approved WhatsApp template/)).toBeInTheDocument();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('shows the communication history: e-mail panel + contact-log entries', async () => {
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');
    await userEvent.setup().click(within(drawer).getByRole('tab', { name: 'Activity' }));

    // The shared e-mail history panel renders its (empty) state.
    expect(await within(drawer).findByText('No emails sent')).toBeInTheDocument();
    // The contact-log entries render with their notes/subjects.
    expect(within(drawer).getByText('Sent intro on WhatsApp')).toBeInTheDocument();
    expect(within(drawer).getByText('Called about pricing')).toBeInTheDocument();
  });

  it('shows effective channel consent and hides management from read-only users', async () => {
    auth.permissions = ['lead:read'];
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');
    await userEvent.setup().click(within(drawer).getByRole('tab', { name: 'Consent' }));

    expect(await within(drawer).findByText('Channel consent')).toBeInTheDocument();
    expect(within(drawer).getByText('Consent granted')).toBeInTheDocument();
    expect(within(drawer).getAllByText('Consent not recorded')).toHaveLength(2);
    expect(within(drawer).getAllByText('Contact available')).toHaveLength(3);
    expect(within(drawer).queryByRole('button', { name: /Manage Email consent/ })).not.toBeInTheDocument();
  });

  it('separates contact availability from consent and exposes a clear recording action', async () => {
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');
    await userEvent.setup().click(within(drawer).getByRole('tab', { name: 'Consent' }));

    expect(await within(drawer).findByText('Channel consent')).toBeInTheDocument();
    expect(within(drawer).getAllByText('Contact available')).toHaveLength(3);
    expect(within(drawer).getAllByText('Consent not recorded')).toHaveLength(2);
    expect(within(drawer).getByRole('button', { name: 'Record SMS consent' })).toHaveTextContent('Record consent');
    expect(within(drawer).getByRole('button', { name: 'Record WhatsApp consent' })).toHaveTextContent('Record consent');
  });

  it('requires administrator confirmation before releasing a suppression', async () => {
    auth.permissions.push('crm:admin');
    const reinstatements: unknown[] = [];
    server.use(
      http.get(`${BASE}/messaging/leads/:id/consent`, ({ params }) => HttpResponse.json(ok({
        leadId: String(params.id),
        channels: [
          { channel: 'email', status: 'granted', effectiveStatus: 'suppressed', hasDestination: true, evidence: 'Earlier form', source: 'signed_form', capturedAt: '2026-09-01T10:00:00.000Z', suppression: { active: true, reason: 'opt_out', source: 'email_unsubscribe', suppressedAt: '2026-10-01T10:00:00.000Z' } },
          { channel: 'sms', status: 'unknown', effectiveStatus: 'unknown', hasDestination: true, evidence: '', suppression: null },
          { channel: 'whatsapp', status: 'unknown', effectiveStatus: 'unknown', hasDestination: true, evidence: '', suppression: null },
        ],
      }))),
      http.post(`${BASE}/messaging/leads/:id/consent/reinstate`, async ({ request }) => {
        reinstatements.push(await request.json());
        return HttpResponse.json(ok({ channel: 'email', status: 'granted' }));
      }),
    );
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');
    await userEvent.setup().click(within(drawer).getByRole('tab', { name: 'Consent' }));
    const user = userEvent.setup();

    await user.click(await within(drawer).findByRole('button', { name: 'Manage Email consent' }));
    const editor = await screen.findByRole('dialog', { name: 'Manage Email consent' });
    const save = within(editor).getByRole('button', { name: 'Verify and reinstate' });
    expect(save).toBeDisabled();
    await user.clear(within(editor).getByLabelText(/Evidence \*/));
    await user.type(within(editor).getByLabelText(/Evidence \*/), 'Signed renewed opt-in form received today');
    await user.click(within(editor).getByRole('checkbox'));
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() => expect(reinstatements).toEqual([expect.objectContaining({
      channel: 'email', confirmation: true, evidence: 'Signed renewed opt-in form received today',
    })]));
  }, 20_000);

  it('filters provider history by an explicitly selected campaign', async () => {
    const requests: string[] = [];
    server.use(http.get(`${BASE}/messaging/leads/:id/history`, ({ request }) => {
      requests.push(request.url);
      return HttpResponse.json(ok([]));
    }));
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');
    await userEvent.setup().click(within(drawer).getByRole('tab', { name: 'Activity' }));
    const user = userEvent.setup();

    await user.click(await within(drawer).findByRole('combobox', { name: 'History campaign' }));
    await user.click(await screen.findByRole('option', { name: 'October nurture' }));

    await waitFor(() => expect(requests.some((url) => url.includes('campaignId=507f1f77bcf86cd799439011'))).toBe(true));
    expect(within(drawer).getByRole('button', { name: /Clear 1/ })).toBeInTheDocument();
  });

  it('shows an empty state when there is no contact log', async () => {
    server.use(http.get(`${L}/:id/contact-log`, () => HttpResponse.json(ok([]))));
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');
    await userEvent.setup().click(within(drawer).getByRole('tab', { name: 'Activity' }));

    expect(await within(drawer).findByText('No communication logged yet.')).toBeInTheDocument();
  });
});
