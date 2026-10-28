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

// ── Module mocks (mirrors lead-contact.test.tsx / lead-bulk-contact.test.tsx) ──

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

// Mutable permission set so each test can vary what the user may do.
const auth = vi.hoisted(() => ({
  permissions: ['lead:read', 'lead:write', 'lead:enrich', 'crm:write'] as string[],
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

import { showError, showSuccess } from '@/lib/toast';
import { LeadDetailDrawer } from '../ui/lead-detail-drawer';
import { LeadListView } from '../ui/lead-list-view';
import { useLeadsStore } from '../state/leads-store';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const L = `${BASE}/crm/leads`;
const D = `${BASE}/doctpl`;

// A lead with a website but no e-mail/social yet — the enrich target.
const LEAD_ENRICHABLE = makeLeadDTO({
  id: 'lead-enrich',
  name: 'Enrich Me AG',
  email: null,
  website: 'https://enrichme.ch',
});
// A lead with no website — enrichment must be disabled.
const LEAD_NO_WEBSITE = makeLeadDTO({
  id: 'lead-no-web',
  name: 'No Website GmbH',
  website: null,
  websiteDomain: null,
});
// A lead that already carries scraped social links.
const LEAD_WITH_SOCIAL = makeLeadDTO({
  id: 'lead-social',
  name: 'Social AG',
  social: {
    facebook: 'https://facebook.com/socialag',
    instagram: null,
    linkedin: 'https://linkedin.com/company/socialag',
    twitter: null,
    youtube: null,
    tiktok: null,
  },
});

const SINGLE_LEADS = [LEAD_ENRICHABLE, LEAD_NO_WEBSITE, LEAD_WITH_SOCIAL];
const leadFor = (id: unknown) => SINGLE_LEADS.find((lead) => lead.id === id) ?? LEAD_ENRICHABLE;

// The enriched lead the server returns: e-mail + LinkedIn now filled.
const ENRICHED_LEAD = makeLeadDTO({
  id: 'lead-enrich',
  name: 'Enrich Me AG',
  email: 'found@enrichme.ch',
  website: 'https://enrichme.ch',
  social: {
    facebook: null,
    instagram: null,
    linkedin: 'https://linkedin.com/company/enrichme',
    twitter: null,
    youtube: null,
    tiktok: null,
  },
  enrichment: {
    status: 'done',
    enrichedAt: new Date().toISOString(),
    source: 'website',
    foundEmails: ['found@enrichme.ch'],
    foundPhones: [],
    error: null,
  },
});

// Bulk list fixtures.
const BULK_LEADS = [
  makeLeadDTO({ id: 'b-1', name: 'Bulk One AG', website: 'https://one.ch' }),
  makeLeadDTO({ id: 'b-2', name: 'Bulk Two AG', website: 'https://two.ch' }),
  makeLeadDTO({ id: 'b-3', name: 'Bulk Three AG', website: 'https://three.ch' }),
];

let enrichCalls: string[] = [];
let enrichBulkCalls: Array<{ leadIds: string[] }> = [];

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
  enrichCalls = [];
  enrichBulkCalls = [];
  auth.permissions = ['lead:read', 'lead:write', 'lead:enrich', 'crm:write'];
  useLeadsStore.getState().reset();
  server.use(
    http.get(`${L}/:id/contact-log`, () => HttpResponse.json(ok([]))),
    http.get(`${D}/emails`, () => HttpResponse.json(ok([]))),
    http.get(`${D}/email-templates`, () => HttpResponse.json(ok([]))),
    http.get(`${BASE}/users/directory`, () => HttpResponse.json(ok([]))),
    http.post(`${L}/:id/enrich`, ({ params }) => {
      enrichCalls.push(String(params.id));
      return HttpResponse.json(
        ok({
          lead: ENRICHED_LEAD,
          found: { emails: ['found@enrichme.ch'], phones: [], social: { linkedin: 'https://linkedin.com/company/enrichme' } },
          applied: { email: 'found@enrichme.ch', socials: ['linkedin'] },
        }),
      );
    }),
    http.post(`${L}/enrich-bulk`, async ({ request }) => {
      enrichBulkCalls.push((await request.json()) as { leadIds: string[] });
      return HttpResponse.json(ok({ jobId: 'job-1' }), { status: 202 });
    }),
    http.get(`${L}/enrich-jobs/:jobId`, () =>
      HttpResponse.json(ok({ status: 'done', counts: { total: 3, processed: 3, enriched: 2, skipped: 1, failed: 0 } })),
    ),
    http.get(`${L}/:id`, ({ params }) => HttpResponse.json(ok(leadFor(params.id)))),
  );
});

function renderDrawer(leadId: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  render(<LeadDetailDrawer leadId={leadId} open onOpenChange={() => {}} users={[]} />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { user };
}

const openDrawer = async (leadId: string, name: string) => {
  const handle = renderDrawer(leadId);
  const dialog = await screen.findByRole('dialog', { name });
  return { ...handle, dialog };
};

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
  return { user };
}

const findRow = async (name: string) => {
  const cell = await screen.findByText(name);
  const row = cell.closest('tr');
  if (!row) throw new Error(`No table row found for "${name}"`);
  return row as HTMLElement;
};

// ── Tests: single-lead drawer ───────────────────────────────────────────────────

describe('lead detail drawer — enrichment', () => {
  it('offers the Enrich action when the user has lead:enrich and the lead has a website', async () => {
    const { dialog } = await openDrawer('lead-enrich', 'Enrich Me AG');

    const button = await within(dialog).findByRole('button', { name: 'Enrich from website' });
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it('disables Enrich and shows a hint when the lead has no website', async () => {
    const { dialog } = await openDrawer('lead-no-web', 'No Website GmbH');

    const button = await within(dialog).findByRole('button', { name: 'Enrich from website' });
    expect(button).toBeDisabled();
    expect(within(dialog).getByText('Add a website to enable enrichment')).toBeInTheDocument();
  });

  it('hides the Enrich action without the lead:enrich permission', async () => {
    auth.permissions = ['lead:read', 'lead:write'];
    const { dialog } = await openDrawer('lead-enrich', 'Enrich Me AG');

    // Wait for the body to settle, then assert the enrich control is absent.
    expect(await within(dialog).findByText('Pipeline')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Enrich from website' })).not.toBeInTheDocument();
  });

  it('calls the enrich endpoint and reflects what was found/applied', async () => {
    const { user, dialog } = await openDrawer('lead-enrich', 'Enrich Me AG');

    await user.click(await within(dialog).findByRole('button', { name: 'Enrich from website' }));

    // The endpoint was hit for this lead.
    await waitFor(() => expect(enrichCalls).toEqual(['lead-enrich']));

    // The returned lead is reflected: the filled e-mail + the LinkedIn profile appear.
    expect(await within(dialog).findByText('found@enrichme.ch')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('tab', { name: 'Business' }));
    const linkedin = await within(dialog).findByRole('link', { name: 'https://linkedin.com/company/enrichme' });
    expect(linkedin).toHaveAttribute('href', 'https://linkedin.com/company/enrichme');
    expect(linkedin).toHaveAttribute('rel', expect.stringContaining('noopener'));

    await user.click(within(dialog).getByRole('tab', { name: 'Overview' }));
    // The honest summary note claims only the found/applied counts (2 fields filled).
    expect(
      await within(dialog).findByText('Found 1 email(s), 1 social link(s); filled 2 field(s)'),
    ).toBeInTheDocument();
    // …and the same truthful line is toasted.
    expect(showSuccess).toHaveBeenCalledWith('Found 1 email(s), 1 social link(s); filled 2 field(s)');
  });

  it('renders social profile links when the lead already has them', async () => {
    const { dialog } = await openDrawer('lead-social', 'Social AG');

    await userEvent.setup().click(within(dialog).getByRole('tab', { name: 'Business' }));
    expect(await within(dialog).findByText('Social profiles')).toBeInTheDocument();
    const facebook = within(dialog).getByRole('link', { name: 'https://facebook.com/socialag' });
    expect(facebook).toHaveAttribute('href', 'https://facebook.com/socialag');
    expect(facebook).toHaveAttribute('target', '_blank');
    expect(within(dialog).getByRole('link', { name: 'https://linkedin.com/company/socialag' })).toBeInTheDocument();
    // Platforms without a link are not rendered.
    expect(within(dialog).queryByText('Instagram')).not.toBeInTheDocument();
  });
});

// ── Tests: bulk enrich ──────────────────────────────────────────────────────────

describe('lead list — bulk enrich', () => {
  beforeEach(() => {
    server.use(http.get(L, () => HttpResponse.json(okPage(BULK_LEADS))));
  });

  const selectAll = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(within(await findRow('Bulk One AG')).getByRole('checkbox'));
    await user.click(within(await findRow('Bulk Two AG')).getByRole('checkbox'));
    await user.click(within(await findRow('Bulk Three AG')).getByRole('checkbox'));
    return screen.findByRole('region', { name: 'Bulk actions' });
  };

  it('fires enrich-bulk after confirmation and shows a job summary', async () => {
    const { user } = renderLeadList();
    const bar = await selectAll(user);

    await user.click(within(bar).getByRole('button', { name: 'Enrich' }));

    // A confirm dialog appears first (good UX before a bulk, side-effecting action).
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Enrich 3 lead(s) from their websites?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Enrich' }));

    // The bulk endpoint was called with exactly the selected ids.
    await waitFor(() => expect(enrichBulkCalls).toHaveLength(1));
    expect(enrichBulkCalls[0].leadIds.sort()).toEqual(['b-1', 'b-2', 'b-3']);

    // The polled job's counts are summarised in a single truthful toast.
    await waitFor(() =>
      expect(showSuccess).toHaveBeenCalledWith('2 enriched, 1 skipped, 0 failed'),
    );
    // Selection is cleared once the job settles.
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: 'Bulk actions' })).not.toBeInTheDocument(),
    );
  });

  it('hides the bulk Enrich button without the lead:enrich permission', async () => {
    auth.permissions = ['lead:read', 'lead:write'];
    const { user } = renderLeadList();
    await user.click(within(await findRow('Bulk One AG')).getByRole('checkbox'));
    const bar = await screen.findByRole('region', { name: 'Bulk actions' });

    expect(within(bar).queryByRole('button', { name: 'Enrich' })).not.toBeInTheDocument();
    expect(showError).not.toHaveBeenCalled();
  });
});
