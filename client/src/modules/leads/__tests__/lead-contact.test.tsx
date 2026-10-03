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

let whatsappCalls: Array<Record<string, unknown>> = [];
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
  auth.permissions = ['lead:read', 'lead:write', 'lead:convert', 'lead:delete', 'crm:write', 'lead:whatsapp'];
  server.use(
    http.get(`${L}/:id/contact-log`, () => HttpResponse.json(ok(CONTACT_LOG))),
    http.post(`${L}/:id/whatsapp`, async ({ request }) => {
      whatsappCalls.push((await request.json()) as Record<string, unknown>);
      return HttpResponse.json(ok({ waNumber: '41441234567', logged: true }));
    }),
    http.get(`${L}/:id`, ({ params }) => HttpResponse.json(ok(leadFor(params.id)))),
    http.get(`${D}/emails`, () => HttpResponse.json(ok([]))),
    http.get(`${D}/email-templates`, () => HttpResponse.json(ok([]))),
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
  it('offers Email + WhatsApp when the lead has the data and the user has the rights', async () => {
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');

    expect(await within(drawer).findByRole('button', { name: 'Email' })).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'WhatsApp' })).toBeInTheDocument();
    // The plain phone/website actions are still links, not the composer buttons.
    expect(within(drawer).getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+41441234567');
  });

  it('hides WhatsApp when the lead has no usable phone', async () => {
    const drawer = await openDrawer('lead-no-phone', 'Basel Dental GmbH');

    expect(await within(drawer).findByRole('button', { name: 'Email' })).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'WhatsApp' })).not.toBeInTheDocument();
  });

  it('hides Email when the lead has no email address', async () => {
    const drawer = await openDrawer('lead-no-email', 'Chur Yoga Studio');

    expect(await within(drawer).findByRole('button', { name: 'WhatsApp' })).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Email' })).not.toBeInTheDocument();
  });

  it('hides both actions when the user lacks the permissions', async () => {
    auth.permissions = ['lead:read'];
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');

    // Wait for the body to settle (Call still appears for a read-only user).
    expect(await within(drawer).findByRole('link', { name: 'Call' })).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Email' })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'WhatsApp' })).not.toBeInTheDocument();
  });

  it('opens the email composer pre-filled with the lead address', async () => {
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');
    const user = userEvent.setup();

    await user.click(await within(drawer).findByRole('button', { name: 'Email' }));

    // The composer opened with the lead's e-mail already in the To field.
    expect(await screen.findByDisplayValue('info@example.ch')).toBeInTheDocument();
  });

  it('opens WhatsApp with the resolved message and logs the intent', async () => {
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');
    const user = userEvent.setup();

    await user.click(await within(drawer).findByRole('button', { name: 'WhatsApp' }));
    const dialog = await screen.findByRole('dialog', { name: 'Send a WhatsApp message' });
    await user.click(within(dialog).getByRole('button', { name: 'Open WhatsApp' }));

    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
    const url = String(openSpy.mock.calls[0][0]);
    // wa.me number is digits only, and {{businessName}} resolved to the lead name.
    expect(url).toContain('https://web.whatsapp.com/send?phone=41441234567');
    expect(url).toContain('Alpine%20Bakery%20AG');

    // The intent was logged to the backend with the resolved message.
    await waitFor(() => expect(whatsappCalls).toHaveLength(1));
    expect(String(whatsappCalls[0].message)).toContain('Alpine Bakery AG');
  });

  it('shows the communication history: e-mail panel + contact-log entries', async () => {
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');

    // The shared e-mail history panel renders its (empty) state.
    expect(await within(drawer).findByText('No emails sent')).toBeInTheDocument();
    // The contact-log entries render with their notes/subjects.
    expect(within(drawer).getByText('Sent intro on WhatsApp')).toBeInTheDocument();
    expect(within(drawer).getByText('Called about pricing')).toBeInTheDocument();
  });

  it('shows an empty state when there is no contact log', async () => {
    server.use(http.get(`${L}/:id/contact-log`, () => HttpResponse.json(ok([]))));
    const drawer = await openDrawer('lead-full', 'Alpine Bakery AG');

    expect(await within(drawer).findByText('No communication logged yet.')).toBeInTheDocument();
  });
});
