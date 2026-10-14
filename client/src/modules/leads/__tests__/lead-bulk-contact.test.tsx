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
  showSuccess: vi.fn(), showError: vi.fn(), showLoading: vi.fn(), dismissToast: vi.fn(), showPromise: vi.fn(),
}));

vi.mock('@/lib/i18n/language-context', async () => {
  const { translations } = await import('@/lib/i18n/translations');
  const dictionary = (translations as unknown as Record<string, Record<string, string>>).en;
  const t = (key: string, fallback?: string | null, vars?: Record<string, unknown>) => {
    const raw = key.startsWith('leads.') ? fallback : (dictionary[key] ?? fallback);
    const value = raw ?? key;
    return vars ? value.replace(/\{(\w+)\}/g, (_, name) => (vars[name] != null ? String(vars[name]) : `{${name}}`)) : value;
  };
  const context = { locale: 'en', language: 'en', dir: 'ltr', isRTL: false, t };
  return { useLanguage: () => context, LanguageProvider: ({ children }: { children: ReactNode }) => children };
});

const auth = vi.hoisted(() => ({
  permissions: ['lead:read', 'lead:write', 'lead:delete', 'crm:write', 'lead:whatsapp'] as string[],
}));

vi.mock('@/stores/auth-store', () => {
  const state = {
    user: { id: 'u-me', get permissions() { return auth.permissions; } },
    isAuthenticated: true, isLoading: false, accessToken: null,
  };
  const useAuthStore = Object.assign(
    (selector?: (value: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => ({ ...state, setTokens: vi.fn(), setAuth: vi.fn(), clearAuth: vi.fn() }) },
  );
  return { useAuthStore };
});

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => <a href={href} {...props}>{children}</a>,
}));

import { LeadListView } from '../ui/lead-list-view';
import { useLeadsStore } from '../state/leads-store';

const LEADS_URL = `${BASE}/crm/leads`;
const LEADS = [
  makeLeadDTO({ id: 'lead-a', name: 'Alpine Bakery AG', email: 'info@alpine.ch', phone: '+41 44 123 45 67' }),
  makeLeadDTO({ id: 'lead-b', name: 'Basel Dental GmbH', email: null, phone: null, mobile: null }),
  makeLeadDTO({ id: 'lead-c', name: 'Chur Yoga Studio', email: 'not-an-email', phone: '+41 81 555 00 11' }),
];

let campaignRequests: Array<Record<string, unknown>> = [];
let startCalls = 0;
let removeCalls = 0;

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

beforeEach(() => {
  vi.clearAllMocks();
  campaignRequests = [];
  startCalls = 0;
  removeCalls = 0;
  auth.permissions = ['lead:read', 'lead:write', 'lead:delete', 'crm:write', 'lead:whatsapp'];
  useLeadsStore.getState().reset();
  server.use(
    http.get(LEADS_URL, () => HttpResponse.json(okPage(LEADS))),
    http.get(`${BASE}/users/directory`, () => HttpResponse.json(ok([]))),
    http.get(`${LEADS_URL}/:id/contact-log`, () => HttpResponse.json(ok([]))),
    http.get(`${BASE}/doctpl/emails`, () => HttpResponse.json(ok([]))),
    http.get(`${BASE}/messaging/templates`, () => HttpResponse.json(ok([]))),
    http.post(`${BASE}/messaging/campaigns`, async ({ request }) => {
      const body = await request.json() as Record<string, unknown>;
      campaignRequests.push(body);
      const selection = body.selection as { leadIds?: string[] };
      return HttpResponse.json(ok({
        _id: 'campaign-1', name: body.name, channel: body.channel, status: 'draft',
        summary: { total: selection.leadIds?.length ?? 3, eligible: 1, ineligible: 1, queued: 0, accepted: 0, sent: 0, delivered: 0, read: 0, failed: 0, unknown: 0, suppressed: 1 },
      }));
    }),
    http.post(`${BASE}/messaging/campaigns/campaign-1/start`, () => {
      startCalls += 1;
      return HttpResponse.json(ok({
        _id: 'campaign-1', name: 'Campaign', channel: 'email', status: 'queued',
        summary: { total: 2, eligible: 1, ineligible: 1, queued: 1, accepted: 0, sent: 0, delivered: 0, read: 0, failed: 0, unknown: 0, suppressed: 0 },
      }));
    }),
    http.get(`${BASE}/messaging/campaigns/campaign-1/recipients`, () => HttpResponse.json({
      success: true,
      data: [{
        _id: 'recipient-1', channel: 'email', status: 'draft', destination: 'info@alpine.ch',
        leadId: { _id: 'lead-a', leadNumber: 'L-00001', name: 'Alpine Bakery AG' },
        eligibility: { eligible: true, reasons: [] }, createdAt: new Date().toISOString(),
      }],
      pagination: { page: 1, limit: 25, total: 1, pages: 1 },
    })),
    http.delete(`${BASE}/messaging/campaigns/campaign-1/recipients/recipient-1`, () => {
      removeCalls += 1;
      return HttpResponse.json(ok({
        _id: 'campaign-1', name: 'Campaign', channel: 'email', status: 'draft',
        summary: { total: 0, eligible: 0, ineligible: 0, queued: 0, accepted: 0, sent: 0, delivered: 0, read: 0, failed: 0, unknown: 0, suppressed: 0 },
      }));
    }),
  );
});

function renderLeadList() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const user = userEvent.setup();
  render(<LeadListView />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}><NuqsTestingAdapter hasMemory>{children}</NuqsTestingAdapter></QueryClientProvider>
    ),
  });
  return user;
}

async function row(name: string) {
  const element = await screen.findByText(name);
  const result = element.closest('tr');
  if (!result) throw new Error(`Missing row for ${name}`);
  return result as HTMLElement;
}

async function selectAll(user: ReturnType<typeof userEvent.setup>) {
  for (const lead of LEADS) await user.click(within(await row(String(lead.name))).getByRole('checkbox'));
  return screen.findByRole('region', { name: 'Bulk actions' });
}

describe('lead outreach campaigns', () => {
  it('creates an explicit email draft, lets the user remove a recipient, then queues it', async () => {
    const user = renderLeadList();
    const bar = await selectAll(user);
    await user.click(within(bar).getByRole('button', { name: 'Email' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Subject'), 'A proper introduction');
    fireEvent.change(within(dialog).getByLabelText('Message'), { target: { value: 'Hello {{businessName}}' } });
    fireEvent.change(within(dialog).getByLabelText('HTML content (optional)'), { target: { value: '<p>Hello <strong>{{businessName}}</strong></p>' } });
    await user.click(within(dialog).getByRole('button', { name: /Recipients/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Remove Basel Dental GmbH' }));
    expect(within(dialog).getByText('2 selected')).toBeInTheDocument();
    expect(within(dialog).getByText(/Hello Alpine Bakery AG/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /Preview eligibility/ }));
    expect(await within(dialog).findByText('Review and confirm')).toBeInTheDocument();
    expect(within(dialog).getByText('Suppressed')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Confirm and send/ }));

    await waitFor(() => expect(startCalls).toBe(1));
    expect(campaignRequests).toHaveLength(1);
    expect(campaignRequests[0]).toMatchObject({
      channel: 'email', purpose: 'promotional',
      selection: { mode: 'explicit', leadIds: ['lead-a', 'lead-c'] },
      content: {
        subject: 'A proper introduction', bodyText: 'Hello {{businessName}}',
        bodyHtml: '<p>Hello <strong>{{businessName}}</strong></p>',
      },
    });
  }, 20_000);

  it('shows SMS segment information and submits an explicitly opted-in fallback policy', async () => {
    const user = renderLeadList();
    await user.click(within(await row('Alpine Bakery AG')).getByRole('checkbox'));
    const bar = await screen.findByRole('region', { name: 'Bulk actions' });
    await user.click(within(bar).getByRole('button', { name: 'SMS' }));

    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Message'), { target: { value: 'Hello by SMS' } });
    expect(within(dialog).getByText('12 characters · ~1 segment')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Recipients/ }));
    await user.click(within(dialog).getByRole('checkbox', { name: /Allow policy-controlled Twilio fallback/ }));
    await user.click(within(dialog).getByRole('button', { name: /Preview eligibility/ }));

    await waitFor(() => expect(campaignRequests).toHaveLength(1));
    expect(campaignRequests[0]).toMatchObject({ channel: 'sms', routing: { smsProvider: 'auto', allowFallback: true } });
  });

  it('lets the user inspect and remove a server-snapshotted recipient before sending', async () => {
    const user = renderLeadList();
    await user.click(within(await row('Alpine Bakery AG')).getByRole('checkbox'));
    const bar = await screen.findByRole('region', { name: 'Bulk actions' });
    await user.click(within(bar).getByRole('button', { name: 'Email' }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Subject'), 'Review first');
    fireEvent.change(within(dialog).getByLabelText('Message'), { target: { value: 'Hello' } });
    await user.click(within(dialog).getByRole('button', { name: /Recipients/ }));
    await user.click(within(dialog).getByRole('button', { name: /Preview eligibility/ }));

    expect(await within(dialog).findByText('Snapshotted recipients')).toBeInTheDocument();
    await user.click(await within(dialog).findByRole('button', { name: 'Remove Alpine Bakery AG from draft' }));

    await waitFor(() => expect(removeCalls).toBe(1));
    expect(within(dialog).getByRole('button', { name: /Confirm and send/ })).toBeDisabled();
  });

  it('requires an approved Meta template and never opens a WhatsApp Web deep link', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const user = renderLeadList();
    await user.click(within(await row('Alpine Bakery AG')).getByRole('checkbox'));
    const bar = await screen.findByRole('region', { name: 'Bulk actions' });
    await user.click(within(bar).getByRole('button', { name: 'WhatsApp' }));

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Select a Meta-approved WhatsApp template/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /Recipients/ })).toBeDisabled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('hides every outreach channel without CRM write permissions', async () => {
    auth.permissions = ['lead:read'];
    const user = renderLeadList();
    await user.click(within(await row('Alpine Bakery AG')).getByRole('checkbox'));
    const bar = await screen.findByRole('region', { name: 'Bulk actions' });
    expect(within(bar).queryByRole('button', { name: 'Email' })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'SMS' })).not.toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'WhatsApp' })).not.toBeInTheDocument();
  });
});
