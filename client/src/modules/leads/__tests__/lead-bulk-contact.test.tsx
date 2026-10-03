import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import type { AxiosResponse } from 'axios';
import { server } from './mocks/server';
import { server as tasksServer } from '../../tasks/__tests__/mocks/server';
import { BASE } from './mocks/handlers';
import { makeLeadDTO, ok, okPage } from './mocks/data';

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

// The bulk e-mail send path goes through emailService. Mock it so the test can
// assert exactly what each eligible lead was sent, without hitting the network.
const emailMocks = vi.hoisted(() => ({
  send: vi.fn(),
  listTemplates: vi.fn(),
  renderTemplate: vi.fn(),
}));
vi.mock('@/modules/doctpl/services/EmailService', () => ({ emailService: emailMocks }));

// `leads.*` resolves to the English fallback; `common.*`/`doctpl.*` come from the
// real English dictionary. Placeholders are interpolated.
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

const auth = vi.hoisted(() => ({
  permissions: ['lead:read', 'lead:write', 'lead:delete', 'crm:write', 'lead:whatsapp'] as string[],
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

import { LeadListView } from '../ui/lead-list-view';
import { useLeadsStore } from '../state/leads-store';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const L = `${BASE}/crm/leads`;

// A: valid e-mail + usable phone (eligible for both).
const LEAD_A = makeLeadDTO({
  id: 'lead-a',
  name: 'Alpine Bakery AG',
  email: 'info@alpine.ch',
  phone: '+41 44 123 45 67',
  normalizedPhone: null,
});
// B: no e-mail, no phone (skipped by both).
const LEAD_B = makeLeadDTO({
  id: 'lead-b',
  name: 'Basel Dental GmbH',
  email: null,
  phone: null,
  mobile: null,
  normalizedPhone: null,
});
// C: malformed e-mail, usable phone (invalid e-mail, eligible WhatsApp).
const LEAD_C = makeLeadDTO({
  id: 'lead-c',
  name: 'Chur Yoga Studio',
  email: 'not-an-email',
  phone: '+41 81 555 00 11',
  normalizedPhone: null,
});
const LEADS = [LEAD_A, LEAD_B, LEAD_C];

let whatsappCalls: Array<{ id: string; body: Record<string, unknown> }> = [];
let openSpy: ReturnType<typeof vi.spyOn>;

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
  whatsappCalls = [];
  openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
  auth.permissions = ['lead:read', 'lead:write', 'lead:delete', 'crm:write', 'lead:whatsapp'];
  useLeadsStore.getState().reset();
  emailMocks.send.mockResolvedValue({ data: { _id: 'rec-1' } });
  emailMocks.listTemplates.mockResolvedValue({ data: [] });
  emailMocks.renderTemplate.mockResolvedValue({ data: { subject: 'Tpl', bodyHtml: '<p>Tpl</p>' } });
  server.use(
    http.get(L, () => HttpResponse.json(okPage(LEADS))),
    http.get(`${BASE}/users/directory`, () => HttpResponse.json(ok([]))),
    http.get(`${L}/:id/contact-log`, () => HttpResponse.json(ok([]))),
    http.get(`${BASE}/doctpl/emails`, () => HttpResponse.json(ok([]))),
    http.post(`${L}/:id/whatsapp`, async ({ params, request }) => {
      whatsappCalls.push({ id: String(params.id), body: (await request.json()) as Record<string, unknown> });
      return HttpResponse.json(ok({ waNumber: '41441234567', logged: true }));
    }),
  );
});

function renderLeadList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  render(<LeadListView />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <NuqsTestingAdapter hasMemory>{children}</NuqsTestingAdapter>
      </QueryClientProvider>
    ),
  });
  return { user, queryClient };
}

const findRow = async (name: string) => {
  const cell = await screen.findByText(name);
  const row = cell.closest('tr');
  if (!row) throw new Error(`No table row found for "${name}"`);
  return row as HTMLElement;
};

const selectAllThree = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(within(await findRow('Alpine Bakery AG')).getByRole('checkbox'));
  await user.click(within(await findRow('Basel Dental GmbH')).getByRole('checkbox'));
  await user.click(within(await findRow('Chur Yoga Studio')).getByRole('checkbox'));
  return screen.findByRole('region', { name: 'Bulk actions' });
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('lead bulk contact — Email', () => {
  it('opens the dialog with honest eligibility counts and queues one send per eligible lead', async () => {
    const { user } = renderLeadList();
    const bar = await selectAllThree(user);

    await user.click(within(bar).getByRole('button', { name: 'Email' }));

    const dialog = await screen.findByRole('dialog');
    // 1 of 3 can be e-mailed; 1 missing, 1 invalid.
    expect(within(dialog).getAllByText('1 of 3 selected leads can be emailed').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('1 lead(s) without an email address will be skipped')).toBeInTheDocument();
    expect(within(dialog).getByText('1 lead(s) with an invalid email address will be skipped')).toBeInTheDocument();

    // Compose a custom message (no templates mocked → custom mode). The body is
    // set via fireEvent so the `{{businessName}}` token survives userEvent's own
    // `{{` escaping.
    await user.type(within(dialog).getByLabelText('Subject'), 'Hello there');
    fireEvent.change(within(dialog).getByLabelText('Message'), { target: { value: 'Hi {{businessName}}' } });

    await user.click(within(dialog).getByRole('button', { name: /Send 1 email/ }));

    // Exactly one send, for the only eligible lead, tagged as a lead source.
    await waitFor(() => expect(emailMocks.send).toHaveBeenCalledTimes(1));
    expect(emailMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['info@alpine.ch'],
        sourceModule: 'lead',
        sourceRecordId: 'lead-a',
      }),
    );
    // Per-lead personalisation resolved {{businessName}} to the lead's name.
    expect(String(emailMocks.send.mock.calls[0][0].bodyHtml)).toContain('Alpine Bakery AG');

    // Truthful summary (queued, never "delivered").
    expect(await within(dialog).findByText('1 sent, 0 failed')).toBeInTheDocument();
  });

  it('reports failed recipients when a send rejects', async () => {
    emailMocks.send.mockRejectedValueOnce(new Error('smtp down'));
    const { user } = renderLeadList();
    const bar = await selectAllThree(user);

    await user.click(within(bar).getByRole('button', { name: 'Email' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Subject'), 'Subject');
    fireEvent.change(within(dialog).getByLabelText('Message'), { target: { value: 'Body' } });
    await user.click(within(dialog).getByRole('button', { name: /Send 1 email/ }));

    expect(await within(dialog).findByText('0 sent, 1 failed')).toBeInTheDocument();
    expect(within(dialog).getByText('info@alpine.ch')).toBeInTheDocument();
  });
});

describe('lead bulk contact — WhatsApp', () => {
  it('opens the dialog with eligibility and opens + logs one chat at a time', async () => {
    const { user } = renderLeadList();
    const bar = await selectAllThree(user);

    await user.click(within(bar).getByRole('button', { name: 'WhatsApp' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText('2 of 3 selected leads can be messaged').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('1 lead(s) without a usable phone number will be skipped')).toBeInTheDocument();
    // The honest deep-link caveat is always shown.
    expect(within(dialog).getByText(/browser blocks opening many tabs/i)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Open WhatsApp' }));

    // Opened a wa.me deep link for the first eligible lead…
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
    expect(String(openSpy.mock.calls[0][0])).toContain('https://web.whatsapp.com/send?phone=41441234567');
    // …and logged the intent for that lead.
    await waitFor(() => expect(whatsappCalls).toHaveLength(1));
    expect(whatsappCalls[0].id).toBe('lead-a');
    expect(String(whatsappCalls[0].body.message)).toContain('Alpine Bakery AG');

    // Stepper advanced to the second eligible lead (Chur Yoga Studio).
    expect(await within(dialog).findByText('Chur Yoga Studio')).toBeInTheDocument();
  });

  it('copies every eligible wa.me link at once', async () => {
    // userEvent.setup() (inside renderLeadList) installs its own clipboard stub,
    // so spy on that rather than redefining navigator.clipboard.
    const { user } = renderLeadList();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText');
    const bar = await selectAllThree(user);

    await user.click(within(bar).getByRole('button', { name: 'WhatsApp' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Copy links' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copied = String(writeText.mock.calls[0][0]);
    expect(copied).toContain('https://web.whatsapp.com/send?phone=41441234567');
    expect(copied).toContain('https://web.whatsapp.com/send?phone=41815550011');
  });
});

describe('lead bulk contact — permissions', () => {
  it('hides Email without crm:write and WhatsApp without lead:whatsapp', async () => {
    auth.permissions = ['lead:read'];
    const { user } = renderLeadList();
    await user.click(within(await findRow('Alpine Bakery AG')).getByRole('checkbox'));
    const bar = await screen.findByRole('region', { name: 'Bulk actions' });

    expect(within(bar).queryByRole('button', { name: 'Email' })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'WhatsApp' })).not.toBeInTheDocument();
  });
});
