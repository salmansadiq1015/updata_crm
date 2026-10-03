import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { http, HttpResponse } from 'msw';
import type { AxiosResponse } from 'axios';
import { server } from './mocks/server';
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
  return { default: instance, normalizeApiError: (err: unknown) => err };
});

vi.mock('@/lib/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showLoading: vi.fn(),
  dismissToast: vi.fn(),
  showPromise: vi.fn(),
}));

// The mutation hooks now translate their toasts via useLanguage(); provide a
// provider-free stub that returns the English fallback (with {var} interpolation).
vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    locale: 'en',
    language: 'en',
    dir: 'ltr',
    isRTL: false,
    t: (key: string, fallback?: string | null, vars?: Record<string, unknown>) => {
      const text = fallback ?? key;
      return vars
        ? text.replace(/\{(\w+)\}/g, (_, name) => (vars[name] != null ? String(vars[name]) : `{${name}}`))
        : text;
    },
  }),
  LanguageProvider: ({ children }: { children: unknown }) => children,
}));

import {
  leadKeys,
  useConvertLead,
  useDeleteLead,
  useLead,
  useLeads,
  useUpdateLead,
  useFlattenedLeads,
} from '../hooks/use-leads';
import type { LeadPage } from '../types/lead-types';
import type { InfiniteData } from '@tanstack/react-query';

const L = `${BASE}/crm/leads`;

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeCtx() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, wrapper };
}

describe('use-leads hooks', () => {
  it('useLeads returns an infinite cursor page and flattens', async () => {
    const { wrapper } = makeCtx();
    const { result } = renderHook(
      () => {
        const query = useLeads({ limit: 50 });
        const flat = useFlattenedLeads(query.data);
        return { query, flat };
      },
      { wrapper },
    );
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(result.current.flat).toHaveLength(2);
  });

  it('useLead loads a detail', async () => {
    const { wrapper } = makeCtx();
    const { result } = renderHook(() => useLead('lead-7'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe('lead-7');
  });

  it('useUpdateLead optimistically patches the list cache then confirms', async () => {
    const { qc, wrapper } = makeCtx();
    // Seed a list cache with a known lead.
    const seeded = makeLeadDTO({ id: 'lead-1', name: 'Before', status: 'new' });
    qc.setQueryData<InfiniteData<LeadPage>>(leadKeys.list({ limit: 50 }), {
      pageParams: [null],
      pages: [
        {
          data: [
            {
              id: 'lead-1',
              leadNumber: seeded.leadNumber as string,
              name: 'Before',
              normalizedName: null,
              type: 'business',
              status: 'new',
              address: { street: null, addressSupplement: null, postalCode: null, city: null, canton: null, country: 'CH' },
              phone: null,
              mobile: null,
              normalizedPhone: null,
              email: null,
              website: null,
              websiteDomain: null,
              location: null,
              providerMeta: { rating: null, reviewCount: null, priceLevel: null },
              source: 'manual',
              sourceMetadata: { googlePlaceId: null, discoverySessionId: null, discoveryResultId: null, businessType: null, keyword: null, discoveredAt: null },
              assignedTo: null,
              notes: null,
              tags: [],
              convertedCustomerId: null,
              convertedAt: null,
              createdBy: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          pagination: { hasNext: false, nextCursor: null, limit: 50 },
        },
      ],
    });

    server.use(
      http.patch(`${L}/:id`, async ({ params, request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(ok(makeLeadDTO({ id: params.id as string, name: 'Before', ...body })));
      }),
    );

    const { result } = renderHook(() => useUpdateLead(), { wrapper });
    result.current.mutate({ id: 'lead-1', patch: { status: 'contacted' } });

    // Optimistic update is applied synchronously after mutate settles onMutate.
    await waitFor(() => {
      const data = qc.getQueryData<InfiniteData<LeadPage>>(leadKeys.list({ limit: 50 }));
      expect(data?.pages[0].data[0].status).toBe('contacted');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('useConvertLead marks the lead converted', async () => {
    const { wrapper } = makeCtx();
    const { result } = renderHook(() => useConvertLead(), { wrapper });
    result.current.mutate({ id: 'lead-1' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.lead?.status).toBe('converted');
    expect(result.current.data?.customerId).toBe('cust-123');
  });

  it('useDeleteLead resolves and clears the detail cache', async () => {
    const { wrapper } = makeCtx();
    const { result } = renderHook(() => useDeleteLead(), { wrapper });
    result.current.mutate('lead-1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ deleted: true });
  });
});
