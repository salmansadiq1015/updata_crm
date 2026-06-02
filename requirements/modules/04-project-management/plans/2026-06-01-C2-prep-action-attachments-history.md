# C2: prep-action-attachments-history Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** Wire the already-implemented server endpoints for prep-action attachments and per-action history to the client UI that already renders them, verifying each layer end-to-end with TDD before committing.

**Architecture:** The server stack is complete — `preparatoryAction.model.js` embeds an `attachments` array, `prepAction.service.js` delegates uploads to `file.service`, and `getHistory` reads audit logs via `auditService.queryByEntity`. The client stack is also structurally complete — `prep-actions-tab.jsx` contains `ManageActionDialog` (attachments list + upload + history timeline), `prep-action-service.js` exposes `getAttachments / uploadAttachment / getAttachmentDownloadUrl / getHistory`, and `keys.js` has `prepActions.attachments(pid, aid)` and `prepActions.history(pid, aid)`. The gap is that no client-side tests exist and two integration seams need verification: (1) the Vitest MSW harness does not yet have PM prep-action handlers so component tests fail with unhandled requests, and (2) a minor shape mismatch — the download endpoint returns `{ url }` wrapped in `res.success({ data: { url } })`, meaning `result.url` or `result` both need to be handled, which the current `handleDownload` in the tab already does. The plan adds the missing tests first (confirming they fail), then verifies/fixes the seams, and commits.

**Tech Stack:** Node/Express/Mongoose/Joi/Jest + Next.js/React Query/shadcn-ui/Vitest

---

## Pre-flight checklist (run before any task)

```bash
# Confirm server attachment tests already pass
cd server && npm test -- tests/pm/prepAction.attachments.test.js 2>&1 | tail -10
# Expected: PASS  src/modules/pm/__tests__/prepAction.attachments.test.js

# Confirm no existing PM component tests
ls client/src/modules/pm/components/__tests__/ 2>/dev/null || echo "DIR_DOES_NOT_EXIST"
# Expected: DIR_DOES_NOT_EXIST  (or empty)
```

---

## Task 1 — Server: verify attachment + history endpoints are routed correctly

### 1.1 Read the existing passing test to confirm baseline

```bash
cd server && npm test -- src/modules/pm/__tests__/prepAction.attachments.test.js
```

Expected output: `Tests: 5 passed` (addAttachment × 2, listAttachments × 3).  
If it fails, do not proceed — fix the existing test first.

### 1.2 Write a new server test for `getHistory`

File: `server/src/modules/pm/__tests__/prepAction.history.test.js`

```js
import { jest, describe, it, beforeAll, afterEach, expect } from '@jest/globals';

// Mock prepAction.repository
const mockFindById = jest.fn();
jest.unstable_mockModule('../prepAction.repository.js', () => ({
  default: { findById: mockFindById },
}));

// Mock auditService
const mockQueryByEntity = jest.fn();
jest.unstable_mockModule('../../auth/audit.service.js', () => ({
  default: { logEvent: jest.fn(), queryByEntity: mockQueryByEntity },
}));

// Mock cacheManager
jest.unstable_mockModule('../../../shared/cache/CacheManager.js', () => ({
  default: {
    getOrSet: jest.fn(async (_k, fn) => fn()),
    del: jest.fn(),
    invalidatePattern: jest.fn(),
  },
}));

// Mock eventBus
jest.unstable_mockModule('../../../shared/events/EventBus.js', () => ({
  default: { publish: jest.fn() },
}));
jest.unstable_mockModule('../../../shared/events/eventTypes.js', () => ({
  default: {
    PREP_ACTION_CREATED: 'PREP_ACTION_CREATED',
    PREP_ACTION_UPDATED: 'PREP_ACTION_UPDATED',
    PREP_ACTION_DELETED: 'PREP_ACTION_DELETED',
  },
}));

// Mock config / logger
jest.unstable_mockModule('../../../config/index.js', () => ({
  default: { redis: { keyPrefix: 'test:' } },
}));
jest.unstable_mockModule('../../../shared/logger/index.js', () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

let prepActionService;

beforeAll(async () => {
  prepActionService = (await import('../prepAction.service.js')).default;
});

afterEach(() => jest.clearAllMocks());

describe('prepActionService.getHistory', () => {
  it('queries auditService with module=pm, detailsKey=actionId, and eventTypePrefix=prep_action.', async () => {
    const actionId = '507f1f77bcf86cd799439011';
    mockFindById.mockResolvedValue({ _id: actionId, projectId: 'p1' });
    const fakeHistory = [
      { _id: 'h1', eventType: 'prep_action.created', timestamp: new Date('2026-01-01'), details: { actionId } },
      { _id: 'h2', eventType: 'prep_action.updated', timestamp: new Date('2026-01-02'), details: { actionId } },
    ];
    mockQueryByEntity.mockResolvedValue(fakeHistory);

    const result = await prepActionService.getHistory(actionId);

    expect(mockQueryByEntity).toHaveBeenCalledTimes(1);
    const arg = mockQueryByEntity.mock.calls[0][0];
    expect(arg.module).toBe('pm');
    expect(arg.detailsKey).toBe('actionId');
    expect(arg.eventTypePrefix).toBe('prep_action.');
    expect(arg.limit).toBe(100);

    expect(result).toBe(fakeHistory);
  });

  it('throws NotFoundError when the action does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    await expect(prepActionService.getHistory('missing-id')).rejects.toThrow();
    expect(mockQueryByEntity).not.toHaveBeenCalled();
  });

  it('returns empty array when auditService finds no entries', async () => {
    mockFindById.mockResolvedValue({ _id: 'a1', projectId: 'p1' });
    mockQueryByEntity.mockResolvedValue([]);
    const result = await prepActionService.getHistory('a1');
    expect(result).toEqual([]);
  });
});
```

### 1.3 Run the new test — confirm it FAILS (module not yet imported in test session)

```bash
cd server && npm test -- src/modules/pm/__tests__/prepAction.history.test.js
```

Expected: test file runs but all three tests PASS immediately because the service implementation at `prepAction.service.js:215-232` already calls `auditService.queryByEntity` exactly as described. If all three pass, the server layer is verified. If any fail, the output pinpoints the gap — fix the service before proceeding.

> Note: If the test runner reports `PASS` on first run, that is the desired state — the server is already correct and no server code changes are needed.

### 1.4 Commit server test

```bash
cd server
git add src/modules/pm/__tests__/prepAction.history.test.js
git commit -m "test(pm): add prepAction.getHistory unit test — verifies audit query contract"
```

---

## Task 2 — Client: create the MSW mock server for PM prep-action routes

The existing Vitest setup file (`client/src/modules/tasks/__tests__/setup.ts`) imports the MSW server from `client/src/modules/tasks/__tests__/mocks/server.ts`. PM component tests will re-use this same setup via the global `setupFiles` entry in `vitest.config.ts`. PM-specific handlers need to be added to the shared handlers array, or a separate PM handlers file needs to be created and merged in.

### 2.1 Examine the existing handlers import chain

Files to understand:
- `client/src/modules/tasks/__tests__/mocks/server.ts` — exports `setupServer(...handlers)`
- `client/src/modules/tasks/__tests__/mocks/handlers.ts` — the handlers array
- `client/src/modules/tasks/__tests__/setup.ts` — `setupFiles` entry

Because `vitest.config.ts` points `setupFiles` at `./src/modules/tasks/__tests__/setup.ts`, all tests in the repo share this one MSW server. PM handlers must be added to the existing `handlers.ts` array.

### 2.2 Add PM prep-action MSW handlers to the existing handlers file

File: `client/src/modules/tasks/__tests__/mocks/handlers.ts`

Append the following block **inside** the `handlers` array, after the last existing entry (the `http.get('/users')` handler at line 134):

```ts
  // PM — prep action attachments
  http.get(`${BASE}/pm/projects/:projectId/prep-actions/:actionId/attachments`, ({ params }) => {
    return HttpResponse.json({
      success: true,
      data: [
        {
          _id: 'att-001',
          fileId: 'file-001',
          fileName: 'technical-plan.pdf',
          uploadedBy: 'user-001',
          uploadedAt: '2026-05-01T10:00:00.000Z',
        },
      ],
    });
  }),

  http.post(
    `${BASE}/pm/projects/:projectId/prep-actions/:actionId/attachments`,
    async () => {
      return HttpResponse.json(
        {
          success: true,
          data: [
            {
              _id: 'att-002',
              fileId: 'file-002',
              fileName: 'uploaded-file.pdf',
              uploadedBy: 'user-001',
              uploadedAt: new Date().toISOString(),
            },
          ],
        },
        { status: 201 },
      );
    },
  ),

  http.get(
    `${BASE}/pm/projects/:projectId/prep-actions/:actionId/attachments/:fileId/download`,
    () => {
      return HttpResponse.json({
        success: true,
        data: { url: 'https://storage.example.com/files/file-001?token=abc' },
      });
    },
  ),

  // PM — prep action history
  http.get(`${BASE}/pm/projects/:projectId/prep-actions/:actionId/history`, () => {
    return HttpResponse.json({
      success: true,
      data: [
        {
          _id: 'hist-001',
          eventType: 'prep_action.created',
          timestamp: '2026-04-15T08:00:00.000Z',
          details: { actionId: 'action-001', changedFields: [] },
        },
        {
          _id: 'hist-002',
          eventType: 'prep_action.updated',
          timestamp: '2026-04-20T09:30:00.000Z',
          details: { actionId: 'action-001', changedFields: ['status', 'dueDate'] },
        },
        {
          _id: 'hist-003',
          eventType: 'prep_action.attachment_added',
          timestamp: '2026-05-01T10:00:00.000Z',
          details: { actionId: 'action-001', fileName: 'technical-plan.pdf' },
        },
      ],
    });
  }),

  // PM — prep action list (needed by PrepActionsTab render)
  http.get(`${BASE}/pm/projects/:projectId/prep-actions`, ({ params }) => {
    return HttpResponse.json({
      success: true,
      data: [
        {
          _id: 'action-001',
          projectId: params.projectId,
          actionType: 'OTHER',
          title: 'Test Action Alpha',
          description: null,
          isMandatory: false,
          status: 'CREATED',
          dueDate: null,
          assignedToId: null,
          externalReference: null,
          attachments: [
            { _id: 'att-001', fileId: 'file-001', fileName: 'technical-plan.pdf', uploadedAt: '2026-05-01T10:00:00.000Z' },
          ],
          createdBy: 'user-001',
          createdAt: '2026-04-15T08:00:00.000Z',
          updatedAt: '2026-04-15T08:00:00.000Z',
        },
      ],
    });
  }),

  // PM — users list (needed by UserPickerField)
  http.get(`${BASE}/users`, () => {
    return HttpResponse.json({ success: true, data: [] });
  }),
```

> The `BASE` constant is already defined at the top of `handlers.ts` as `'http://localhost:9097/api/v1'`.

### 2.3 Create the `__tests__` directory and a PM-specific MSW data helper

File: `client/src/modules/pm/components/__tests__/mocks/pm-data.ts`

```ts
export const PROJECT_ID = 'proj-000000000000000000000001';
export const ACTION_ID  = 'action-000000000000000000001';
export const FILE_ID    = 'file-0000000000000000000001';

export function makeAttachment(overrides: Partial<{
  _id: string; fileId: string; fileName: string; uploadedBy: string; uploadedAt: string;
}> = {}) {
  return {
    _id: 'att-001',
    fileId: FILE_ID,
    fileName: 'technical-plan.pdf',
    uploadedBy: 'user-001',
    uploadedAt: '2026-05-01T10:00:00.000Z',
    ...overrides,
  };
}

export function makeHistoryEntry(overrides: Partial<{
  _id: string; eventType: string; timestamp: string;
  details: Record<string, unknown>;
}> = {}) {
  return {
    _id: 'hist-001',
    eventType: 'prep_action.created',
    timestamp: '2026-04-15T08:00:00.000Z',
    details: { actionId: ACTION_ID, changedFields: [] },
    ...overrides,
  };
}

export function makePrepAction(overrides: Partial<{
  _id: string; projectId: string; title: string; actionType: string; status: string;
  isMandatory: boolean; attachments: ReturnType<typeof makeAttachment>[];
}> = {}) {
  return {
    _id: ACTION_ID,
    projectId: PROJECT_ID,
    actionType: 'OTHER',
    title: 'Test Action Alpha',
    description: null,
    isMandatory: false,
    status: 'CREATED',
    dueDate: null,
    assignedToId: null,
    externalReference: null,
    attachments: [],
    createdBy: 'user-001',
    createdAt: '2026-04-15T08:00:00.000Z',
    updatedAt: '2026-04-15T08:00:00.000Z',
    ...overrides,
  };
}
```

### 2.4 Commit the MSW handler additions and the data helper

```bash
cd client
git add src/modules/tasks/__tests__/mocks/handlers.ts
git add src/modules/pm/components/__tests__/mocks/pm-data.ts
git commit -m "test(pm): add MSW handlers and data helpers for prep-action attachments + history"
```

---

## Task 3 — Client: write failing component tests for ManageActionDialog

### 3.1 Write the test file

File: `client/src/modules/pm/components/__tests__/manage-action-dialog.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../../tasks/__tests__/mocks/server';
import { PROJECT_ID, ACTION_ID, FILE_ID, makeAttachment, makeHistoryEntry, makePrepAction } from './mocks/pm-data';

// --- Minimal stubs for context providers used by the component ---
vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string, fallback: string) => fallback }),
}));
vi.mock('@/shared/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock('@/lib/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

// Lazy import the component after mocks are set up
async function importComponent() {
  const mod = await import('../prep-actions-tab');
  return mod;
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={makeClient()}>
      {children}
    </QueryClientProvider>
  );
}

describe('ManageActionDialog — attachments section', () => {
  it('renders the attachment list returned by the server', async () => {
    server.use(
      http.get('*/pm/projects/:projectId/prep-actions/:actionId/attachments', () =>
        HttpResponse.json({ success: true, data: [makeAttachment()] }),
      ),
      http.get('*/pm/projects/:projectId/prep-actions/:actionId/history', () =>
        HttpResponse.json({ success: true, data: [] }),
      ),
    );

    // Import PrepActionsTab and trigger ManageActionDialog by rendering the tab
    // with MSW returning one action that has the Paperclip button
    server.use(
      http.get('*/pm/projects/:projectId/prep-actions', () =>
        HttpResponse.json({
          success: true,
          data: [makePrepAction({ attachments: [makeAttachment()] })],
        }),
      ),
    );

    const { PrepActionsTab } = await importComponent();
    render(<PrepActionsTab projectId={PROJECT_ID} />, { wrapper: Wrapper });

    // Click the Paperclip/manage button on the first action card
    await waitFor(() => expect(screen.getByTitle('Attachments & history')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Attachments & history'));

    // Dialog opens and the attachment filename appears
    await waitFor(() => expect(screen.getByText('technical-plan.pdf')).toBeInTheDocument());
  });

  it('shows "No attachments." when the server returns an empty array', async () => {
    server.use(
      http.get('*/pm/projects/:projectId/prep-actions/:actionId/attachments', () =>
        HttpResponse.json({ success: true, data: [] }),
      ),
      http.get('*/pm/projects/:projectId/prep-actions/:actionId/history', () =>
        HttpResponse.json({ success: true, data: [] }),
      ),
      http.get('*/pm/projects/:projectId/prep-actions', () =>
        HttpResponse.json({
          success: true,
          data: [makePrepAction({ attachments: [] })],
        }),
      ),
    );

    const { PrepActionsTab } = await importComponent();
    render(<PrepActionsTab projectId={PROJECT_ID} />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTitle('Attachments & history')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Attachments & history'));

    await waitFor(() => expect(screen.getByText('No attachments.')).toBeInTheDocument());
  });

  it('calls the download endpoint and opens a URL when the download button is clicked', async () => {
    const fakeUrl = 'https://storage.example.com/files/file-001?token=abc';
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null as unknown as Window);

    server.use(
      http.get('*/pm/projects/:projectId/prep-actions/:actionId/attachments', () =>
        HttpResponse.json({ success: true, data: [makeAttachment()] }),
      ),
      http.get('*/pm/projects/:projectId/prep-actions/:actionId/attachments/:fileId/download', () =>
        HttpResponse.json({ success: true, data: { url: fakeUrl } }),
      ),
      http.get('*/pm/projects/:projectId/prep-actions/:actionId/history', () =>
        HttpResponse.json({ success: true, data: [] }),
      ),
      http.get('*/pm/projects/:projectId/prep-actions', () =>
        HttpResponse.json({
          success: true,
          data: [makePrepAction({ attachments: [makeAttachment()] })],
        }),
      ),
    );

    const { PrepActionsTab } = await importComponent();
    render(<PrepActionsTab projectId={PROJECT_ID} />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTitle('Attachments & history')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Attachments & history'));

    // Wait for attachment row, then click Download
    await waitFor(() => expect(screen.getByText('technical-plan.pdf')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Download'));

    await waitFor(() => expect(windowOpenSpy).toHaveBeenCalledWith(fakeUrl, '_blank'));
    windowOpenSpy.mockRestore();
  });
});

describe('ManageActionDialog — history section', () => {
  it('renders history entries with human-readable event labels', async () => {
    const entries = [
      makeHistoryEntry({ eventType: 'prep_action.created', timestamp: '2026-04-15T08:00:00.000Z', details: { changedFields: [] } }),
      makeHistoryEntry({ _id: 'hist-002', eventType: 'prep_action.updated', timestamp: '2026-04-20T09:30:00.000Z', details: { changedFields: ['status'] } }),
      makeHistoryEntry({ _id: 'hist-003', eventType: 'prep_action.attachment_added', timestamp: '2026-05-01T10:00:00.000Z', details: {} }),
    ];

    server.use(
      http.get('*/pm/projects/:projectId/prep-actions/:actionId/attachments', () =>
        HttpResponse.json({ success: true, data: [] }),
      ),
      http.get('*/pm/projects/:projectId/prep-actions/:actionId/history', () =>
        HttpResponse.json({ success: true, data: entries }),
      ),
      http.get('*/pm/projects/:projectId/prep-actions', () =>
        HttpResponse.json({ success: true, data: [makePrepAction()] }),
      ),
    );

    const { PrepActionsTab } = await importComponent();
    render(<PrepActionsTab projectId={PROJECT_ID} />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTitle('Attachments & history')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Attachments & history'));

    await waitFor(() => expect(screen.getByText('Created')).toBeInTheDocument());
    expect(screen.getByText('Updated')).toBeInTheDocument();
    expect(screen.getByText('Attachment added')).toBeInTheDocument();
  });

  it('renders changed field names beneath an Updated entry', async () => {
    server.use(
      http.get('*/pm/projects/:projectId/prep-actions/:actionId/attachments', () =>
        HttpResponse.json({ success: true, data: [] }),
      ),
      http.get('*/pm/projects/:projectId/prep-actions/:actionId/history', () =>
        HttpResponse.json({
          success: true,
          data: [
            makeHistoryEntry({
              eventType: 'prep_action.updated',
              details: { changedFields: ['status', 'dueDate'] },
            }),
          ],
        }),
      ),
      http.get('*/pm/projects/:projectId/prep-actions', () =>
        HttpResponse.json({ success: true, data: [makePrepAction()] }),
      ),
    );

    const { PrepActionsTab } = await importComponent();
    render(<PrepActionsTab projectId={PROJECT_ID} />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTitle('Attachments & history')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Attachments & history'));

    await waitFor(() => expect(screen.getByText(/Fields: status, dueDate/)).toBeInTheDocument());
  });

  it('shows "No history yet." when the history array is empty', async () => {
    server.use(
      http.get('*/pm/projects/:projectId/prep-actions/:actionId/attachments', () =>
        HttpResponse.json({ success: true, data: [] }),
      ),
      http.get('*/pm/projects/:projectId/prep-actions/:actionId/history', () =>
        HttpResponse.json({ success: true, data: [] }),
      ),
      http.get('*/pm/projects/:projectId/prep-actions', () =>
        HttpResponse.json({ success: true, data: [makePrepAction()] }),
      ),
    );

    const { PrepActionsTab } = await importComponent();
    render(<PrepActionsTab projectId={PROJECT_ID} />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByTitle('Attachments & history')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Attachments & history'));

    await waitFor(() => expect(screen.getByText('No history yet.')).toBeInTheDocument());
  });
});
```

### 3.2 Run the tests — confirm FAIL

```bash
cd client && npx vitest run src/modules/pm/components/__tests__/manage-action-dialog.test.tsx
```

Expected output (failing): Tests throw because `queryKeys.pm.prepActions` keys or MSW handler path patterns do not align, or because the dialog does not open programmatically in the test (the `onManage` state-setter is internal to `PrepActionsTab` and triggered by clicking a card button). The test as written **should** work structurally — if it passes on the first run, record that as PASS and proceed.

Common failures at this stage:
1. **`window.open` not mocked** — handled by `vi.spyOn` above.
2. **`useLanguage` / `usePermissions` not resolved** — handled by `vi.mock` above.
3. **`@/lib/api/client` base URL mismatch** — check `client/src/lib/api/client.js` to confirm `baseURL` is `http://localhost:9097/api/v1` in test environments.

### 3.3 Fix: check the API client base URL

File to inspect: `client/src/lib/api/client.js` (or `.ts`).

The MSW handler base `'http://localhost:9097/api/v1'` must match the base URL used by `apiClient`. If the client uses an env-based base URL that resolves to `''` in test (i.e. `process.env.NEXT_PUBLIC_API_URL` is undefined), use a wildcard glob pattern (`*/pm/projects/...`) in the `http.get` handlers — which is already done in the test above with `'*/pm/projects/:projectId/...'`. No code change needed.

### 3.4 Fix if `ManageActionDialog` query is not triggered when `open=false`

The `useQuery` calls inside `ManageActionDialog` have `enabled: open && !!actionId`. When the component is mounted but `open=false`, no network call is made. The test opens the dialog by clicking the Paperclip button which sets `manageAction` in `PrepActionsTab` state, triggering `open={!!manageAction}=true`. This flow is correct — no code change needed.

### 3.5 Run the tests again — confirm PASS

```bash
cd client && npx vitest run src/modules/pm/components/__tests__/manage-action-dialog.test.tsx
```

Expected: `Tests: 7 passed, 0 failed`.

### 3.6 Commit the component tests

```bash
cd client
git add src/modules/pm/components/__tests__/manage-action-dialog.test.tsx
git commit -m "test(pm): add ManageActionDialog component tests for attachments and history"
```

---

## Task 4 — Client: verify the upload mutation invalidates all required query keys

### 4.1 Inspect the current `upload` mutation in `prep-actions-tab.jsx`

The `upload` mutation in `ManageActionDialog` (line 237-246 of `prep-actions-tab.jsx`) already invalidates:
- `queryKeys.pm.prepActions.attachments(projectId, actionId)` — refreshes the attachment list in the dialog
- `queryKeys.pm.prepActions.history(projectId, actionId)` — refreshes the history (new `prep_action.attachment_added` entry)
- `queryKeys.pm.prepActions.byProject(projectId)` — refreshes the `attachments.length` badge on the ActionCard

This is the correct and complete set. No code change needed.

### 4.2 Write a test for the upload mutation's invalidation contract

File: `client/src/modules/pm/components/__tests__/upload-mutation-invalidation.test.tsx`

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../../tasks/__tests__/mocks/server';
import { PROJECT_ID, ACTION_ID, makeAttachment, makePrepAction } from './mocks/pm-data';

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string, fallback: string) => fallback }),
}));
vi.mock('@/shared/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock('@/lib/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function Wrapper({ children, client }: { children: React.ReactNode; client: QueryClient }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('upload mutation invalidation', () => {
  it('invalidates attachments, history, and byProject queries after a successful upload', async () => {
    const queryClient = makeClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    let attachCallCount = 0;
    server.use(
      http.get('*/pm/projects/:projectId/prep-actions', () =>
        HttpResponse.json({ success: true, data: [makePrepAction()] }),
      ),
      http.get('*/pm/projects/:projectId/prep-actions/:actionId/attachments', () => {
        attachCallCount += 1;
        return HttpResponse.json({ success: true, data: attachCallCount === 1 ? [] : [makeAttachment()] });
      }),
      http.get('*/pm/projects/:projectId/prep-actions/:actionId/history', () =>
        HttpResponse.json({ success: true, data: [] }),
      ),
      http.post('*/pm/projects/:projectId/prep-actions/:actionId/attachments', () =>
        HttpResponse.json({ success: true, data: [makeAttachment()] }, { status: 201 }),
      ),
    );

    const { PrepActionsTab } = await import('../prep-actions-tab');
    render(<PrepActionsTab projectId={PROJECT_ID} />, {
      wrapper: ({ children }) => <Wrapper client={queryClient}>{children}</Wrapper>,
    });

    // Open the manage dialog
    await waitFor(() => expect(screen.getByTitle('Attachments & history')).toBeInTheDocument());
    fireEvent.click(screen.getByTitle('Attachments & history'));
    await waitFor(() => expect(screen.getByText('No attachments.')).toBeInTheDocument());

    // Trigger the file upload via the hidden input
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['content'], 'new-doc.pdf', { type: 'application/pdf' });
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fireEvent.change(fileInput);

    // Verify the three invalidateQueries calls happen
    await waitFor(() => {
      const calls = invalidateSpy.mock.calls;
      const keys = calls.map((c) => JSON.stringify(c[0]?.queryKey));
      expect(keys).toContain(JSON.stringify(['pm', 'prepActions', PROJECT_ID, ACTION_ID, 'attachments']));
      expect(keys).toContain(JSON.stringify(['pm', 'prepActions', PROJECT_ID, ACTION_ID, 'history']));
      expect(keys).toContain(JSON.stringify(['pm', 'prepActions', PROJECT_ID]));
    });
  });
});
```

### 4.3 Run the test — confirm FAIL then PASS

```bash
cd client && npx vitest run src/modules/pm/components/__tests__/upload-mutation-invalidation.test.tsx
```

If any invalidation key is missing, add it to the `upload.onSuccess` callback inside `ManageActionDialog` in `client/src/modules/pm/components/prep-actions-tab.jsx`.

The current code (lines 240-243):
```js
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: queryKeys.pm.prepActions.attachments(projectId, actionId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.pm.prepActions.history(projectId, actionId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.pm.prepActions.byProject(projectId) });
```

This is already complete. The test should pass on first run.

### 4.4 Commit

```bash
cd client
git add src/modules/pm/components/__tests__/upload-mutation-invalidation.test.tsx
git commit -m "test(pm): verify upload mutation invalidates attachments, history, and byProject keys"
```

---

## Task 5 — Client: verify the `getHistory` service method shape

### 5.1 Write a service unit test

File: `client/src/modules/pm/services/__tests__/prep-action-service.test.ts`

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../../tasks/__tests__/mocks/server';

// Mock the api client to use the MSW-intercepted base URL
vi.mock('@/lib/api/client', async () => {
  const axios = (await import('axios')).default;
  return {
    default: axios.create({ baseURL: 'http://localhost:9097/api/v1' }),
  };
});

// Re-import after mock
async function getService() {
  const mod = await import('../prep-action-service');
  return mod.prepActionService;
}

const PROJECT_ID = 'proj-000000000000000000000001';
const ACTION_ID  = 'action-000000000000000000001';
const FILE_ID    = 'file-0000000000000000000001';

describe('prepActionService.getAttachments', () => {
  it('returns the data array from the server response', async () => {
    server.use(
      http.get(`*/pm/projects/${PROJECT_ID}/prep-actions/${ACTION_ID}/attachments`, () =>
        HttpResponse.json({
          success: true,
          data: [{ _id: 'att-1', fileId: FILE_ID, fileName: 'plan.pdf', uploadedAt: '2026-05-01T10:00:00.000Z' }],
        }),
      ),
    );
    const svc = await getService();
    const result = await svc.getAttachments(PROJECT_ID, ACTION_ID);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].fileName).toBe('plan.pdf');
  });
});

describe('prepActionService.getHistory', () => {
  it('returns the data array of audit history entries', async () => {
    server.use(
      http.get(`*/pm/projects/${PROJECT_ID}/prep-actions/${ACTION_ID}/history`, () =>
        HttpResponse.json({
          success: true,
          data: [
            { _id: 'h1', eventType: 'prep_action.created', timestamp: '2026-04-15T08:00:00.000Z', details: {} },
          ],
        }),
      ),
    );
    const svc = await getService();
    const result = await svc.getHistory(PROJECT_ID, ACTION_ID);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0].eventType).toBe('prep_action.created');
  });
});

describe('prepActionService.getAttachmentDownloadUrl', () => {
  it('returns the data object containing the url property', async () => {
    const fakeUrl = 'https://storage.example.com/files/file-001?token=abc';
    server.use(
      http.get(`*/pm/projects/${PROJECT_ID}/prep-actions/${ACTION_ID}/attachments/${FILE_ID}/download`, () =>
        HttpResponse.json({ success: true, data: { url: fakeUrl } }),
      ),
    );
    const svc = await getService();
    const result = await svc.getAttachmentDownloadUrl(PROJECT_ID, ACTION_ID, FILE_ID);
    // The component accesses result?.url — verify that path is correct
    expect(result).toMatchObject({ url: fakeUrl });
  });
});
```

### 5.2 Run the test — confirm FAIL then PASS

```bash
cd client && npx vitest run src/modules/pm/services/__tests__/prep-action-service.test.ts
```

If the API client mock does not intercept correctly (e.g. `baseURL` from env differs), add `NEXT_PUBLIC_API_URL=http://localhost:9097` to `client/.env.test` and re-run.

### 5.3 Verify the `handleDownload` shape in the component

The `handleDownload` function in `ManageActionDialog` (lines 248-255 of `prep-actions-tab.jsx`):
```js
const result = await prepActionService.getAttachmentDownloadUrl(projectId, actionId, att.fileId);
const url = result?.url || result;
if (url) window.open(url, '_blank');
```

`prepActionService.getAttachmentDownloadUrl` returns `res.data` which is `{ url: '...' }`. So `result?.url` resolves to the URL string. The fallback `|| result` handles a hypothetical string-only response. This is correct — no code change needed.

### 5.4 Commit

```bash
cd client
git add src/modules/pm/services/__tests__/prep-action-service.test.ts
git commit -m "test(pm): add service-level tests for getAttachments, getHistory, getAttachmentDownloadUrl"
```

---

## Task 6 — Client: `__tests__` directory setup file (if needed)

The vitest `setupFiles` entry already points to `client/src/modules/tasks/__tests__/setup.ts`. Because PM tests live in a different directory, they share the same global setup. Confirm this by running one PM test and checking that MSW is active:

```bash
cd client && npx vitest run src/modules/pm/components/__tests__/manage-action-dialog.test.tsx --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|MSW|unhandled)"
```

If `onUnhandledRequest: 'warn'` fires for any PM route, add a matching handler to `handlers.ts` (Task 2 should have covered all needed routes).

---

## Task 7 — Full suite run and AGENTS.md compliance check

### 7.1 Check AGENTS.md requirement (Next.js custom docs)

Per `client/AGENTS.md`: "Read the relevant guide in `node_modules/next/dist/docs/` before writing any client code."

The implementation for C2 does not add any new Next.js page files, layouts, or route handlers — it only adds test files and (if needed) edits an existing component. The existing `prep-actions-tab.jsx` is a `'use client'` component using React Query, which is compatible with Next.js App Router client components. No new `node_modules/next/dist/docs/` reading is required for the test additions.

If any new page or layout is added during this cluster, read `node_modules/next/dist/docs/01-app/01-getting-started/` first.

### 7.2 Run all PM server tests

```bash
cd server && npm test -- src/modules/pm/__tests__/
```

Expected: all 3 test files pass (attachments, history, pm.events).

### 7.3 Run all PM client tests

```bash
cd client && npx vitest run src/modules/pm/
```

Expected: 3 new test files pass — `manage-action-dialog.test.tsx`, `upload-mutation-invalidation.test.tsx`, `prep-action-service.test.ts`.

### 7.4 Final commit

```bash
git add -A
git commit -m "feat(pm): C2 complete — prep-action attachments and history UI verified end-to-end with TDD"
```

---

## Summary of files created/modified

| Path | Action |
|------|--------|
| `server/src/modules/pm/__tests__/prepAction.history.test.js` | CREATE — unit test for `getHistory` service method |
| `client/src/modules/tasks/__tests__/mocks/handlers.ts` | EDIT — append PM prep-action MSW handlers |
| `client/src/modules/pm/components/__tests__/mocks/pm-data.ts` | CREATE — test data helpers |
| `client/src/modules/pm/components/__tests__/manage-action-dialog.test.tsx` | CREATE — component tests for attachments + history dialog |
| `client/src/modules/pm/components/__tests__/upload-mutation-invalidation.test.tsx` | CREATE — mutation invalidation contract test |
| `client/src/modules/pm/services/__tests__/prep-action-service.test.ts` | CREATE — service-level HTTP shape tests |

No production code changes are required for C2 — both the server endpoints and the client UI are already implemented. The cluster's purpose is to add the missing test coverage that confirms the seams are correct and to lock in the behavior so future changes cannot silently break attachments or history.

---

## AC traceability

| AC | Requirement | Closed by |
|----|-------------|-----------|
| PROJ-003 AC-1 | Attachments UI in prep-action form | Task 3 tests — `ManageActionDialog` attachment list + upload renders and functions |
| PROJ-003 AC-6 | Per-action history view | Task 3 tests — `ManageActionDialog` history timeline renders with labels and changed fields |
