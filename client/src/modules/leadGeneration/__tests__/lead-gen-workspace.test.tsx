import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { http, HttpResponse } from 'msw';
import type { AxiosResponse } from 'axios';
import { server } from './mocks/server';
import { BASE } from './mocks/handlers';
import { makeResultDTO, ok, okPage } from './mocks/data';

// Point the (mocked) api client at the MSW base and unwrap the envelope, exactly
// like the foundation hook tests.
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

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() }),
  usePathname: () => '/lead-generation',
}));

import { LanguageProvider } from '@/lib/i18n/language-context';
import { useLeadGenStore } from '../state/lead-gen-store';
import { LeadGenWorkspace } from '../ui/lead-gen-workspace';

// react-virtual (virtual-core) measures the scroll element via offsetWidth/
// offsetHeight, which jsdom reports as 0 — so give it a viewport, plus a
// ResizeObserver stub, or no rows ever virtualize.
const offsetHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
const offsetWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
  globalThis.ResizeObserver =
    globalThis.ResizeObserver ||
    (class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver);
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 440 });
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  if (offsetHeightDescriptor) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeightDescriptor);
  if (offsetWidthDescriptor) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidthDescriptor);
});

beforeEach(() => {
  try {
    window.localStorage.setItem('updata-locale', 'en');
  } catch {
    /* ignore */
  }
  useLeadGenStore.getState().reset();
  pushMock.mockClear();
  // The workspace fetches the workspace-user directory for the assignee picker.
  server.use(http.get(`${BASE}/users/directory`, () => HttpResponse.json(ok([]))));
});

function renderWorkspace() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(
      NuqsTestingAdapter,
      null,
      createElement(QueryClientProvider, { client: queryClient }, createElement(LanguageProvider, null, children)),
    );
  return render(createElement(LeadGenWorkspace), { wrapper });
}

/** Simulate the user having picked a location + radius on the map/search. */
function seedLocationAndArea() {
  act(() => {
    const store = useLeadGenStore.getState();
    store.setLocationDraft({ name: 'Zürich', center: { lat: 47.3769, lng: 8.5417 }, formattedAddress: 'Zürich, CH' });
    store.setAreaDraft({ type: 'radius', radiusMeters: 2000, geometry: null, bounds: null });
  });
}

describe('LeadGenWorkspace', () => {
  it('fetches contact details when a result opens instead of treating the contact-free list row as fresh detail data', async () => {
    const base = makeResultDTO({ id: 'res-four-points', placeId: 'place-four-points' });
    const listResult = {
      ...base,
      business: {
        ...base.business,
        name: 'Four Points by Sheraton Lahore',
        phone: null,
        internationalPhone: null,
        normalizedPhone: null,
        website: null,
        websiteDomain: null,
        email: null,
      },
    };
    const detailResult = {
      ...listResult,
      business: {
        ...listResult.business,
        phone: '+92 42 36310077',
        internationalPhone: '+92 42 36310077',
        normalizedPhone: '+924236310077',
        website: 'https://www.marriott.com/en-us/hotels/lhefp-four-points-lahore/overview/',
        websiteDomain: 'marriott.com',
        email: 'lahore.reservations@example.com',
      },
    };
    let detailRequests = 0;
    server.use(
      http.get(`${BASE}/business-discovery/sessions/:id/results`, () =>
        HttpResponse.json(okPage([listResult])),
      ),
      http.get(`${BASE}/business-discovery/sessions/:id/results/:resultId`, () => {
        detailRequests += 1;
        return HttpResponse.json(ok(detailResult));
      }),
    );

    renderWorkspace();
    seedLocationAndArea();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Restaurant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start analysis' }));

    const row = await screen.findByRole('row');
    expect(screen.getByText('Four Points by Sheraton Lahore')).toBeInTheDocument();
    fireEvent.click(row);

    // The repository-wide Vitest setup installs a second MSW server, so the
    // same intercepted request can visit this handler twice in the test
    // process. The regression assertion is that opening the row does invoke
    // the detail endpoint (the old cache-seeding bug invoked it zero times).
    await waitFor(() => expect(detailRequests).toBeGreaterThanOrEqual(1));
    expect(await screen.findByRole('link', { name: '+92 42 36310077' })).toHaveAttribute('href', 'tel:+924236310077');
    expect(screen.getByRole('link', { name: 'lahore.reservations@example.com' })).toHaveAttribute(
      'href',
      'mailto:lahore.reservations@example.com',
    );
    expect(screen.getByRole('link', { name: /marriott\.com/i })).toHaveAttribute(
      'href',
      expect.stringContaining('marriott.com'),
    );
  });

  it('runs the wizard, creates a session and shows results, then imports with a server preview + summary', async () => {
    renderWorkspace();

    // Step 1 — Location.
    expect(screen.getByText('Choose a location')).toBeInTheDocument();
    seedLocationAndArea();

    // Location → Business type.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Select business types')).toBeInTheDocument();

    // Pick a popular category (catalog is served by MSW).
    const restaurant = await screen.findByRole('checkbox', { name: 'Restaurant' });
    fireEvent.click(restaurant);

    // Business type → Review.
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Review your search')).toBeInTheDocument();

    // Start analysis creates a session and switches to results (session RUNNING
    // already has 18 discovered → the map+list render immediately).
    fireEvent.click(screen.getByRole('button', { name: 'Start analysis' }));

    expect(await screen.findByText('Results')).toBeInTheDocument();
    const cards = await screen.findAllByText('ABC Restaurant');
    expect(cards.length).toBeGreaterThan(0);
    // Honest summary from the session counts.
    expect(screen.getByText(/18 businesses/i)).toBeInTheDocument();
    expect(screen.getByText(/12 new/i)).toBeInTheDocument();

    // Add All New opens the import preview with server-computed counts.
    fireEvent.click(screen.getByRole('button', { name: /add all new \(12\)/i }));

    expect(await screen.findByText('Import preview')).toBeInTheDocument();
    const importButton = await screen.findByRole('button', { name: 'Import 12 leads' });
    fireEvent.click(importButton);

    // Truthful import summary.
    expect((await screen.findAllByText('Import complete')).length).toBeGreaterThan(0);
    expect(screen.getByText('12 imported')).toBeInTheDocument();
  });

  it('blocks progressing past Location until a location and area are chosen', async () => {
    renderWorkspace();
    expect(screen.getByText('Choose a location')).toBeInTheDocument();
    // No location yet → Next is disabled.
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    seedLocationAndArea();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('requires at least one business type before leaving that step', async () => {
    renderWorkspace();
    seedLocationAndArea();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Select business types')).toBeInTheDocument();
    // Nothing selected → Next disabled.
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    const restaurant = await screen.findByRole('checkbox', { name: 'Restaurant' });
    fireEvent.click(restaurant);
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });
});
