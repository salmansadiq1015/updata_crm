import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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

// ── Module mocks ─────────────────────────────────────────────────────────────

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

// `common.*` strings come from the real English dictionary (the shared table
// footer asks for them); `leads.*` always resolves to the English fallback in
// the component, so these tests do not depend on dictionary wording.
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

// Callable store hook (selector or whole state) so useAuthStore(selector) and
// usePermissions() both work; the user may do everything on leads.
vi.mock('@/stores/auth-store', () => {
  const state = {
    user: {
      id: 'u-me',
      permissions: ['lead:read', 'lead:write', 'lead:convert', 'lead:delete', 'discovery:read', 'crm:write', 'lead:whatsapp', 'ai-calling:read', 'ai-calling:write'],
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
import { showSuccess } from '@/lib/toast';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const L = `${BASE}/crm/leads`;

const USERS = [
  { id: 'u-me', firstName: 'Mia', lastName: 'Meier', email: 'mia@example.ch', avatarUrl: null },
  { id: 'u-2', firstName: 'Noah', lastName: 'Frei', email: 'noah@example.ch', avatarUrl: null },
];

const LEAD_A = makeLeadDTO({
  id: 'lead-a',
  leadNumber: 'L-00001',
  name: 'Alpine Bakery AG',
  status: 'new',
  assignedTo: 'u-me',
  sourceMetadata: {
    googlePlaceId: 'ChIJ-alpine-bakery',
    discoverySessionId: 'sess-77',
    discoveryResultId: 'res-5',
    businessType: 'bakery',
    keyword: 'sourdough',
    discoveredAt: '2026-09-28T09:30:00.000Z',
  },
  address: {
    street: 'Bahnhofstrasse 1', area: 'Altstadt', postalCode: '8001', city: 'Zürich', canton: 'ZH', country: 'CH',
  },
});
// No phone, e-mail, website or coordinates: the drawer must not invent any.
const LEAD_B = makeLeadDTO({
  id: 'lead-b',
  leadNumber: 'L-00002',
  name: 'Basel Dental GmbH',
  status: 'qualified',
  source: 'manual',
  phone: null,
  email: null,
  website: null,
  websiteDomain: null,
  location: null,
  providerMeta: { rating: null, reviewCount: null, priceLevel: null },
  sourceMetadata: {
    googlePlaceId: null,
    discoverySessionId: null,
    discoveryResultId: null,
    businessType: null,
    keyword: null,
    discoveredAt: null,
  },
  address: { street: null, postalCode: null, city: 'Basel', canton: 'BS', country: 'CH' },
});
const LEAD_C = makeLeadDTO({
  id: 'lead-c',
  leadNumber: 'L-00003',
  name: 'Chur Yoga Studio',
  status: 'converted',
  convertedCustomerId: 'cust-9',
  convertedAt: '2026-09-30T08:00:00.000Z',
});
const LEADS = [LEAD_A, LEAD_B, LEAD_C];

// ── Harness ──────────────────────────────────────────────────────────────────

beforeAll(() => {
  // The shared vitest setup starts the tasks module's MSW server for every
  // file. Left running next to this one it would warn about every leads request
  // and hand body-less requests to the handlers twice, so stand it down here.
  tasksServer.close();
  server.listen({ onUnhandledRequest: 'bypass' });
  // jsdom lacks what Radix popovers/selects measure with.
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
  useLeadsStore.getState().reset();
  server.use(
    http.get(L, () => HttpResponse.json(okPage(LEADS))),
    http.get(`${L}/filter-options`, () => HttpResponse.json(ok({
      countries: [
        { id: 'country:CH', value: 'Switzerland', code: 'CH', count: 2 },
        { id: 'country:FR', value: 'France', code: 'FR', count: 1 },
      ],
      cities: [
        { id: 'city:111111111111111111111111', value: 'Basel', countryId: 'country:CH', country: 'Switzerland', countryCode: 'CH', count: 1 },
        { id: 'city:222222222222222222222222', value: 'Zürich', countryId: 'country:CH', country: 'Switzerland', countryCode: 'CH', count: 1 },
        { id: 'city:444444444444444444444444', value: 'Paris', countryId: 'country:FR', country: 'France', countryCode: 'FR', count: 1 },
      ],
      areas: [
        { id: 'area:333333333333333333333333', value: 'Altstadt', type: 'neighborhood', cityId: 'city:222222222222222222222222', city: 'Zürich', countryId: 'country:CH', country: 'Switzerland', countryCode: 'CH', count: 1 },
        { id: 'area:555555555555555555555555', value: 'Bercy', type: 'neighborhood', cityId: 'city:444444444444444444444444', city: 'Paris', countryId: 'country:FR', country: 'France', countryCode: 'FR', count: 1 },
      ],
      types: [
        { value: 'business', count: 3 },
        { value: 'private', count: 0 },
      ],
    }))),
    http.get(`${BASE}/users/directory`, () => HttpResponse.json(ok(USERS))),
    // The detail drawer's Communication section loads these when it opens.
    http.get(`${L}/:id/contact-log`, () => HttpResponse.json(ok([]))),
    http.get(`${BASE}/doctpl/emails`, () => HttpResponse.json(ok([]))),
    http.get(`${BASE}/messaging/leads/:id/history`, () => HttpResponse.json(ok([]))),
  );
});

function renderLeadList() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  const view = render(<LeadListView />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <NuqsTestingAdapter hasMemory>{children}</NuqsTestingAdapter>
      </QueryClientProvider>
    ),
  });
  return { user, queryClient, ...view };
}

const findRow = async (name: string) => {
  const cell = await screen.findByText(name);
  const row = cell.closest('tr');
  if (!row) throw new Error(`No table row found for "${name}"`);
  return row as HTMLElement;
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('LeadListView', () => {
  it('renders the leads with their columns and status badges', async () => {
    renderLeadList();

    const table = await screen.findByRole('table');
    expect(await within(table).findByText('Alpine Bakery AG')).toBeInTheDocument();
    expect(within(table).getByText('Basel Dental GmbH')).toBeInTheDocument();
    expect(within(table).getByText('Chur Yoga Studio')).toBeInTheDocument();

    for (const header of ['Lead #', 'Name', 'Email', 'Phone', 'Status', 'Type', 'Source', 'Area', 'City', 'Country', 'Rating', 'Assigned to', 'Discovered']) {
      expect(within(table).getByRole('columnheader', { name: new RegExp(header, 'i') })).toBeInTheDocument();
    }

    // The real business category is the primary Type value (not the generic kind).
    expect(within(await findRow('Alpine Bakery AG')).getByText('Bakery')).toBeInTheDocument();
    expect(within(await findRow('Alpine Bakery AG')).getByText('Altstadt')).toBeInTheDocument();
    expect(within(await findRow('Alpine Bakery AG')).getByText('Zürich')).toBeInTheDocument();

    // Status is a labelled badge, never colour alone.
    expect(within(table).getByText('New')).toBeInTheDocument();
    expect(within(table).getByText('Qualified')).toBeInTheDocument();
    expect(within(table).getByText('Converted')).toBeInTheDocument();
    expect(within(table).getByText('L-00001')).toBeInTheDocument();
    // The assignee comes from the user directory.
    expect(await within(table).findByText('Mia Meier')).toBeInTheDocument();
  });

  it('validates and saves missing email and phone details directly from the table', async () => {
    const patches: Array<{ id: string; body: Record<string, unknown> }> = [];
    server.use(
      http.patch(`${L}/:id`, async ({ params, request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        patches.push({ id: String(params.id), body });
        return HttpResponse.json(ok(makeLeadDTO({
          ...LEAD_B,
          id: String(params.id),
          ...body,
        })));
      }),
    );
    const { user } = renderLeadList();
    const row = await findRow('Basel Dental GmbH');

    expect(within(row).getByRole('button', { name: 'Add email for Basel Dental GmbH' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Add phone for Basel Dental GmbH' })).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Add email for Basel Dental GmbH' }));

    const dialog = await screen.findByRole('dialog', { name: 'Contact details for Basel Dental GmbH' });
    const email = within(dialog).getByLabelText('Email');
    const phone = within(dialog).getByLabelText('Phone');
    const save = within(dialog).getByRole('button', { name: 'Save' });

    await user.type(email, 'not-an-email');
    expect(within(dialog).getByText('Enter a valid email address')).toBeInTheDocument();
    expect(save).toBeDisabled();

    await user.clear(email);
    await user.type(email, 'Hello@Basel.CH');
    await user.type(phone, '12345');
    expect(within(dialog).getByText('Enter a valid phone number with country code')).toBeInTheDocument();
    expect(save).toBeDisabled();

    await user.clear(phone);
    await user.type(phone, '+41 61 555 01 02');
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() => expect(patches).toEqual([{
      id: 'lead-b',
      body: { email: 'Hello@basel.ch', phone: '+41 61 555 01 02' },
    }]));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Contact details for Basel Dental GmbH/ })).not.toBeInTheDocument());
    expect(within(await findRow('Basel Dental GmbH')).getByText('Hello@basel.ch')).toBeInTheDocument();
    expect(within(await findRow('Basel Dental GmbH')).getByText('+41 61 555 01 02')).toBeInTheDocument();
    expect(showSuccess).toHaveBeenCalledWith('Contact details updated');
  }, 20_000);

  it('asks the API for the first page with the default sort', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(L, ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json(okPage(LEADS));
      }),
    );
    renderLeadList();

    await screen.findByText('Alpine Bakery AG');
    const first = requests[0];
    expect(first.searchParams.get('limit')).toBe('25');
    expect(first.searchParams.get('sortBy')).toBe('createdAt');
    expect(first.searchParams.get('sortOrder')).toBe('desc');
    expect(first.searchParams.has('cursor')).toBe(false);
    expect(first.searchParams.has('q')).toBe(false);
  });

  it('sends the debounced search term to the API', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(L, ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json(okPage(LEADS));
      }),
    );
    const { user } = renderLeadList();
    await screen.findByText('Alpine Bakery AG');

    await user.type(screen.getByRole('searchbox', { name: 'Search leads' }), 'bakery');

    await waitFor(() => expect(requests[requests.length - 1].searchParams.get('q')).toBe('bakery'));
  });

  it('cascades database-backed country, city and area options and sends all exact filters to the API', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(L, ({ request }) => {
        requests.push(new URL(request.url));
        return HttpResponse.json(okPage(LEADS));
      }),
    );
    const { user } = renderLeadList();
    await screen.findByText('Alpine Bakery AG');

    const countryFilter = screen.getByRole('combobox', { name: 'Country' });
    await waitFor(() => expect(countryFilter).toBeEnabled());
    await user.click(countryFilter);
    await user.click(await screen.findByRole('option', { name: /Switzerland/ }));

    await user.click(screen.getByRole('combobox', { name: 'City' }));
    expect(await screen.findByRole('option', { name: /Zürich/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Paris/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /Zürich/ }));

    await user.click(screen.getByRole('combobox', { name: 'Area' }));
    expect(await screen.findByRole('option', { name: /Altstadt/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Bercy/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /Altstadt/ }));

    await user.click(screen.getByRole('combobox', { name: 'Lead type' }));
    await user.click(await screen.findByRole('option', { name: /Private/ }));

    await waitFor(() => {
      const last = requests[requests.length - 1];
      expect(last.searchParams.get('type')).toBe('private');
      expect(last.searchParams.get('countryId')).toBe('country:CH');
      expect(last.searchParams.get('cityId')).toBe('city:222222222222222222222222');
      expect(last.searchParams.get('areaId')).toBe('area:333333333333333333333333');
    });
  }, 20_000);

  it('clears an incompatible city and area when the country changes', async () => {
    const requests: URL[] = [];
    server.use(http.get(L, ({ request }) => {
      requests.push(new URL(request.url));
      return HttpResponse.json(okPage(LEADS));
    }));
    const { user } = renderLeadList();
    await screen.findByText('Alpine Bakery AG');

    const countryFilter = screen.getByRole('combobox', { name: 'Country' });
    await waitFor(() => expect(countryFilter).toBeEnabled());
    await user.click(countryFilter);
    await user.click(await screen.findByRole('option', { name: /Switzerland/ }));
    await user.click(screen.getByRole('combobox', { name: 'City' }));
    await user.click(await screen.findByRole('option', { name: /Zürich/ }));
    await user.click(screen.getByRole('combobox', { name: 'Area' }));
    await user.click(await screen.findByRole('option', { name: /Altstadt/ }));

    await waitFor(() => expect(countryFilter).toBeEnabled());
    await user.click(countryFilter);
    await user.click(await screen.findByRole('option', { name: /France/ }));

    await waitFor(() => {
      const last = requests[requests.length - 1];
      expect(last.searchParams.get('countryId')).toBe('country:FR');
      expect(last.searchParams.has('cityId')).toBe(false);
      expect(last.searchParams.has('areaId')).toBe(false);
    });
    expect(screen.getByRole('combobox', { name: 'City' })).toHaveTextContent('All cities');
    expect(screen.getByRole('combobox', { name: 'Area' })).toHaveTextContent('All areas');
  }, 20_000);

  it('pages forward with the cursor the API returned', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(L, ({ request }) => {
        const url = new URL(request.url);
        requests.push(url);
        return HttpResponse.json(
          url.searchParams.get('cursor') === 'cursor-2'
            ? okPage([LEAD_C])
            : okPage([LEAD_A, LEAD_B], { hasNext: true, nextCursor: 'cursor-2' }),
        );
      }),
    );
    const { user } = renderLeadList();
    await screen.findByText('Alpine Bakery AG');

    await user.click(screen.getByRole('button', { name: /^next/i }));

    expect(await screen.findByText('Chur Yoga Studio')).toBeInTheDocument();
    expect(screen.queryByText('Alpine Bakery AG')).not.toBeInTheDocument();
    expect(requests.some((url) => url.searchParams.get('cursor') === 'cursor-2')).toBe(true);

    // Going back is served from the pages already fetched.
    await user.click(screen.getByRole('button', { name: /^back/i }));
    expect(await screen.findByText('Alpine Bakery AG')).toBeInTheDocument();
  });

  describe('selection and bulk actions', () => {
    it.each(['single', 'bulk'])('assigns %s leads to a calling agent without replacing its existing leads', async mode => {
      const requests: Record<string, unknown>[] = [];
      const target = { _id: 'agent-support', name: 'Support intake', title: 'Support specialist', availability: 'active', version: 7, assignedLeadIds: ['previous-lead'], avatarUrl: null };
      server.use(
        http.get(`${BASE}/ai-calling/agents`, () => HttpResponse.json({ ...ok({ agents: [target], summary: {} }), pagination: { page: 1, pages: 1, total: 1, limit: 24 } })),
        http.get(`${BASE}/ai-calling/agents/agent-support`, () => HttpResponse.json(ok(target))),
        http.put(`${BASE}/ai-calling/agents/agent-support/leads`, async ({ request }) => {
          const body = await request.json() as { leadIds: string[]; version: number; mode: string }; requests.push(body);
          return HttpResponse.json(ok({ ...target, version: 8, assignedLeadIds: [...target.assignedLeadIds, ...body.leadIds] }));
        }),
      );
      const { user } = renderLeadList();
      const row = await findRow('Alpine Bakery AG');
      if (mode === 'single') {
        await user.click(within(row).getByRole('button', { name: 'Row actions' }));
        await user.click(await screen.findByRole('menuitem', { name: 'Assign to calling agent' }));
      } else {
        await user.click(within(row).getByRole('checkbox'));
        await user.click(within(await findRow('Basel Dental GmbH')).getByRole('checkbox'));
        await user.click(within(await screen.findByRole('region', { name: 'Bulk actions' })).getByRole('button', { name: 'Assign to agent' }));
      }
      const dialog = await screen.findByRole('dialog', { name: 'Assign leads to agent' });
      await user.click(await within(dialog).findByRole('radio', { name: 'Select Support intake' }));
      const count = mode === 'single' ? 1 : 2;
      const submit = within(dialog).getByRole('button', { name: `Assign ${count} ${count === 1 ? 'lead' : 'leads'}` });
      await waitFor(() => expect(submit).toBeEnabled()); await user.click(submit);
      await waitFor(() => expect(requests).toEqual([{ leadIds: mode === 'single' ? ['lead-a'] : ['lead-a', 'lead-b'], version: 7, mode: 'add' }]));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Assign leads to agent' })).not.toBeInTheDocument());
    });

    it('shows the bulk bar while rows are selected and hides it again', async () => {
      const { user } = renderLeadList();
      const row = await findRow('Alpine Bakery AG');

      expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument();

      await user.click(within(row).getByRole('checkbox'));
      const bar = await screen.findByRole('region', { name: 'Bulk actions' });
      expect(within(bar).getByText('1 selected')).toBeInTheDocument();
      expect(within(bar).getByRole('button', { name: 'Assign to' })).toBeInTheDocument();
      expect(within(bar).getByRole('button', { name: 'Delete' })).toBeInTheDocument();

      // Selecting everything on the page, then clearing.
      const table = screen.getByRole('table');
      await user.click(within(table).getAllByRole('checkbox')[0]);
      expect(await within(bar).findByText('3 selected')).toBeInTheDocument();

      await user.click(within(bar).getByRole('button', { name: 'Clear selection' }));
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument());
      expect(useLeadsStore.getState().rowSelection).toEqual({});
    });

    it('drops the selection when the filters change the visible rows', async () => {
      const { user } = renderLeadList();
      const row = await findRow('Alpine Bakery AG');
      await user.click(within(row).getByRole('checkbox'));
      await screen.findByRole('region', { name: 'Bulk actions' });

      await user.type(screen.getByRole('searchbox', { name: 'Search leads' }), 'x');

      await waitFor(() => expect(useLeadsStore.getState().rowSelection).toEqual({}));
      expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument();
    });

    it('deletes the selected leads in ONE bulk request after confirmation and reports once', async () => {
      let deletedIds: string[] = [];
      let bulkCalls = 0;
      let perIdCalls = 0;
      server.use(
        http.post(`${L}/bulk-delete`, async ({ request }) => {
          bulkCalls += 1;
          const body = (await request.json()) as { leadIds: string[] };
          deletedIds = body.leadIds;
          return HttpResponse.json(ok({
            requested: body.leadIds.length,
            deleted: body.leadIds.length,
            deletedIds: body.leadIds,
            notDeletedIds: [],
          }));
        }),
        // Guard: the old N+1 path (one DELETE per id) must never be used.
        http.delete(`${L}/:id`, () => {
          perIdCalls += 1;
          return HttpResponse.json(ok({ deleted: true }));
        }),
      );
      const { user } = renderLeadList();

      await user.click(within(await findRow('Alpine Bakery AG')).getByRole('checkbox'));
      await user.click(within(await findRow('Basel Dental GmbH')).getByRole('checkbox'));
      const bar = await screen.findByRole('region', { name: 'Bulk actions' });
      await user.click(within(bar).getByRole('button', { name: 'Delete' }));

      const confirm = await screen.findByRole('dialog', { name: 'Delete 2 leads?' });
      expect(within(confirm).getByText(/2 lead\(s\) will be removed/)).toBeInTheDocument();
      await user.click(within(confirm).getByRole('button', { name: 'Delete 2 leads' }));

      await waitFor(() => expect([...deletedIds].sort()).toEqual(['lead-a', 'lead-b']));
      // Exactly ONE request for the whole selection — never one-per-id.
      expect(bulkCalls).toBe(1);
      expect(perIdCalls).toBe(0);
      // One summary toast, not one per row.
      await waitFor(() => expect(showSuccess).toHaveBeenCalledTimes(1));
      expect(showSuccess).toHaveBeenCalledWith('Leads deleted: 2');
      await waitFor(() => expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument());
    });

    it('assigns the selected leads to a team member in ONE bulk request', async () => {
      let bulkBody: { leadIds: string[]; assignedTo: string | null } | null = null;
      let bulkCalls = 0;
      let perIdCalls = 0;
      server.use(
        http.post(`${L}/bulk-assign`, async ({ request }) => {
          bulkCalls += 1;
          bulkBody = (await request.json()) as { leadIds: string[]; assignedTo: string | null };
          return HttpResponse.json(ok({
            requested: bulkBody.leadIds.length,
            updated: bulkBody.leadIds.length,
            updatedIds: bulkBody.leadIds,
            notUpdatedIds: [],
          }));
        }),
        // Guard: the old N+1 path (one PATCH per id) must never be used.
        http.patch(`${L}/:id`, () => {
          perIdCalls += 1;
          return HttpResponse.json(ok(makeLeadDTO({ id: 'x' })));
        }),
      );
      const { user } = renderLeadList();

      await user.click(within(await findRow('Alpine Bakery AG')).getByRole('checkbox'));
      await user.click(within(await findRow('Chur Yoga Studio')).getByRole('checkbox'));
      const bar = await screen.findByRole('region', { name: 'Bulk actions' });
      await user.click(within(bar).getByRole('button', { name: 'Assign to' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Noah Frei' }));

      await waitFor(() => expect(bulkCalls).toBe(1));
      expect(perIdCalls).toBe(0);
      const submittedBody = bulkBody as { leadIds: string[]; assignedTo: string | null } | null;
      expect([...(submittedBody?.leadIds ?? [])].sort()).toEqual(['lead-a', 'lead-c']);
      expect(submittedBody?.assignedTo).toBe('u-2');
      await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('Leads updated: 2'));
    });
  });

  describe('detail drawer', () => {
    it('shows provenance and offers only the actions the lead has data for', async () => {
      const { user } = renderLeadList();

      await user.click(await screen.findByRole('button', { name: 'Alpine Bakery AG' }));
      const drawer = await screen.findByRole('dialog', { name: 'Alpine Bakery AG' });

      // Contact + location exist -> the matching quick actions exist. Email and
      // WhatsApp now open in-app dialogs (buttons); the rest stay plain links.
      expect(within(drawer).getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+41441234567');
      expect(within(drawer).getByRole('button', { name: 'Email' })).toBeInTheDocument();
      expect(within(drawer).getByRole('button', { name: 'WhatsApp' })).toBeInTheDocument();
      expect(within(drawer).getByRole('link', { name: 'Website' })).toHaveAttribute('href', 'https://example.ch/');
      const maps = within(drawer).getAllByRole('link', { name: /open in google maps/i })[0];
      expect(maps.getAttribute('href')).toContain('https://www.google.com/maps/search/?api=1');
      expect(maps.getAttribute('href')).toContain('query_place_id=ChIJ-alpine-bakery');

      await user.click(within(drawer).getByRole('tab', { name: 'Details' }));
      // Provenance: source, place id, discovery session, rating.
      expect(within(drawer).getByText('Google Places')).toBeInTheDocument();
      expect(within(drawer).getByText('ChIJ-alpine-bakery')).toBeInTheDocument();
      expect(within(drawer).getByText('sess-77')).toBeInTheDocument();
      // The business type is humanized consistently ("bakery" → "Bakery").
      expect(within(drawer).getByText('Bakery')).toBeInTheDocument();
      expect(within(drawer).getByText('sourdough')).toBeInTheDocument();
      expect(within(drawer).getByText('4.5')).toBeInTheDocument();
      expect(within(drawer).getByRole('button', { name: 'Convert to customer' })).toBeInTheDocument();
    });

    it('never invents contact actions for a lead without contact data', async () => {
      const { user } = renderLeadList();

      await user.click(await screen.findByRole('button', { name: 'Basel Dental GmbH' }));
      const drawer = await screen.findByRole('dialog', { name: 'Basel Dental GmbH' });

      expect(within(drawer).queryByRole('link', { name: 'Call' })).not.toBeInTheDocument();
      expect(within(drawer).queryByRole('link', { name: 'Email' })).not.toBeInTheDocument();
      expect(within(drawer).queryByRole('link', { name: 'Website' })).not.toBeInTheDocument();
      expect(within(drawer).queryByRole('link', { name: /open in google maps/i })).not.toBeInTheDocument();
      expect(within(drawer).getByText('No contact details yet.')).toBeInTheDocument();
    });

    it('links a converted lead to its customer instead of offering to convert it again', async () => {
      const { user } = renderLeadList();

      await user.click(await screen.findByRole('button', { name: 'Chur Yoga Studio' }));
      const drawer = await screen.findByRole('dialog', { name: 'Chur Yoga Studio' });

      expect(within(drawer).getByRole('link', { name: /open customer/i })).toHaveAttribute('href', '/crm/customers/cust-9');
      expect(within(drawer).queryByRole('button', { name: 'Convert to customer' })).not.toBeInTheDocument();
    });
  });

  describe('created by', () => {
    // A creator the API populated, one it left as a bare id (resolved through the
    // user directory) and one nobody can name. None is the assignee, so every name
    // below appears exactly once and only in its "Created by" spot.
    const POPULATED = makeLeadDTO({
      id: 'lead-populated',
      leadNumber: 'L-00010',
      name: 'Populated AG',
      createdBy: { _id: 'u-9', firstName: 'Olivia', lastName: 'Keller', email: 'olivia@example.ch' },
    });
    const BARE_ID = makeLeadDTO({ id: 'lead-bare', leadNumber: 'L-00011', name: 'Directory GmbH', createdBy: 'u-2' });
    const NOBODY = makeLeadDTO({ id: 'lead-nobody', leadNumber: 'L-00012', name: 'Nobody SA', createdBy: null });
    const CREATOR_LEADS = [POPULATED, BARE_ID, NOBODY];

    beforeEach(() => {
      server.use(
        http.get(L, () => HttpResponse.json(okPage(CREATOR_LEADS))),
        http.get(`${L}/:id`, ({ params }) =>
          HttpResponse.json(ok(CREATOR_LEADS.find((lead) => lead.id === params.id) ?? POPULATED)),
        ),
      );
    });

    // The cell of the "Created by" column in a row, found through the header position.
    const creatorCell = (table: HTMLElement, row: HTMLElement) => {
      const index = within(table)
        .getAllByRole('columnheader')
        .findIndex((header) => /created by/i.test(header.textContent ?? ''));
      return within(row).getAllByRole('cell')[index];
    };

    // The "Created by" row of the drawer's Details list.
    const creatorRow = (drawer: HTMLElement) => {
      const row = within(drawer).getByText('Created by').closest('div');
      if (!row) throw new Error('No "Created by" row in the drawer');
      return row;
    };

    it('adds a "Created by" column that names the creator and cannot be sorted', async () => {
      renderLeadList();
      const table = await screen.findByRole('table');
      await screen.findByText('Populated AG');

      // The API has no createdBy sort: no sort arrows on this header (a sortable one has them).
      expect(within(table).getByRole('columnheader', { name: /created by/i }).querySelector('svg')).toBeNull();
      expect(within(table).getByRole('columnheader', { name: /^name/i }).querySelector('svg')).not.toBeNull();

      expect(creatorCell(table, await findRow('Populated AG'))).toHaveTextContent('Olivia Keller');
      expect(await within(await findRow('Directory GmbH')).findByText('Noah Frei')).toBeInTheDocument();
      // Unknown creator: a dash, not a crash and not a raw id.
      expect(creatorCell(table, await findRow('Nobody SA'))).toHaveTextContent('—');
    });

    it('shows who created the lead in the drawer, next to the created date', async () => {
      const { user } = renderLeadList();

      await user.click(await screen.findByRole('button', { name: 'Populated AG' }));
      const drawer = await screen.findByRole('dialog', { name: 'Populated AG' });

      await user.click(within(drawer).getByRole('tab', { name: 'Details' }));
      expect(creatorRow(drawer)).toHaveTextContent('Olivia Keller');
      expect(within(drawer).getByText('Created')).toBeInTheDocument();
    });

    it('resolves a bare creator id through the directory in the drawer', async () => {
      const { user } = renderLeadList();

      await user.click(await screen.findByRole('button', { name: 'Directory GmbH' }));
      const drawer = await screen.findByRole('dialog', { name: 'Directory GmbH' });

      await user.click(within(drawer).getByRole('tab', { name: 'Details' }));
      await waitFor(() => expect(creatorRow(drawer)).toHaveTextContent('Noah Frei'));
    });

    it('shows a dash in the drawer when the creator is unknown', async () => {
      const { user } = renderLeadList();

      await user.click(await screen.findByRole('button', { name: 'Nobody SA' }));
      const drawer = await screen.findByRole('dialog', { name: 'Nobody SA' });

      await user.click(within(drawer).getByRole('tab', { name: 'Details' }));
      expect(creatorRow(drawer)).toHaveTextContent('—');
    });

    it('keeps naming the creator after an in-place change answered with an unpopulated lead', async () => {
      // The lead the drawer shows is replaced by the PATCH response. Answer with
      // the same creator as a bare id (and a new name, to know the response landed).
      const KNOWN = makeLeadDTO({
        id: 'lead-known',
        name: 'Known Creator AG',
        createdBy: { _id: 'u-2', firstName: 'Noah', lastName: 'Frei', email: 'noah@example.ch' },
      });
      server.use(
        http.get(L, () => HttpResponse.json(okPage([KNOWN]))),
        http.patch(`${L}/:id`, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(ok({ ...KNOWN, ...body, name: 'Known Creator AG (saved)', createdBy: 'u-2' }));
        }),
      );
      const { user } = renderLeadList();

      await user.click(await screen.findByRole('button', { name: 'Known Creator AG' }));
      const drawer = await screen.findByRole('dialog', { name: 'Known Creator AG' });
      await user.click(within(drawer).getByRole('tab', { name: 'Details' }));
      expect(creatorRow(drawer)).toHaveTextContent('Noah Frei');

      await user.click(within(drawer).getByRole('tab', { name: 'Overview' }));
      await user.click(within(drawer).getByRole('combobox', { name: 'Status' }));
      await user.click(await screen.findByRole('option', { name: 'Contacted' }));

      // The response landed (the title is now the saved name) ...
      await screen.findByRole('dialog', { name: 'Known Creator AG (saved)' });
      // ... and it carried only a bare id, yet the creator is still named.
      await user.click(within(drawer).getByRole('tab', { name: 'Details' }));
      expect(creatorRow(drawer)).toHaveTextContent('Noah Frei');
    });
  });

  describe('editing from the drawer', () => {
    it('saves only the edited fields and returns to the read-only view', async () => {
      const patches: Array<{ id: string; body: unknown }> = [];
      server.use(
        http.patch(`${L}/:id`, async ({ params, request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          patches.push({ id: String(params.id), body });
          return HttpResponse.json(ok(makeLeadDTO({ id: String(params.id), name: 'Alpine Bakery AG', ...body })));
        }),
      );
      const { user } = renderLeadList();

      await user.click(await screen.findByRole('button', { name: 'Alpine Bakery AG' }));
      const drawer = await screen.findByRole('dialog', { name: 'Alpine Bakery AG' });
      await user.click(within(drawer).getByRole('button', { name: 'Edit' }));

      const name = within(drawer).getByLabelText(/^Name/);
      await user.clear(name);
      await user.type(name, 'Alpine Bakery Group');
      await user.click(within(drawer).getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(patches).toEqual([{ id: 'lead-a', body: { name: 'Alpine Bakery Group' } }]));
      expect(await within(drawer).findByRole('button', { name: 'Edit' })).toBeInTheDocument();
      expect(showSuccess).toHaveBeenCalledWith('Lead updated');
    }, 10000);

    it('asks before leaving with unsaved edits and sends nothing when they are discarded', async () => {
      let patched = 0;
      server.use(
        http.patch(`${L}/:id`, () => {
          patched += 1;
          return HttpResponse.json(ok(makeLeadDTO()));
        }),
      );
      const { user } = renderLeadList();

      await user.click(await screen.findByRole('button', { name: 'Alpine Bakery AG' }));
      const drawer = await screen.findByRole('dialog', { name: 'Alpine Bakery AG' });
      await user.click(within(drawer).getByRole('button', { name: 'Edit' }));
      await user.type(within(drawer).getByLabelText(/^Name/), ' Ltd');
      await user.keyboard('{Escape}');

      const confirm = await screen.findByRole('dialog', { name: 'Discard changes?' });
      await user.click(within(confirm).getByRole('button', { name: 'Discard' }));

      await waitFor(() => expect(screen.queryByRole('dialog', { name: /Alpine Bakery AG/ })).not.toBeInTheDocument());
      expect(patched).toBe(0);
    });
  });

  describe('convert to customer', () => {
    it('calls the convert endpoint and shows the resulting customer', async () => {
      const calls: Array<{ id: string; body: unknown }> = [];
      server.use(
        http.post(`${L}/:id/convert`, async ({ params, request }) => {
          calls.push({ id: String(params.id), body: await request.json() });
          return HttpResponse.json(
            ok({
              lead: makeLeadDTO({
                id: String(params.id),
                name: 'Alpine Bakery AG',
                status: 'converted',
                convertedCustomerId: 'cust-777',
                convertedAt: new Date().toISOString(),
              }),
              customerId: 'cust-777',
            }),
          );
        }),
      );
      const { user } = renderLeadList();

      await user.click(await screen.findByRole('button', { name: 'Alpine Bakery AG' }));
      const drawer = await screen.findByRole('dialog', { name: 'Alpine Bakery AG' });
      await user.click(within(drawer).getByRole('button', { name: 'Convert to customer' }));

      const dialog = await screen.findByRole('dialog', { name: 'Convert to customer' });
      // The shared duplicate check warns about a customer that already looks like this lead.
      expect(await within(dialog).findByText('A similar customer already exists')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Convert to customer' }));

      expect(await within(dialog).findByTestId('converted-customer-id')).toHaveTextContent('cust-777');
      expect(calls).toEqual([{ id: 'lead-a', body: {} }]);
      expect(within(dialog).getByRole('link', { name: /open customer/i })).toHaveAttribute('href', '/crm/customers/cust-777');
    });

    it('passes the optional assignee and note along', async () => {
      const calls: Array<{ id: string; body: unknown }> = [];
      server.use(
        http.post(`${L}/:id/convert`, async ({ params, request }) => {
          calls.push({ id: String(params.id), body: await request.json() });
          return HttpResponse.json(ok({ customerId: 'cust-5' }));
        }),
      );
      const { user } = renderLeadList();

      await user.click(within(await findRow('Basel Dental GmbH')).getByRole('button', { name: 'Row actions' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Convert to customer' }));

      const dialog = await screen.findByRole('dialog', { name: 'Convert to customer' });
      await user.type(within(dialog).getByLabelText('Note (optional)'), '  Won at the trade fair  ');
      await user.click(within(dialog).getByRole('combobox', { name: 'Assign to (optional)' }));
      await user.click(await screen.findByRole('option', { name: 'Noah Frei' }));
      await user.click(within(dialog).getByRole('button', { name: 'Convert to customer' }));

      expect(await within(dialog).findByTestId('converted-customer-id')).toHaveTextContent('cust-5');
      expect(calls).toEqual([{ id: 'lead-b', body: { assignedTo: 'u-2', note: 'Won at the trade fair' } }]);
    });
  });

  describe('creating a lead', () => {
    it('validates the name before anything is sent', async () => {
      let posted = 0;
      server.use(
        http.post(L, () => {
          posted += 1;
          return HttpResponse.json(ok(makeLeadDTO()));
        }),
      );
      const { user } = renderLeadList();
      await screen.findByText('Alpine Bakery AG');

      await user.click(screen.getByRole('button', { name: 'New lead' }));
      const dialog = await screen.findByRole('dialog', { name: 'New lead' });
      await user.click(within(dialog).getByRole('button', { name: 'Create lead' }));

      expect(await within(dialog).findByText('Name is required')).toBeInTheDocument();
      expect(posted).toBe(0);
    });

    it('posts the new lead as a manual lead with a normalised website', async () => {
      const bodies: Array<Record<string, unknown>> = [];
      server.use(
        http.post(L, async ({ request }) => {
          const body = (await request.json()) as Record<string, unknown>;
          bodies.push(body);
          return HttpResponse.json(ok(makeLeadDTO({ id: 'lead-new', name: String(body.name) })));
        }),
      );
      const { user } = renderLeadList();
      await screen.findByText('Alpine Bakery AG');

      await user.click(screen.getByRole('button', { name: 'New lead' }));
      const dialog = await screen.findByRole('dialog', { name: 'New lead' });
      await user.type(within(dialog).getByLabelText(/^Name/), '  Neue Bäckerei GmbH ');
      await user.type(within(dialog).getByLabelText('Website'), 'neue-baeckerei.ch');
      await user.type(within(dialog).getByLabelText('City'), 'Bern');
      await user.click(within(dialog).getByRole('button', { name: 'Create lead' }));

      await waitFor(() => expect(bodies).toHaveLength(1));
      expect(bodies[0]).toMatchObject({
        name: 'Neue Bäckerei GmbH',
        type: 'business',
        status: 'new',
        source: 'manual',
        website: 'https://neue-baeckerei.ch',
        address: { city: 'Bern', country: 'CH' },
      });
      // Blank optional fields are left out, not sent as empty strings.
      expect(bodies[0]).not.toHaveProperty('phone');
      expect(bodies[0]).not.toHaveProperty('email');
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New lead' })).not.toBeInTheDocument());
    });

    it('asks before throwing away typed input', async () => {
      const { user } = renderLeadList();
      await screen.findByText('Alpine Bakery AG');

      await user.click(screen.getByRole('button', { name: 'New lead' }));
      const dialog = await screen.findByRole('dialog', { name: 'New lead' });
      await user.type(within(dialog).getByLabelText(/^Name/), 'Half typed');
      await user.keyboard('{Escape}');

      const confirm = await screen.findByRole('dialog', { name: 'Discard changes?' });
      await user.click(within(confirm).getByRole('button', { name: 'Keep editing' }));
      expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('Half typed');

      await user.keyboard('{Escape}');
      const again = await screen.findByRole('dialog', { name: 'Discard changes?' });
      await user.click(within(again).getByRole('button', { name: 'Discard' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New lead' })).not.toBeInTheDocument());
    });

    it('closes an untouched dialog without asking', async () => {
      const { user } = renderLeadList();
      await screen.findByText('Alpine Bakery AG');

      await user.click(screen.getByRole('button', { name: 'New lead' }));
      await screen.findByRole('dialog', { name: 'New lead' });
      await user.keyboard('{Escape}');

      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New lead' })).not.toBeInTheDocument());
      expect(screen.queryByRole('dialog', { name: 'Discard changes?' })).not.toBeInTheDocument();
    });
  });

  it('shows a filtered empty state with a reset action', async () => {
    server.use(http.get(L, () => HttpResponse.json(okPage([]))));
    const { user } = renderLeadList();
    await user.type(screen.getByRole('searchbox', { name: 'Search leads' }), 'nothing');

    expect(await screen.findByText('No leads match your filters')).toBeInTheDocument();
    // Both the filter bar and the empty state offer "Reset"; use the one in the table.
    await user.click(within(screen.getByRole('table')).getByRole('button', { name: 'Reset' }));
    expect(await screen.findByText('No leads yet')).toBeInTheDocument();
  });
});
