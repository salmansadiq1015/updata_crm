# C5: document-repository-gaps Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** Close PROJ-006 AC-3 (server-backed date-range search), AC-5 (mobile-upload bridge fully tested), and AC-6 (restore/trash UI) so the PM Documents tab has server-side filtering, surfaces mobile-uploaded files automatically, and lets users view and recover soft-deleted documents within 30 days.

**Architecture:** The server layer already has all repository/service/controller/route primitives for list-with-filters, createFromStoredFile, softDelete, and restore; this cluster wires the missing pieces: a `listDeleted` repository method + route, a `search` query param forwarded to the server on every keystroke (debounced), and a Trash drawer component that calls the existing `POST /:docId/restore` endpoint. The mobile bridge is already implemented in `server/src/modules/mobile/document.controller.js`; this cluster adds a comprehensive test that drives the full happy-path and error-path to confirm AC-5 is satisfied.

**Tech Stack:** Node/Express/Mongoose/Joi/Jest + Next.js/React Query/shadcn-ui/Vitest

---

## Pre-flight checklist (read before touching any file)

1. Read `client/AGENTS.md` — this is a customised Next.js; consult `client/node_modules/next/dist/docs/` before any client-side Next.js API usage.
2. Confirm working directory before every shell command; use absolute paths.
3. Server test command: `cd server && npm test -- tests/unit/pm.documents.test.js`
4. Client test command: `cd client && npx vitest run src/modules/pm/components/__tests__/documents-tab.test.jsx`

---

## Task 1 — Server: `listDeleted` repository + route (AC-6 server half)

### 1-A. Write the failing test

Create file: `server/tests/unit/pm.documents.test.js`

```js
// server/tests/unit/pm.documents.test.js
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let Project, ProjectDocument, User, Role, Customer;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/auth/auditLog.model.js');
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/pm/project.model.js');
  await import('../../src/modules/pm/projectDocument.model.js');
  Project = mongoose.model('Project');
  ProjectDocument = mongoose.model('ProjectDocument');
  User = mongoose.model('User');
  Role = mongoose.model('Role');
  Customer = mongoose.model('Customer');
});

afterEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

let _seq = 0;
function seq() { return ++_seq; }

async function seedUser() {
  const role = await Role.create({ name: `Role_${seq()}`, permissions: [] });
  return User.create({
    email: `user${seq()}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Test', lastName: 'PM',
    role: role._id, status: 'active',
  });
}

async function seedProject(overrides = {}) {
  const user = await seedUser();
  const customer = await Customer.create({
    customerNumber: `K-${50000 + seq()}`,
    name: `Kunde ${seq()}`,
    type: 'business',
    postalCode: '8001',
    city: 'Zürich',
    canton: 'ZH',
    createdBy: user._id,
  });
  return Project.create({
    projectNumber: `P-${60000 + seq()}`,
    name: `Projekt ${seq()}`,
    projectType: 'NEW_INSTALLATION',
    customerId: customer._id,
    projectManagerId: user._id,
    createdBy: user._id,
    status: 'DRAFT',
    ...overrides,
  });
}

// ─── AC-3: server-side filters ────────────────────────────────

describe('DocumentRepository.findByProjectId — filters', () => {
  let documentRepository;

  beforeAll(async () => {
    const mod = await import('../../src/modules/pm/document.repository.js');
    documentRepository = mod.default;
  });

  test('returns documents matching date range', async () => {
    const project = await seedProject();
    const user = await seedUser();

    // Doc created "in the past"
    const past = new Date('2026-04-01T00:00:00.000Z');
    const inRange = new Date('2026-05-15T12:00:00.000Z');
    const future = new Date('2026-06-20T00:00:00.000Z');

    await ProjectDocument.create([
      { projectId: project._id, fileName: 'past.pdf', category: 'OTHER', uploadedBy: user._id, createdAt: past },
      { projectId: project._id, fileName: 'in-range.pdf', category: 'PLANS', uploadedBy: user._id, createdAt: inRange },
      { projectId: project._id, fileName: 'future.pdf', category: 'OTHER', uploadedBy: user._id, createdAt: future },
    ]);

    const results = await documentRepository.findByProjectId(project._id, {
      startDate: '2026-05-01T00:00:00.000Z',
      endDate: '2026-05-31T23:59:59.999Z',
    });
    expect(results).toHaveLength(1);
    expect(results[0].fileName).toBe('in-range.pdf');
  });

  test('returns documents matching search term (fileName regex)', async () => {
    const project = await seedProject();
    const user = await seedUser();
    await ProjectDocument.create([
      { projectId: project._id, fileName: 'annual-report-2026.pdf', category: 'REPORTS', uploadedBy: user._id },
      { projectId: project._id, fileName: 'site-plan.pdf', category: 'PLANS', uploadedBy: user._id },
    ]);

    const results = await documentRepository.findByProjectId(project._id, { search: 'annual' });
    expect(results).toHaveLength(1);
    expect(results[0].fileName).toBe('annual-report-2026.pdf');
  });

  test('returns documents matching category', async () => {
    const project = await seedProject();
    const user = await seedUser();
    await ProjectDocument.create([
      { projectId: project._id, fileName: 'a.pdf', category: 'PLANS', uploadedBy: user._id },
      { projectId: project._id, fileName: 'b.pdf', category: 'CONTRACTS', uploadedBy: user._id },
    ]);

    const results = await documentRepository.findByProjectId(project._id, { category: 'PLANS' });
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe('PLANS');
  });

  test('returns all documents when no filters given', async () => {
    const project = await seedProject();
    const user = await seedUser();
    await ProjectDocument.create([
      { projectId: project._id, fileName: 'a.pdf', category: 'OTHER', uploadedBy: user._id },
      { projectId: project._id, fileName: 'b.pdf', category: 'OTHER', uploadedBy: user._id },
    ]);

    const results = await documentRepository.findByProjectId(project._id, {});
    expect(results).toHaveLength(2);
  });
});

// ─── AC-6: listDeleted repository method ─────────────────────

describe('DocumentRepository.findDeletedByProjectId', () => {
  let documentRepository;

  beforeAll(async () => {
    const mod = await import('../../src/modules/pm/document.repository.js');
    documentRepository = mod.default;
  });

  test('returns only soft-deleted docs for this project, sorted by deletedAt desc', async () => {
    const project = await seedProject();
    const user = await seedUser();

    const deletedAt1 = new Date('2026-05-20T10:00:00.000Z');
    const deletedAt2 = new Date('2026-05-25T10:00:00.000Z');

    // Active document — must NOT appear
    await ProjectDocument.create({
      projectId: project._id, fileName: 'active.pdf', category: 'OTHER', uploadedBy: user._id,
    });
    // Deleted within 30 days — must appear
    const d1 = await ProjectDocument.create({
      projectId: project._id, fileName: 'deleted-older.pdf', category: 'OTHER',
      uploadedBy: user._id, isDeleted: true, deletedAt: deletedAt1,
    });
    const d2 = await ProjectDocument.create({
      projectId: project._id, fileName: 'deleted-newer.pdf', category: 'OTHER',
      uploadedBy: user._id, isDeleted: true, deletedAt: deletedAt2,
    });
    // Deleted > 30 days ago — must NOT appear (purge window)
    await ProjectDocument.create({
      projectId: project._id, fileName: 'expired.pdf', category: 'OTHER',
      uploadedBy: user._id, isDeleted: true,
      deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    });

    const results = await documentRepository.findDeletedByProjectId(project._id);
    expect(results).toHaveLength(2);
    expect(results[0]._id.toString()).toBe(d2._id.toString()); // newest first
    expect(results[1]._id.toString()).toBe(d1._id.toString());
  });

  test('returns empty array when no deleted documents exist', async () => {
    const project = await seedProject();
    const results = await documentRepository.findDeletedByProjectId(project._id);
    expect(results).toHaveLength(0);
  });
});

// ─── AC-6: DocumentService.listDeleted ───────────────────────

describe('DocumentService.listDeleted', () => {
  let documentService;

  beforeAll(async () => {
    // Stub cache manager so unit tests don't need Redis
    const cacheModule = await import('../../src/shared/cache/CacheManager.js');
    const cache = cacheModule.default;
    jest.spyOn(cache, 'getOrSet').mockImplementation((_key, fn) => fn());
    jest.spyOn(cache, 'invalidatePattern').mockResolvedValue(undefined);

    const mod = await import('../../src/modules/pm/document.service.js');
    documentService = mod.default;
  });

  test('listDeleted returns enriched deleted docs', async () => {
    const project = await seedProject();
    const user = await seedUser();
    await ProjectDocument.create({
      projectId: project._id, fileName: 'trash.pdf', category: 'OTHER',
      uploadedBy: user._id, isDeleted: true, deletedAt: new Date(),
    });

    const results = await documentService.listDeleted(project._id);
    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(1);
    expect(results[0].fileName).toBe('trash.pdf');
  });
});

// ─── AC-5: mobile bridge ─────────────────────────────────────

describe('DocumentController (mobile) — _linkToProjectRepository', () => {
  let documentController;

  beforeAll(async () => {
    const mod = await import('../../src/modules/mobile/document.controller.js');
    documentController = mod.default;
  });

  test('creates a ProjectDocument when order has a projectId', async () => {
    const project = await seedProject();
    const user = await seedUser();

    // Minimal Order stub registered in mongoose
    let Order;
    try {
      Order = mongoose.model('Order');
    } catch {
      const orderSchema = new mongoose.Schema({ projectId: mongoose.Schema.Types.ObjectId });
      Order = mongoose.model('Order', orderSchema);
    }
    const order = await Order.create({ projectId: project._id });

    // Stub documentService.createFromStoredFile to avoid file service
    const dsModule = await import('../../src/modules/pm/document.service.js');
    const ds = dsModule.default;
    const createSpy = jest.spyOn(ds, 'createFromStoredFile').mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

    const fakeFileId = new mongoose.Types.ObjectId();
    await documentController._linkToProjectRepository(
      order._id.toString(), fakeFileId, 'site-photo.jpg', user._id,
    );

    expect(createSpy).toHaveBeenCalledWith(
      project._id,
      expect.objectContaining({
        fileId: fakeFileId,
        fileName: 'site-photo.jpg',
        category: 'OTHER',
        uploadedBy: user._id,
      }),
      expect.any(Object),
    );
    createSpy.mockRestore();
  });

  test('does nothing when order has no projectId', async () => {
    const user = await seedUser();

    let Order;
    try { Order = mongoose.model('Order'); } catch {
      const orderSchema = new mongoose.Schema({ projectId: mongoose.Schema.Types.ObjectId });
      Order = mongoose.model('Order', orderSchema);
    }
    const order = await Order.create({});

    const dsModule = await import('../../src/modules/pm/document.service.js');
    const ds = dsModule.default;
    const createSpy = jest.spyOn(ds, 'createFromStoredFile').mockResolvedValue(null);

    await documentController._linkToProjectRepository(
      order._id.toString(), new mongoose.Types.ObjectId(), 'photo.jpg', user._id,
    );

    expect(createSpy).not.toHaveBeenCalled();
    createSpy.mockRestore();
  });

  test('swallows errors so the mobile upload is never blocked', async () => {
    const dsModule = await import('../../src/modules/pm/document.service.js');
    const ds = dsModule.default;
    jest.spyOn(ds, 'createFromStoredFile').mockRejectedValue(new Error('DB offline'));

    // Use a non-existent orderId — the import of Order will fail internally
    // but the method must not throw
    await expect(
      documentController._linkToProjectRepository(
        new mongoose.Types.ObjectId().toString(),
        new mongoose.Types.ObjectId(),
        'file.pdf',
        new mongoose.Types.ObjectId(),
      ),
    ).resolves.toBeUndefined();
  });
});
```

Run the test — expect **FAIL** (findDeletedByProjectId is not a function, listDeleted is not a function):

```
cd server && npm test -- tests/unit/pm.documents.test.js
```

---

### 1-B. Implement `findDeletedByProjectId` in the repository

File: `server/src/modules/pm/document.repository.js`

Add after the existing `restore` method (line 64, before the closing brace of the class):

```js
  async findDeletedByProjectId(projectId) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return ProjectDocument.find({
      projectId,
      isDeleted: true,
      deletedAt: { $gte: thirtyDaysAgo },
    })
      .setOptions({ includeDeleted: true })
      .populate(POPULATE_FIELDS)
      .sort({ deletedAt: -1 })
      .lean();
  }
```

---

### 1-C. Implement `listDeleted` in the service

File: `server/src/modules/pm/document.service.js`

Add after the `listByProject` method (after line ~160, before `getById`):

```js
  async listDeleted(projectId) {
    return this._enrichDocuments(
      await documentRepository.findDeletedByProjectId(projectId),
    );
  }
```

---

### 1-D. Add the controller action

File: `server/src/modules/pm/document.controller.js`

Add after the existing `list` method (after line 15, before `upload`):

```js
  async listDeleted(req, res, next) {
    try {
      const docs = await documentService.listDeleted(req.params.id);
      return res.success({ data: docs });
    } catch (err) { next(err); }
  }
```

---

### 1-E. Add the validation schema

File: `server/src/modules/pm/document.validation.js`

Add at the end (after `restoreDocumentSchema`):

```js
export const listDeletedDocumentsSchema = {
  params: Joi.object({ id: objectId.required() }),
};
```

---

### 1-F. Register the route

File: `server/src/modules/pm/pm.routes.js`

Add the import for the new schema (update the existing destructure at line 22):

```js
import {
  listDocumentsSchema, uploadDocumentSchema, generateDocumentSchema,
  documentIdParamSchema, updateDocumentSchema, restoreDocumentSchema,
  listDeletedDocumentsSchema,
} from './document.validation.js';
```

Add the route in the `documentRouter` block, after the `GET /` route and before `POST /` (after line ~197 in pm.routes.js):

```js
documentRouter.get(
  '/trash',
  authenticate,
  requirePermission('projects:read'),
  validate(listDeletedDocumentsSchema),
  (req, res, next) => documentController.listDeleted(req, res, next),
);
```

---

### 1-G. Run tests — expect PASS

```
cd server && npm test -- tests/unit/pm.documents.test.js
```

All suites in the file must be green. Confirm output shows no failures.

---

### 1-H. Commit

```
git add server/tests/unit/pm.documents.test.js \
        server/src/modules/pm/document.repository.js \
        server/src/modules/pm/document.service.js \
        server/src/modules/pm/document.controller.js \
        server/src/modules/pm/document.validation.js \
        server/src/modules/pm/pm.routes.js
git commit -m "feat(pm/docs): add listDeleted endpoint + mobile bridge tests (C5 AC-5, AC-6 server)"
```

---

## Task 2 — Server: forward `search` param to server on every call (AC-3)

The server already supports the `search` query param (`document.validation.js` line 10, `document.repository.js` `findByProjectId` line 22). The client is currently filtering client-side. The fix is to move the `search` string into the `params` object that is sent to the server and remove the redundant `filteredDocs` memo.

No new server code is needed for AC-3 — the route is fully wired. Confirm with the existing test suite:

```
cd server && npm test -- tests/unit/pm.documents.test.js
```

The "returns documents matching search term" test already asserts the repository behaviour.

---

## Task 3 — Client: add `search` and `trash` keys; wire endpoints (AC-3 + AC-6 client foundation)

### 3-A. Add query keys

File: `client/src/lib/query/keys.js`

Replace the existing `documents` block inside `pm` (lines 91–93):

```js
    documents: {
      byProject: (projectId, category, filters) => ['pm', 'documents', projectId, category, filters ?? null],
      trash: (projectId) => ['pm', 'documents', 'trash', projectId],
    },
```

---

### 3-B. Add the endpoint constant

File: `client/src/lib/api/endpoints.js`

Locate the existing PM document endpoints block (lines 136–139) and add one line after `DOCUMENTS_GENERATE`:

```js
    DOCUMENTS_TRASH: (id) => `/pm/projects/${id}/documents/trash`,
    DOCUMENT_RESTORE: (id, docId) => `/pm/projects/${id}/documents/${docId}/restore`,
```

---

### 3-C. Add `getDeletedDocuments` and `restoreDocument` to the client service

File: `client/src/modules/pm/services/document-service.js`

Add after the `generateDocument` method (before the closing `}`):

```js
  async getDeletedDocuments(projectId) {
    const res = await apiClient.get(ENDPOINTS.PM.DOCUMENTS_TRASH(projectId));
    return res.data;
  },

  async restoreDocument(projectId, docId) {
    const res = await apiClient.post(ENDPOINTS.PM.DOCUMENT_RESTORE(projectId, docId));
    return res.data;
  },
```

---

### 3-D. Add `restore` mutation to the mutations hook

File: `client/src/modules/pm/hooks/use-document-mutations.js`

Add after the `generate` mutation (before `return`):

```js
  const restore = useMutation({
    mutationFn: (docId) => documentService.restoreDocument(projectId, docId),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: queryKeys.pm.documents.trash(projectId) });
      showSuccess(t('pm.documentRestored', 'Document restored'));
    },
    onError: (err) => showError(err.message),
  });
```

Update the return statement to include `restore`:

```js
  return { upload, updateMetadata, remove, generate, restore };
```

---

## Task 4 — Client: server-backed search (AC-3)

### 4-A. Write the failing Vitest test

Create file: `client/src/modules/pm/components/__tests__/documents-tab.test.jsx`

> Note: Before writing this file, consult `client/node_modules/next/dist/docs/01-app/` for any App Router `'use client'` testing conventions.

```jsx
// client/src/modules/pm/components/__tests__/documents-tab.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentsTab } from '../documents-tab';

// ── Shared mocks ─────────────────────────────────────────────

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ t: (_k, d) => d, language: 'en' }),
}));

vi.mock('@/shared/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

vi.mock('@/lib/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

const mockDocumentService = {
  getDocuments: vi.fn(),
  getDownloadUrl: vi.fn(),
  uploadDocument: vi.fn(),
  updateDocumentMetadata: vi.fn(),
  deleteDocument: vi.fn(),
  generateDocument: vi.fn(),
  getDeletedDocuments: vi.fn(),
  restoreDocument: vi.fn(),
};

vi.mock('@/modules/pm/services/document-service', () => ({
  documentService: mockDocumentService,
}));

function wrapper(ui) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const PROJECT_ID = '64a000000000000000000001';

const DOC_PLANS = {
  _id: '64a000000000000000000010',
  fileName: 'annual-plan.pdf',
  originalName: 'annual-plan.pdf',
  category: 'PLANS',
  mimeType: 'application/pdf',
  fileSize: 102400,
  createdAt: '2026-05-15T10:00:00.000Z',
  uploadedBy: { firstName: 'Anna', lastName: 'Muster' },
  isGenerated: false,
};

const DOC_CONTRACT = {
  _id: '64a000000000000000000011',
  fileName: 'main-contract.pdf',
  originalName: 'main-contract.pdf',
  category: 'CONTRACTS',
  mimeType: 'application/pdf',
  fileSize: 204800,
  createdAt: '2026-04-10T08:00:00.000Z',
  uploadedBy: { firstName: 'Beat', lastName: 'Keller' },
  isGenerated: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockDocumentService.getDocuments.mockResolvedValue({ documents: [DOC_PLANS, DOC_CONTRACT] });
  mockDocumentService.getDeletedDocuments.mockResolvedValue({ documents: [] });
});

// ── AC-3: search param forwarded to server ────────────────────

describe('DocumentsTab — server-backed search (AC-3)', () => {
  it('passes search param to documentService.getDocuments after debounce', async () => {
    const user = userEvent.setup({ delay: null });
    wrapper(<DocumentsTab projectId={PROJECT_ID} />);

    // Wait for initial load
    await waitFor(() => expect(mockDocumentService.getDocuments).toHaveBeenCalledTimes(1));

    const searchInput = screen.getByPlaceholderText('Search documents...');
    await user.clear(searchInput);
    await user.type(searchInput, 'annual');

    // After debounce the service must be called with search param
    await waitFor(() => {
      const calls = mockDocumentService.getDocuments.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1]).toMatchObject({ search: 'annual' });
    }, { timeout: 1500 });
  });

  it('passes date range params to documentService.getDocuments', async () => {
    wrapper(<DocumentsTab projectId={PROJECT_ID} />);
    await waitFor(() => expect(mockDocumentService.getDocuments).toHaveBeenCalledTimes(1));

    const fromInput = screen.getByLabelText('From date');
    const toInput = screen.getByLabelText('To date');

    fireEvent.change(fromInput, { target: { value: '2026-05-01' } });
    fireEvent.change(toInput, { target: { value: '2026-05-31' } });

    await waitFor(() => {
      const calls = mockDocumentService.getDocuments.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[1]).toMatchObject({
        startDate: expect.stringContaining('2026-05-01'),
        endDate: expect.stringContaining('2026-05-31'),
      });
    });
  });

  it('clears search and refetches all documents', async () => {
    const user = userEvent.setup({ delay: null });
    wrapper(<DocumentsTab projectId={PROJECT_ID} />);
    await waitFor(() => expect(mockDocumentService.getDocuments).toHaveBeenCalledTimes(1));

    const searchInput = screen.getByPlaceholderText('Search documents...');
    await user.type(searchInput, 'annual');

    await waitFor(() => {
      const calls = mockDocumentService.getDocuments.mock.calls;
      expect(calls.some((c) => c[1]?.search === 'annual')).toBe(true);
    }, { timeout: 1500 });

    const clearBtn = screen.getByTitle('Search documents...');
    // The X button within the search bar
    const xButtons = screen.getAllByRole('button');
    const clearSearch = xButtons.find((b) => b.querySelector('svg'));
    if (clearSearch) fireEvent.click(clearSearch);

    await waitFor(() => {
      const calls = mockDocumentService.getDocuments.mock.calls;
      const last = calls[calls.length - 1];
      expect(last[1]?.search).toBeFalsy();
    }, { timeout: 1500 });
  });
});

// ── AC-6: trash drawer renders and restores ───────────────────

describe('DocumentsTab — trash / restore UI (AC-6)', () => {
  const DELETED_DOC = {
    _id: '64a000000000000000000020',
    fileName: 'old-invoice.pdf',
    originalName: 'old-invoice.pdf',
    category: 'CONTRACTS',
    mimeType: 'application/pdf',
    fileSize: 51200,
    deletedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    uploadedBy: { firstName: 'Chris', lastName: 'Denz' },
    isGenerated: false,
  };

  beforeEach(() => {
    mockDocumentService.getDeletedDocuments.mockResolvedValue({ documents: [DELETED_DOC] });
    mockDocumentService.restoreDocument.mockResolvedValue({ data: { ...DELETED_DOC, isDeleted: false } });
  });

  it('renders a Trash button in the toolbar', async () => {
    wrapper(<DocumentsTab projectId={PROJECT_ID} />);
    await waitFor(() => expect(mockDocumentService.getDocuments).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /trash/i })).toBeInTheDocument();
  });

  it('opens the trash drawer and lists deleted documents', async () => {
    wrapper(<DocumentsTab projectId={PROJECT_ID} />);
    await waitFor(() => expect(mockDocumentService.getDocuments).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /trash/i }));

    await waitFor(() => {
      expect(mockDocumentService.getDeletedDocuments).toHaveBeenCalledWith(PROJECT_ID);
    });
    await waitFor(() => {
      expect(screen.getByText('old-invoice.pdf')).toBeInTheDocument();
    });
  });

  it('calls restoreDocument when Restore is clicked, then closes drawer', async () => {
    wrapper(<DocumentsTab projectId={PROJECT_ID} />);
    await waitFor(() => expect(mockDocumentService.getDocuments).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /trash/i }));
    await waitFor(() => screen.getByText('old-invoice.pdf'));

    const restoreBtn = screen.getByRole('button', { name: /restore/i });
    fireEvent.click(restoreBtn);

    await waitFor(() => {
      expect(mockDocumentService.restoreDocument).toHaveBeenCalledWith(
        PROJECT_ID, DELETED_DOC._id,
      );
    });
  });
});
```

Run the test — expect **FAIL** (search not forwarded to server, no Trash button, no trash drawer):

```
cd client && npx vitest run src/modules/pm/components/__tests__/documents-tab.test.jsx
```

---

### 4-B. Implement: move search into server params + debounce

File: `client/src/modules/pm/components/documents-tab.jsx`

**Step 1** — Add `useEffect` and `useRef` imports (already imported via `useState, useMemo, useCallback, useRef`). Add `useEffect` to the import list:

```js
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
```

**Step 2** — Add debounced search state below the existing state declarations (after line ~329):

```js
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchDebounceRef = useRef(null);
```

**Step 3** — Add a `useEffect` to debounce the `searchTerm` → `debouncedSearch` (after the `debouncedSearch` state lines):

```js
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 400);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchTerm]);
```

**Step 4** — Update the `params` memo to include `debouncedSearch` instead of the old client-side filter. Replace the existing `params` useMemo (lines 333–344):

```js
  const params = useMemo(() => {
    const p = {};
    if (categoryFilter !== 'ALL') p.category = categoryFilter;
    if (debouncedSearch.trim()) p.search = debouncedSearch.trim();
    if (dateFrom) p.startDate = new Date(dateFrom).toISOString();
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      p.endDate = end.toISOString();
    }
    return p;
  }, [categoryFilter, debouncedSearch, dateFrom, dateTo]);
```

**Step 5** — Update the query key to include `debouncedSearch` so React Query refetches on change. Replace the existing `queryKey` (line ~347):

```js
    queryKey: queryKeys.pm.documents.byProject(projectId, categoryFilter, { search: debouncedSearch, dateFrom, dateTo }),
```

**Step 6** — Remove the `filteredDocs` memo (it was applying client-side filtering; the server now handles it). Replace the existing `filteredDocs` useMemo (lines 357–364) with a direct alias:

```js
  const filteredDocs = useMemo(() => {
    const raw = docData?.documents || docData || [];
    return Array.isArray(raw) ? raw : [];
  }, [docData]);
```

(The `documents` memo that was computing `raw` can be merged into `filteredDocs` directly — the old client-side `searchTerm` filter is removed because the server now handles it. The `searchTerm` state still drives the input UI for the controlled value; only the debounced value goes to the server.)

---

## Task 5 — Client: TrashDrawer component + wire into DocumentsTab (AC-6)

### 5-A. Create TrashDrawer component

> Before writing: verify `Sheet` (drawer) is available in shadcn-ui primitives. Check `client/src/components/ui/` for a `sheet.jsx` file.

File: `client/src/modules/pm/components/trash-drawer.jsx`

```jsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { documentService } from '@/modules/pm/services/document-service';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/shared/components/empty-state';
import { getFileIcon, formatFileSize } from '@/shared/components/document-viewer';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/formatters';
import { Trash2, RotateCcw, Loader2, FileText } from 'lucide-react';
import { DOCUMENT_CATEGORY_CONFIG } from '@/modules/pm/constants/pm-constants';

export function TrashDrawer({ open, onOpenChange, projectId, language, onRestore, isRestoring }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.pm.documents.trash(projectId),
    queryFn: () => documentService.getDeletedDocuments(projectId),
    enabled: open && !!projectId,
  });

  const deletedDocs = (() => {
    const raw = data?.documents || data || [];
    return Array.isArray(raw) ? raw : [];
  })();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[480px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-5 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2.5 text-base">
            <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Trash2 className="h-4 w-4 text-destructive" />
            </div>
            {language === 'de' ? 'Papierkorb' : 'Trash'}
            {!isLoading && deletedDocs.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[11px]">
                {deletedDocs.length}
              </Badge>
            )}
          </SheetTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {language === 'de'
              ? 'Gelöschte Dokumente können innerhalb von 30 Tagen wiederhergestellt werden.'
              : 'Deleted documents can be restored within 30 days.'}
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-xl" />
              ))}
            </div>
          ) : deletedDocs.length === 0 ? (
            <EmptyState
              title={language === 'de' ? 'Papierkorb leer' : 'Trash is empty'}
              description={
                language === 'de'
                  ? 'Keine gelöschten Dokumente vorhanden.'
                  : 'No deleted documents found.'
              }
            />
          ) : (
            <div className="space-y-2">
              {deletedDocs.map((doc) => {
                const FileIcon = getFileIcon(doc.mimeType);
                const categoryCfg = DOCUMENT_CATEGORY_CONFIG[doc.category] || DOCUMENT_CATEGORY_CONFIG.OTHER;
                return (
                  <div
                    key={doc._id}
                    className={cn(
                      'flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3.5',
                      'hover:border-border transition-colors duration-150',
                    )}
                  >
                    <div className="h-10 w-10 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                      <FileIcon className="h-4.5 w-4.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate leading-tight">
                        {doc.originalName || doc.fileName}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground flex-wrap">
                        <span className="inline-flex items-center gap-1 bg-muted/60 rounded-md px-1.5 py-0.5">
                          {language === 'de' ? categoryCfg.label : categoryCfg.labelEn}
                        </span>
                        {doc.fileSize && (
                          <span className="tabular-nums">{formatFileSize(doc.fileSize)}</span>
                        )}
                        {doc.deletedAt && (
                          <span className="text-destructive/70">
                            {language === 'de' ? 'Gelöscht' : 'Deleted'} {formatDate(doc.deletedAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-3 text-xs gap-1.5 shrink-0 text-primary hover:bg-primary/10"
                      onClick={() => onRestore(doc._id)}
                      disabled={isRestoring}
                    >
                      {isRestoring ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      {language === 'de' ? 'Wiederherstellen' : 'Restore'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

---

### 5-B. Wire TrashDrawer and Trash button into DocumentsTab

File: `client/src/modules/pm/components/documents-tab.jsx`

**Step 1** — Add the import at the top (after the `ConfirmDialog` import line):

```js
import { TrashDrawer } from '@/modules/pm/components/trash-drawer';
```

**Step 2** — Add `Trash2` to the lucide imports if not already present (it is not in the current import list). Add it:

```js
import {
  Pencil, Trash2, Loader2, Download, Upload,
  FileText, Search, X, FolderOpen, Eye,
  CloudUpload, FileUp, Grid3X3, List, LayoutGrid,
} from 'lucide-react';
```

(`Trash2` is already in the import — no change needed.)

**Step 3** — Add state for the trash drawer (after `previewUrl` state declaration):

```js
  const [trashOpen, setTrashOpen] = useState(false);
```

**Step 4** — Destructure `restore` from the mutations hook (the hook was updated in Task 3-D):

```js
  const { upload, updateMetadata, remove, generate, restore } = useDocumentMutations(projectId, {
    onDelete: () => setDeleteTarget(null),
  });
```

**Step 5** — Add the Trash button to the filter bar. In the filter bar section, after the view-mode toggle buttons group (after the `</div>` closing the list/grid toggle), add the Trash button before the document count span:

```jsx
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2.5 gap-1.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={() => setTrashOpen(true)}
          title={language === 'de' ? 'Papierkorb' : 'Trash'}
          aria-label={language === 'de' ? 'Papierkorb öffnen' : 'Open trash'}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {language === 'de' ? 'Papierkorb' : 'Trash'}
        </Button>
```

**Step 6** — Add the TrashDrawer component at the end of the returned JSX, before the closing `</div>` of the entire component (before the final `</div>`):

```jsx
      {/* ── Trash drawer ──────────────────────────────────── */}
      <TrashDrawer
        open={trashOpen}
        onOpenChange={setTrashOpen}
        projectId={projectId}
        language={language}
        onRestore={(docId) => restore.mutate(docId)}
        isRestoring={restore.isPending}
      />
```

---

### 5-C. Run the client tests — expect PASS

```
cd client && npx vitest run src/modules/pm/components/__tests__/documents-tab.test.jsx
```

All four describe blocks must be green.

---

### 5-D. Commit

```
git add client/src/lib/query/keys.js \
        client/src/lib/api/endpoints.js \
        client/src/modules/pm/services/document-service.js \
        client/src/modules/pm/hooks/use-document-mutations.js \
        client/src/modules/pm/components/documents-tab.jsx \
        client/src/modules/pm/components/trash-drawer.jsx
git commit -m "feat(pm/docs): server-backed search + trash/restore UI (C5 AC-3, AC-6 client)"
```

---

## Task 6 — Verify AC-5 mobile bridge end-to-end

The mobile `document.controller.js` already calls `this._linkToProjectRepository(...)` inside `uploadDocument`. The failing tests written in Task 1-A cover happy-path, no-project-id, and swallowed-error cases. No additional server code is needed.

Run the full pm.documents test suite one final time to confirm all AC-5 tests pass:

```
cd server && npm test -- tests/unit/pm.documents.test.js
```

Expected output:
- `DocumentRepository.findByProjectId — filters` — 4 tests PASS
- `DocumentRepository.findDeletedByProjectId` — 2 tests PASS
- `DocumentService.listDeleted` — 1 test PASS
- `DocumentController (mobile) — _linkToProjectRepository` — 3 tests PASS

---

## Task 7 — Full regression run + final commit

```
cd server && npm test
cd client && npx vitest run
```

Fix any regressions introduced by the search-param change (e.g., any other test that mocks `getDocuments` and asserts on the absence of a `search` key — update those mocks to handle optional params).

Final commit if no new changes are needed:

```
git add -p   # stage only if there are regression fixes
git commit -m "chore(pm/docs): fix regressions after C5 search-param change"
```

---

## Acceptance-criteria closure map

| AC | Mechanism | Status after this plan |
|----|-----------|----------------------|
| PROJ-006 AC-3 date-range UI | `dateFrom`/`dateTo` already in UI; `startDate`/`endDate` forwarded in `params` memo; server `findByProjectId` applies `$gte/$lte`; query key includes date values so React Query refetches. | CLOSED |
| PROJ-006 AC-3 search UI | `searchTerm` debounced to `debouncedSearch`; forwarded as `search` in `params`; server repo applies `$regex`. | CLOSED |
| PROJ-006 AC-5 mobile bridge | `_linkToProjectRepository` already implemented; Task 1 adds comprehensive passing tests for happy-path, no-project, and error-swallow. | CLOSED |
| PROJ-006 AC-6 restore UI | `TrashDrawer` component + Trash button in toolbar; `GET /documents/trash` route; `restore` mutation calls `POST /:docId/restore`. | CLOSED |

---

## File inventory (all paths relative to repo root)

### New files
- `server/tests/unit/pm.documents.test.js`
- `client/src/modules/pm/components/__tests__/documents-tab.test.jsx`
- `client/src/modules/pm/components/trash-drawer.jsx`

### Modified files
- `server/src/modules/pm/document.repository.js` — add `findDeletedByProjectId`
- `server/src/modules/pm/document.service.js` — add `listDeleted`
- `server/src/modules/pm/document.controller.js` — add `listDeleted` action
- `server/src/modules/pm/document.validation.js` — add `listDeletedDocumentsSchema`
- `server/src/modules/pm/pm.routes.js` — register `GET /trash` route + import new schema
- `client/src/lib/query/keys.js` — add `trash` key under `pm.documents`
- `client/src/lib/api/endpoints.js` — add `DOCUMENTS_TRASH`, `DOCUMENT_RESTORE`
- `client/src/modules/pm/services/document-service.js` — add `getDeletedDocuments`, `restoreDocument`
- `client/src/modules/pm/hooks/use-document-mutations.js` — add `restore` mutation
- `client/src/modules/pm/components/documents-tab.jsx` — server-backed search, trash button, TrashDrawer wiring
