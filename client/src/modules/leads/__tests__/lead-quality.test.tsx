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

vi.mock('@/lib/i18n/language-context', () => {
  const t = (key: string, fallback?: string | null, vars?: Record<string, unknown>) => {
    const text = fallback ?? key;
    return vars ? text.replace(/\{(\w+)\}/g, (_, name) => (vars[name] != null ? String(vars[name]) : `{${name}}`)) : text;
  };
  const value = { locale: 'en', language: 'en', dir: 'ltr', isRTL: false, t };
  return { useLanguage: () => value, LanguageProvider: ({ children }: { children: ReactNode }) => children };
});

const auth = vi.hoisted(() => ({ permissions: ['lead:read', 'lead:write', 'lead:merge'] as string[] }));
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

import { showSuccess } from '@/lib/toast';
import { translations } from '@/lib/i18n/translations';
import { leadsQualityTranslations } from '@/lib/i18n/leads-quality-translations';
import { leadSchema } from '../schemas/lead-schemas';
import { parseDuplicateGroups, parseLeadScore, parseScoreExplanation } from '../services/lead-quality-api';
import { LeadScoreBadge } from '../ui/lead-score-badge';
import { LeadScorePanel } from '../ui/lead-score-panel';
import { LeadDuplicatesView } from '../ui/lead-duplicates-view';
import { buildSelections, formatMergeValue } from '../ui/lead-merge-dialog';
import { buildLeadFilterParams } from '../ui/lead-ui-constants';
import type { MergePreview } from '../types/lead-quality-types';

const L = `${BASE}/crm/leads`;
const Q = `${BASE}/crm`;

const EXPLANATION = {
  leadId: 'lead-1',
  score: 64,
  band: 'warm',
  disqualified: false,
  version: 3,
  engineVersion: 'lead-score/1',
  computedAt: '2026-10-29T10:00:00.000Z',
  factors: [
    { key: 'provider_rating', label: 'Provider rating', group: 'business', points: 7, maxPoints: 10, evidence: { field: 'providerMeta.rating', value: 4.2, source: 'provider', at: '2026-10-01T00:00:00.000Z', ref: { type: 'lead', id: 'lead-1' } } },
    { key: 'q_interest', label: 'Interest level', group: 'qualification', points: 9, maxPoints: 9, evidence: { field: 'qualification.fields.interest', value: 'high', source: 'sms_agent', at: '2026-10-20T00:00:00.000Z', ref: { type: 'sim_sms_message', id: 'abcdef123456' }, quote: 'very interested' } },
    { key: 'q_objections', label: 'Objections raised', group: 'qualification', points: -3, maxPoints: 0, minPoints: -3, evidence: { field: 'qualification.fields.objections', value: 'Too expensive', source: 'user', at: null, ref: null } },
  ],
  missing: [{ key: 'connected_calls', label: 'Connected calls', group: 'engagement', reason: 'no_calls_recorded' }],
  stored: { value: 50, band: 'warm', version: 2, computedAt: '2026-10-28T00:00:00.000Z', factors: [] },
  stale: true,
};

const GROUPS = {
  groups: [{
    id: 'g1',
    confidence: 0.995,
    leads: [
      { _id: 'a1', leadNumber: 'L-00001', name: 'Acme AG', status: 'new', phone: '+41 44 111 11 11', email: 'info@acme.ch', address: { city: 'Zürich', postalCode: '8001' }, score: { value: 80, band: 'hot', version: 1, computedAt: null } },
      { _id: 'b2', leadNumber: 'L-00002', name: 'ACME', status: 'new', phone: '+41 44 111 11 11', email: null, address: { city: 'Zürich' } },
    ],
    pairs: [{ id: 'pair-1', leadIds: ['a1', 'b2'], reasons: [{ method: 'PHONE', value: '+41441111111', confidence: 0.95 }, { method: 'EMAIL', value: 'x', confidence: 0.9 }], confidence: 0.995 }],
  }],
  total: 1,
  openPairs: 1,
};

const PREVIEW: MergePreview = {
  survivor: { _id: 'a1', name: 'Acme AG', leadNumber: 'L-00001' },
  loser: { _id: 'b2', name: 'ACME', leadNumber: 'L-00002' },
  fields: [
    { field: 'name', survivorValue: 'Acme AG', loserValue: 'ACME', same: false, defaultWinner: 'survivor' },
    { field: 'email', survivorValue: 'info@acme.ch', loserValue: 'sales@acme.ch', same: false, defaultWinner: 'survivor' },
    { field: 'phone', survivorValue: '+41 44 111 11 11', loserValue: '+41 44 111 11 11', same: true, defaultWinner: 'survivor' },
    { field: 'website', survivorValue: null, loserValue: 'https://acme.ch', same: false, defaultWinner: 'loser' },
  ],
  counts: [
    { key: 'leadCommunications', label: 'Communications', move: 4, retained: 0, consentUpgrades: 0 },
    { key: 'simSmsConversations', label: 'SIM SMS conversations', move: 1, retained: 1, consentUpgrades: 0 },
    { key: 'channelConsents', label: 'Channel consents', move: 0, retained: 1, consentUpgrades: 1 },
  ],
  totalToMove: 5,
  qualification: { takeoverKeys: ['budget'], historyToAdd: 2 },
  tagsToAdd: ['expo'],
};

function wrapper(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
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
beforeEach(() => { vi.clearAllMocks(); auth.permissions = ['lead:read', 'lead:write', 'lead:merge']; });

describe('lead quality parsing', () => {
  it('parses the stored score on a lead and treats a never-scored lead as null', () => {
    const lead = leadSchema.parse(makeLeadDTO({ id: 'x', score: { value: 72, band: 'hot', version: 2, computedAt: '2026-10-29T00:00:00Z', factors: [{ key: 'has_email', points: 3, maxPoints: 3 }] } }));
    expect(lead.score).toMatchObject({ value: 72, band: 'hot', version: 2, disqualified: false });
    expect(leadSchema.parse(makeLeadDTO({ id: 'y' })).score).toBeNull();
    expect(parseLeadScore({ band: 'hot' })).toBeNull();
    expect(parseLeadScore({ value: 5, band: 'bogus' })?.band).toBe('unscored');
  });

  it('parses explanations and duplicate groups tolerantly', () => {
    const e = parseScoreExplanation(EXPLANATION);
    expect(e.factors[1].evidence?.ref).toEqual({ type: 'sim_sms_message', id: 'abcdef123456' });
    expect(e.factors[2].minPoints).toBe(-3);
    expect(e.stored?.version).toBe(2);
    const g = parseDuplicateGroups(GROUPS);
    expect(g.groups[0].leads.map((l) => l.id)).toEqual(['a1', 'b2']);
    expect(g.groups[0].leads[1].score).toBeNull();
    expect(g.groups[0].pairs[0].reasons.map((r) => r.method)).toEqual(['PHONE', 'EMAIL']);
  });

  it('sends the score band filter only when set', () => {
    const base = { status: 'ALL', source: 'ALL', type: 'ALL', country: 'ALL', city: 'ALL', area: 'ALL', businessType: 'ALL', assignedTo: 'ALL', search: '' };
    expect(buildLeadFilterParams({ ...base, scoreBand: 'ALL' }, null, '')).toEqual({});
    expect(buildLeadFilterParams({ ...base, scoreBand: 'hot' }, null, '')).toEqual({ scoreBand: 'hot' });
  });

  it('merge helpers: default winners fill unpicked fields, values render readably', () => {
    expect(buildSelections(PREVIEW, { email: 'loser' })).toEqual({ name: 'survivor', email: 'loser', phone: 'survivor', website: 'loser' });
    expect(formatMergeValue('address', { street: 'Bahnhofstr. 1', postalCode: '8001', city: 'Zürich', country: 'CH' })).toBe('Bahnhofstr. 1, 8001 Zürich, CH');
    expect(formatMergeValue('location', { type: 'Point', coordinates: [8.5, 47.3] })).toBe('47.30000, 8.50000');
    expect(formatMergeValue('providerMeta', { rating: 4.5, reviewCount: 12 })).toBe('★ 4.5 (12)');
    expect(formatMergeValue('email', null)).toBeNull();
  });
});

describe('LeadScoreBadge', () => {
  it('shows value + band, "Unscored" without a number, and DNC', () => {
    const { rerender } = render(<LeadScoreBadge score={{ value: 81, band: 'hot', version: 1, computedAt: null, disqualified: false, factors: [] }} />);
    expect(screen.getByText('81')).toBeInTheDocument();
    expect(screen.getByText('Hot')).toBeInTheDocument();
    rerender(<LeadScoreBadge score={null} />);
    expect(screen.getByText('Unscored')).toBeInTheDocument();
    expect(screen.queryByText(/\d/)).toBeNull();
    rerender(<LeadScoreBadge score={{ value: 0, band: 'cold', version: 1, computedAt: null, disqualified: true, factors: [] }} />);
    expect(screen.getByText('Do not contact')).toBeInTheDocument();
  });
});

describe('LeadScorePanel', () => {
  it('lists every factor with points and evidence, the missing data, and recalculates', async () => {
    let recalcs = 0;
    server.use(
      http.get(`${L}/lead-1/score`, () => HttpResponse.json(ok(EXPLANATION))),
      http.post(`${L}/lead-1/score/recalculate`, () => { recalcs += 1; return HttpResponse.json(ok({ ...EXPLANATION, stale: false, stored: { ...EXPLANATION.stored, value: 64, version: 3 } })); }),
    );
    const user = userEvent.setup();
    wrapper(<LeadScorePanel leadId="lead-1" canRecalculate />);
    expect(await screen.findByLabelText('Score 64')).toBeInTheDocument();
    expect(screen.getByText(/^Config v3 · Computed Oct 2[89], 2026$/)).toBeInTheDocument();
    const rating = document.querySelector('[data-factor="provider_rating"]') as HTMLElement;
    expect(within(rating).getByText('7 / 10 pts')).toBeInTheDocument();
    expect(within(rating).getByText('providerMeta.rating')).toBeInTheDocument();
    const interest = document.querySelector('[data-factor="q_interest"]') as HTMLElement;
    expect(within(interest).getByText(/SMS reply · 123456/)).toBeInTheDocument();
    expect(within(interest).getByText('“very interested”')).toBeInTheDocument();
    expect(screen.getByText('-3 pts (penalty)')).toBeInTheDocument();
    expect(screen.getByText(/no calls recorded/)).toBeInTheDocument();
    expect(screen.getByText(/The list shows an older value/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Recalculate/ }));
    await waitFor(() => expect(recalcs).toBe(1));
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('Score recalculated'));
    expect(screen.queryByText(/The list shows an older value/)).toBeNull();
  });

  it('hides recalculation without write permission and explains disqualification', async () => {
    server.use(http.get(`${L}/lead-1/score`, () => HttpResponse.json(ok({
      ...EXPLANATION, score: 0, band: 'cold', disqualified: true,
      factors: [{ key: 'do_not_contact', label: 'Do not contact', group: 'engagement', points: 0, maxPoints: 0, evidence: { field: 'doNotContact', value: true, source: 'call_suppression:call_request', at: null, ref: { type: 'call_suppression', id: 'sup-999999' } } }],
    }))));
    wrapper(<LeadScorePanel leadId="lead-1" canRecalculate={false} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/do-not-contact is on record/);
    expect(screen.getByText(/Do-not-call entry · 999999/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Recalculate/ })).toBeNull();
  });
});

describe('LeadDuplicatesView', () => {
  it('shows grouped candidates and remembers "not duplicates" for every pair in the group', async () => {
    const dismissed: string[] = [];
    server.use(
      http.get(`${Q}/lead-duplicates`, () => HttpResponse.json(ok(GROUPS))),
      http.post(`${Q}/lead-duplicates/:id/dismiss`, ({ params }) => { dismissed.push(String(params.id)); return HttpResponse.json(ok({})); }),
    );
    const user = userEvent.setup();
    wrapper(<LeadDuplicatesView />);
    const group = await screen.findByTestId('duplicate-group');
    expect(within(group).getByText('Acme AG')).toBeInTheDocument();
    expect(within(group).getByText('ACME')).toBeInTheDocument();
    expect(within(group).getByText('Same phone')).toBeInTheDocument();
    expect(within(group).getByText('100% match')).toBeInTheDocument();
    await user.click(within(group).getByRole('button', { name: /Not duplicates/ }));
    await waitFor(() => expect(dismissed).toEqual(['pair-1']));
  });

  it('compares side by side, lets the user pick field winners, previews history counts and merges', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get(`${Q}/lead-duplicates`, () => HttpResponse.json(ok(GROUPS))),
      http.get(`${Q}/lead-merges/preview`, () => HttpResponse.json(ok(PREVIEW))),
      http.post(`${Q}/lead-merges`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(ok({ id: 'm1', status: 'completed', counts: {} }));
      }),
    );
    const user = userEvent.setup();
    wrapper(<LeadDuplicatesView />);
    await user.click(await screen.findByRole('button', { name: /Compare & merge/ }));
    const fields = await screen.findByTestId('merge-fields');
    const counts = screen.getByTestId('merge-counts');
    expect(within(counts).getByText(/4 will move/)).toBeInTheDocument();
    expect(within(counts).getAllByText(/stay linked via the merged lead/)[0]).toBeInTheDocument();
    expect(within(counts).getByText(/the stricter status is kept/)).toBeInTheDocument();
    expect(screen.getByText('Qualification answers taken over: budget')).toBeInTheDocument();
    expect(screen.getByText(/Do-not-contact and opt-outs are always preserved/)).toBeInTheDocument();
    // Identical values cannot be picked.
    expect(within(fields).getAllByRole('radio', { name: /Phone/ }).every((r) => (r as HTMLInputElement).disabled)).toBe(true);

    await user.click(within(fields).getByRole('radio', { name: 'Email: sales@acme.ch' }));
    await user.click(screen.getByRole('button', { name: /^Merge$/ }));
    await waitFor(() => expect(body).not.toBeNull());
    expect(body).toMatchObject({
      survivorId: 'a1', loserId: 'b2', candidateId: 'pair-1',
      fieldSelections: { name: 'survivor', email: 'loser', phone: 'survivor', website: 'loser' },
    });
    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('Leads merged'));
  });

  it('merge history: undo asks for confirmation, then calls the undo endpoint', async () => {
    const undone: string[] = [];
    server.use(
      http.get(`${Q}/lead-duplicates`, () => HttpResponse.json(ok({ groups: [], total: 0, openPairs: 0 }))),
      http.get(`${Q}/lead-merges`, () => HttpResponse.json({ success: true, data: [
        { id: 'm1', survivorId: 'a1', loserId: 'b2', survivorName: 'Acme AG', loserName: 'ACME', survivorNumber: 'L-00001', loserNumber: 'L-00002', status: 'completed', counts: { leadCommunications: { moved: 4, retained: 0, consentUpgrades: 0 } }, mergedBy: { firstName: 'Ana', lastName: 'Admin' }, createdAt: '2026-10-29T08:00:00.000Z' },
        { id: 'm2', survivorId: 'c3', loserId: 'd4', status: 'in_progress', counts: {}, lastError: 'connection reset' },
      ], pagination: { hasNext: false, nextCursor: null } })),
      http.post(`${Q}/lead-merges/:id/undo`, ({ params }) => { undone.push(String(params.id)); return HttpResponse.json(ok({ id: params.id, status: 'undone' })); }),
    );
    const user = userEvent.setup();
    wrapper(<LeadDuplicatesView />);
    expect(await screen.findByText('No open duplicates — nice and clean.')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: /Merge history/ }));
    const list = await screen.findByTestId('merge-history');
    expect(within(list).getByText('L-00002 ACME → L-00001 Acme AG')).toBeInTheDocument();
    expect(within(list).getByText(/4 records moved/)).toBeInTheDocument();
    expect(within(list).getByText('connection reset')).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: /Resume/ })).toBeInTheDocument();
    await user.click(within(list).getByRole('button', { name: /Undo/ }));
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.findByRole('dialog'));
    await user.click(within(dialog).getByRole('button', { name: /^Undo$/ }));
    await waitFor(() => expect(undone).toEqual(['m1']));
  });

  it('read-only users see the queue without merge actions', async () => {
    auth.permissions = ['lead:read'];
    server.use(http.get(`${Q}/lead-duplicates`, () => HttpResponse.json(ok(GROUPS))));
    wrapper(<LeadDuplicatesView />);
    const group = await screen.findByTestId('duplicate-group');
    expect(within(group).queryByRole('button', { name: /Compare & merge/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Scan now/ })).toBeNull();
  });
});

describe('lead quality translations', () => {
  it('are complete and non-empty in de/en/fr/ar and wired into the dictionary', () => {
    const keys = Object.keys(leadsQualityTranslations.en);
    expect(keys.length).toBeGreaterThan(100);
    for (const locale of ['de', 'en', 'fr', 'ar'] as const) {
      const dict = leadsQualityTranslations[locale] as Record<string, string>;
      expect(Object.keys(dict).sort()).toEqual([...keys].sort());
      for (const key of keys) expect(dict[key]?.trim().length).toBeGreaterThan(0);
      const merged = (translations as unknown as Record<string, Record<string, string>>)[locale];
      expect(merged['leads.score.section']).toBe(dict['leads.score.section']);
    }
    // Placeholders survive translation.
    for (const key of keys) {
      const vars = (leadsQualityTranslations.en as Record<string, string>)[key].match(/\{\w+\}/g) ?? [];
      for (const locale of ['de', 'fr', 'ar'] as const) {
        for (const v of vars) expect((leadsQualityTranslations[locale] as Record<string, string>)[key]).toContain(v);
      }
    }
  });
});
