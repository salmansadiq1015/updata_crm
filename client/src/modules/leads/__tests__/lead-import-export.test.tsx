import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import type { ReactNode } from 'react';
import type { AxiosResponse } from 'axios';
import { server } from './mocks/server';
import { server as tasksServer } from '../../tasks/__tests__/mocks/server';
import { BASE } from './mocks/handlers';

// ── Module mocks (mirror the other leads tests) ────────────────────────────────

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

// `leads.*` keys resolve to the English fallback, with {var} interpolation.
vi.mock('@/lib/i18n/language-context', () => {
  const t = (key: string, fallback?: string | null, vars?: Record<string, unknown>) => {
    const text = fallback ?? key;
    return vars
      ? text.replace(/\{(\w+)\}/g, (_, name) => (vars[name] != null ? String(vars[name]) : `{${name}}`))
      : text;
  };
  const value = { locale: 'en', language: 'en', dir: 'ltr', isRTL: false, t };
  return { useLanguage: () => value, LanguageProvider: ({ children }: { children: ReactNode }) => children };
});

// Callable store hook (selector or whole state), so useAuthStore(selector) works.
vi.mock('@/stores/auth-store', () => {
  const state = { user: { id: 'u-me' }, isAuthenticated: true, isLoading: false, accessToken: 'tkn' };
  const useAuthStore = Object.assign(
    (selector?: (value: typeof state) => unknown) => (selector ? selector(state) : state),
    { getState: () => ({ ...state }) },
  );
  return { useAuthStore };
});

import { LeadImportDialog } from '../ui/lead-import-dialog';
import { LeadExportMenu } from '../ui/lead-export-menu';
import { useLeadsStore } from '../state/leads-store';
import { showSuccess } from '@/lib/toast';
import apiClient from '@/lib/api/client';

const L = `${BASE}/crm/leads`;

// Download side-effects stubbed so jsdom never attempts a real navigation.
const createObjectURL = vi.fn(() => 'blob:mock-url');
const revokeObjectURL = vi.fn();
let anchorClick: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  // The shared vitest setup starts the tasks module's MSW server for every file;
  // stand it down so it does not race the leads handlers.
  tasksServer.close();
  server.listen({ onUnhandledRequest: 'bypass' });
  // jsdom lacks what Radix popovers/menus/dialogs measure with.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  HTMLElement.prototype.hasPointerCapture ??= vi.fn(() => false);
  HTMLElement.prototype.releasePointerCapture ??= vi.fn();
  HTMLElement.prototype.scrollIntoView ??= vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
});
afterEach(() => server.resetHandlers());
afterAll(() => {
  server.close();
  anchorClick.mockRestore();
});

beforeEach(() => {
  vi.clearAllMocks();
  useLeadsStore.getState().reset();
});

function renderUi(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const user = userEvent.setup();
  const view = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
  return { user, ...view };
}

// ── Import ─────────────────────────────────────────────────────────────────────

// The upload is multipart/form-data. jsdom's XHR cannot serialize a FormData
// body, so the POST can never reach MSW; we spy on the (mocked) transport
// instead. `leadApi.importLeads` still runs for real, so the FormData it builds
// is exactly what ships — which is what lets us assert the `file`/`mode` contract.
describe('LeadImportDialog', () => {
  it('uploads a file and shows the summary with counts, warnings and errors', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: {
        summary: { total: 11, created: 5, skipped: 2, duplicates: 3, failed: 1 },
        errors: [{ row: 4, message: 'Missing name' }],
        warnings: ['Column "xyz" was ignored'],
        format: 'csv',
      },
    } as never);

    try {
      const { user } = renderUi(<LeadImportDialog open onOpenChange={() => {}} />);

      // Choose a file through the hidden input.
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['name,phone\nAcme,044'], 'leads.csv', { type: 'text/csv' });
      await user.upload(input, file);
      expect(await screen.findByText('leads.csv')).toBeInTheDocument();

      // Pick a non-default duplicate mode, then import.
      await user.click(screen.getAllByRole('radio')[2]); // "Update existing"
      await user.click(screen.getByRole('button', { name: 'Import' }));

      // Summary view with its headline + per-bucket tiles.
      expect(await screen.findByText('Import complete')).toBeInTheDocument();
      expect(screen.getByText('5 created, 1 failed')).toBeInTheDocument();
      expect(screen.getByText('Created')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('Duplicates')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();

      // Warnings render; row errors sit behind an expander.
      expect(screen.getByText('Column "xyz" was ignored')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /view errors/i }));
      expect(screen.getByText('Missing name')).toBeInTheDocument();

      // Contract: endpoint, multipart field `file`, and the chosen `mode`.
      expect(postSpy).toHaveBeenCalledTimes(1);
      const [url, body] = postSpy.mock.calls[0] as [string, FormData];
      expect(url).toBe('/crm/leads/import');
      expect(body).toBeInstanceOf(FormData);
      expect(body.get('file')).toBeInstanceOf(File);
      expect((body.get('file') as File).name).toBe('leads.csv');
      expect(body.get('mode')).toBe('update');

      // A summary toast is raised on success.
      expect(showSuccess).toHaveBeenCalledWith('5 created, 1 failed');
    } finally {
      postSpy.mockRestore();
    }
  });

  it('defaults the import mode to "new"', async () => {
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      data: { summary: { total: 1, created: 1, skipped: 0, duplicates: 0, failed: 0 }, errors: [], warnings: [], format: 'csv' },
    } as never);

    try {
      const { user } = renderUi(<LeadImportDialog open onOpenChange={() => {}} />);
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      await user.upload(input, new File(['a'], 'x.csv', { type: 'text/csv' }));
      await user.click(screen.getByRole('button', { name: 'Import' }));

      await screen.findByText('Import complete');
      const [, body] = postSpy.mock.calls[0] as [string, FormData];
      expect(body.get('mode')).toBe('new');
    } finally {
      postSpy.mockRestore();
    }
  });
});

// ── Export ─────────────────────────────────────────────────────────────────────

describe('LeadExportMenu', () => {
  const CASES = [
    { format: 'csv', item: 'CSV' },
    { format: 'xlsx', item: 'Excel' },
    { format: 'pdf', item: 'PDF' },
  ] as const;

  for (const { format, item } of CASES) {
    it(`exports as ${item} with the current list filters`, async () => {
      const requests: URL[] = [];
      server.use(
        http.get(`${L}/export`, ({ request }) => {
          requests.push(new URL(request.url));
          return new HttpResponse('a,b\n1,2', {
            headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="leads.csv"' },
          });
        }),
      );
      // Seed the live filters the menu must forward.
      useLeadsStore.getState().setFilters({ status: 'qualified', source: 'manual', search: 'bakery' });

      const { user } = renderUi(<LeadExportMenu />);
      await user.click(screen.getByRole('button', { name: /export/i }));
      await user.click(await screen.findByRole('menuitem', { name: item }));

      await waitFor(() => expect(requests).toHaveLength(1));
      const url = requests[0];
      expect(url.searchParams.get('format')).toBe(format);
      expect(url.searchParams.get('status')).toBe('qualified');
      expect(url.searchParams.get('source')).toBe('manual');
      expect(url.searchParams.get('q')).toBe('bakery');

      // The fetched blob is handed to the browser as a download.
      await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    });
  }

  it('triggers a browser download and omits inactive filters', async () => {
    const requests: URL[] = [];
    server.use(
      http.get(`${L}/export`, ({ request }) => {
        requests.push(new URL(request.url));
        return new HttpResponse('a,b\n1,2', {
          headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="leads-2026.csv"' },
        });
      }),
    );

    // Default filters (everything = ALL): only `format` should be sent.
    const { user } = renderUi(<LeadExportMenu />);
    await user.click(screen.getByRole('button', { name: /export/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'CSV' }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(anchorClick).toHaveBeenCalled();

    const url = requests[0];
    expect(url.searchParams.get('format')).toBe('csv');
    expect(url.searchParams.has('status')).toBe(false);
    expect(url.searchParams.has('source')).toBe(false);
    expect(url.searchParams.has('q')).toBe(false);
  });
});
