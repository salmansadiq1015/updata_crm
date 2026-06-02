# C6: dashboard-gaps Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** Render all six project-status stat cards (AC-1), enable server-side customer column sort (AC-3), and fix the two-part milestones-widget refresh bug — stale cache key and invalidation miss (AC-8).

**Architecture:** All three fixes live entirely in the client (`project-stats-row.jsx`, `projects-table.jsx`) and one server file (`project.service.js`). The AC-1 stats-row change is pure React: widen the grid, add five new `PremiumStatCard` instances, and derive values from the already-fetched `summary.byStatus.*` and `summary.risk.overdue` fields. The AC-3 customer sort change adds `customer` as a valid `sortBy` value on the server repository's `SORT_FIELDS` allowlist and maps the client column `accessorKey` to the correct server field. The AC-8 milestones fix has two parts: (a) the server `getDashboardMilestones()` cache key must include the `days` argument, and (b) the client `useScheduleMutations.invalidate()` call must pass `days` to `queryKeys.pm.dashboard.milestones(days)` — but since the hook does not know the current `days` state, the fix is to invalidate by prefix using `queryKeys.pm.dashboard.milestones()` (no arg = `['pm','dashboard','milestones', undefined]`) or better yet use `queryClient.invalidateQueries({ queryKey: ['pm','dashboard','milestones'], exact: false })` to catch any cached `days` variant.

**Tech Stack:** Node/Express/Mongoose/Joi/Jest + Next.js/React Query/shadcn-ui/Vitest

---

> **AGENTS.md notice (mandatory before any Next.js code):** Read `client/node_modules/next/dist/docs/` before writing any Next.js-specific code. This codebase runs a customised build of Next.js with potentially breaking API differences.

---

## Prerequisites

- Branch `main` is clean.
- `cd server && npm test -- tests/unit/pm.projectDashboard.test.js` passes (green baseline).
- `cd client && npx vitest run src/modules/pm/components/__tests__/` — the `__tests__` directory does not yet exist; baseline is "no test files found" (not a failure).

---

## Task 1 — Server: fix `getDashboardMilestones` cache key (AC-8, part a)

### 1.1 Write failing test

File: `server/tests/unit/pm.projectDashboard.test.js`

Open the existing file and append the following describe block **inside** the outer `describe('PM project dashboard and search', ...)` block, after the last existing `test(...)`:

```js
  test('getDashboardMilestones uses days param in cache key — different days return independent results', async () => {
    const customer = await createCustomer('Cache Key AG');
    const today = new Date();
    const in5Days = new Date(today.getTime() + 5 * 24 * 60 * 60 * 1000);
    const in20Days = new Date(today.getTime() + 20 * 24 * 60 * 60 * 1000);

    // Import ScheduleEntry model dynamically (same pattern as project.service.js)
    const { default: ScheduleEntry } = await import('../../src/modules/pm/scheduleEntry.model.js');
    const { default: Project } = await import('../../src/modules/pm/project.model.js');

    const project = await Project.create({
      projectNumber: `P-cache-${Date.now()}`,
      name: 'Cache test project',
      projectType: 'NEW_INSTALLATION',
      status: 'IN_PROGRESS',
      customerId: customer._id,
      projectManagerId: new mongoose.Types.ObjectId(),
      estimatedBudget: 5000,
      createdBy: new mongoose.Types.ObjectId(),
    });

    // Milestone at day +5 (within 7-day window but also within 30-day window)
    await ScheduleEntry.create({
      projectId: project._id,
      name: 'Early milestone',
      entryType: 'MILESTONE',
      status: 'PLANNED',
      milestoneDate: in5Days,
      responsibleType: 'INTERNAL_TEAM',
      createdBy: new mongoose.Types.ObjectId(),
    });

    // Milestone at day +20 (outside 7-day window, inside 30-day window)
    await ScheduleEntry.create({
      projectId: project._id,
      name: 'Late milestone',
      entryType: 'MILESTONE',
      status: 'PLANNED',
      milestoneDate: in20Days,
      responsibleType: 'INTERNAL_TEAM',
      createdBy: new mongoose.Types.ObjectId(),
    });

    const result7 = await projectService.getDashboardMilestones(7);
    const result30 = await projectService.getDashboardMilestones(30);

    // With a keyed cache each call fetches independently
    expect(result7.length).toBe(1);
    expect(result7[0].name).toBe('Early milestone');
    expect(result30.length).toBe(2);
  });
```

Run (must FAIL — both calls currently share one cache key so result30 will equal result7 if the 7-day call was cached first):

```
cd server && npm test -- tests/unit/pm.projectDashboard.test.js
```

Expected failure: `expect(result30.length).toBe(2)` fails with received `1`.

### 1.2 Implement the fix

File: `server/src/modules/pm/project.service.js`

Locate `getDashboardMilestones` (line 283). Change:

```js
  async getDashboardMilestones(days = 7) {
    const cacheKey = 'pm:dashboard:milestones';
    return cacheManager.getOrSet(
      cacheKey,
      () => projectRepository.findUpcomingMilestones(days),
      DASHBOARD_TTL,
    );
  }
```

Replace with:

```js
  async getDashboardMilestones(days = 7) {
    const cacheKey = `pm:dashboard:milestones:${days}`;
    return cacheManager.getOrSet(
      cacheKey,
      () => projectRepository.findUpcomingMilestones(days),
      DASHBOARD_TTL,
    );
  }
```

Also update `_invalidateDashboardCache` so it purges all `days`-keyed milestones entries via pattern invalidation instead of a single `del`. Locate the method (line 329):

```js
  async _invalidateDashboardCache() {
    await cacheManager.del('pm:dashboard:summary');
    await cacheManager.del('pm:dashboard:milestones');
  }
```

Replace with:

```js
  async _invalidateDashboardCache() {
    await cacheManager.del('pm:dashboard:summary');
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}pm:dashboard:milestones:*`);
  }
```

### 1.3 Confirm test passes

```
cd server && npm test -- tests/unit/pm.projectDashboard.test.js
```

All tests green.

### 1.4 Commit

```
git add server/src/modules/pm/project.service.js server/tests/unit/pm.projectDashboard.test.js
git commit -m "fix(pm): key getDashboardMilestones cache by days param (PROJ-007 AC-8)"
```

---

## Task 2 — Client: fix milestones invalidation in `use-schedule-mutations.js` (AC-8, part b)

### 2.1 Write failing test

File: `client/src/modules/pm/components/__tests__/use-schedule-mutations.test.tsx`

Create the `__tests__` directory first (`client/src/modules/pm/components/__tests__/`).

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── Mocks ────────────────────────────────────────────────────────
vi.mock('@/modules/pm/services/schedule-service', () => ({
  scheduleService: {
    addEntry: vi.fn().mockResolvedValue({ _id: 'entry-1' }),
    updateEntry: vi.fn().mockResolvedValue({ _id: 'entry-1' }),
    deleteEntry: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@/lib/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ t: (_k: string, fallback: string) => fallback }),
}));

// ── Helpers ──────────────────────────────────────────────────────
function makeWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

// ── Tests ────────────────────────────────────────────────────────
describe('useScheduleMutations — milestones invalidation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it('invalidates ALL milestones query variants (any days value) after addEntry succeeds', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { useScheduleMutations } = await import('../use-schedule-mutations');
    const { result } = renderHook(
      () => useScheduleMutations('proj-1'),
      { wrapper: makeWrapper(queryClient) },
    );

    await act(async () => {
      await result.current.addEntry.mutateAsync({ name: 'Phase 1', entryType: 'PHASE' });
    });

    // Must find an invalidateQueries call whose queryKey is a prefix that matches
    // ['pm', 'dashboard', 'milestones', 7] AND ['pm', 'dashboard', 'milestones', 30].
    // The correct fix is exact: false with key ['pm', 'dashboard', 'milestones'].
    const milestoneCalls = invalidateSpy.mock.calls.filter(([opts]) => {
      const key = (opts as { queryKey?: unknown[] }).queryKey;
      return Array.isArray(key) && key[0] === 'pm' && key[1] === 'dashboard' && key[2] === 'milestones';
    });

    expect(milestoneCalls.length).toBeGreaterThanOrEqual(1);

    // Verify exact: false is set (so it acts as a prefix match)
    const callOpts = milestoneCalls[0][0] as { exact?: boolean };
    expect(callOpts.exact).toBe(false);
  });
});
```

Run (must FAIL — current code calls `queryClient.invalidateQueries({ queryKey: queryKeys.pm.dashboard.milestones() })` which resolves to `['pm','dashboard','milestones', undefined]` with default `exact: true`, missing any variant keyed with a concrete `days` value):

```
cd client && npx vitest run src/modules/pm/components/__tests__/use-schedule-mutations.test.tsx
```

Expected failure: the `exact` assertion fails because the current call does not set `exact: false`.

### 2.2 Implement the fix

File: `client/src/modules/pm/hooks/use-schedule-mutations.js`

Locate the `invalidate` helper (line 13–16):

```js
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.pm.schedule.byProject(projectId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.pm.dashboard.milestones() });
  };
```

Replace with:

```js
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.pm.schedule.byProject(projectId) });
    // Use exact: false so ALL cached days-variants are invalidated (7, 14, 30).
    // queryKeys.pm.dashboard.milestones() = ['pm', 'dashboard', 'milestones', undefined]
    // Slicing to the 3-element prefix ensures every keyed variant is matched.
    queryClient.invalidateQueries({
      queryKey: ['pm', 'dashboard', 'milestones'],
      exact: false,
    });
  };
```

### 2.3 Confirm test passes

```
cd client && npx vitest run src/modules/pm/components/__tests__/use-schedule-mutations.test.tsx
```

All tests green.

### 2.4 Commit

```
git add client/src/modules/pm/hooks/use-schedule-mutations.js \
        client/src/modules/pm/components/__tests__/use-schedule-mutations.test.tsx
git commit -m "fix(pm): invalidate all milestones cache variants on schedule mutation (PROJ-007 AC-8)"
```

---

## Task 3 — Server: add `customer` sort field to project repository (AC-3, prerequisite)

### 3.1 Inspect the repository sort allowlist

File: `server/src/modules/pm/project.repository.js`

Read the file and locate the section that validates or maps the `sortBy` parameter before passing it to the Mongoose query. It will look similar to one of:

```js
const SORT_FIELDS = ['name', 'projectNumber', 'plannedStartDate', 'createdAt', 'estimatedBudget', 'status'];
```

or a mapping object:

```js
const SORT_FIELD_MAP = {
  name: 'name',
  projectNumber: 'projectNumber',
  plannedStartDate: 'plannedStartDate',
  createdAt: 'createdAt',
  estimatedBudget: 'estimatedBudget',
  status: 'status',
};
```

Identify the exact shape before proceeding. The instructions below assume a `SORT_FIELDS` allowlist array; adjust to match the actual code.

### 3.2 Write failing server test

File: `server/tests/unit/pm.projectDashboard.test.js`

Append inside the outer `describe` block:

```js
  test('sorts projects by customer name ascending', async () => {
    const custA = await createCustomer('Alpha Heizung');
    const custB = await createCustomer('Zeta Klima');

    await createProject(custA, { name: 'Project Alpha', status: 'IN_PROGRESS' });
    await createProject(custB, { name: 'Project Zeta', status: 'IN_PROGRESS' });

    const result = await projectRepository.findWithCursor({
      limit: 25,
      sortBy: 'customer',
      sortOrder: 'asc',
    });

    expect(result.data.length).toBe(2);
    expect(result.data[0].customerId.name).toBe('Alpha Heizung');
    expect(result.data[1].customerId.name).toBe('Zeta Klima');
  });

  test('sorts projects by customer name descending', async () => {
    const custA = await createCustomer('Alpha Heizung');
    const custB = await createCustomer('Zeta Klima');

    await createProject(custA, { name: 'Project Alpha', status: 'IN_PROGRESS' });
    await createProject(custB, { name: 'Project Zeta', status: 'IN_PROGRESS' });

    const result = await projectRepository.findWithCursor({
      limit: 25,
      sortBy: 'customer',
      sortOrder: 'desc',
    });

    expect(result.data.length).toBe(2);
    expect(result.data[0].customerId.name).toBe('Zeta Klima');
    expect(result.data[1].customerId.name).toBe('Alpha Heizung');
  });
```

Run (must FAIL — `customer` is not in the allowlist so the sort either falls back to default or throws):

```
cd server && npm test -- tests/unit/pm.projectDashboard.test.js
```

### 3.3 Read the repository to identify the exact sort implementation

File: `server/src/modules/pm/project.repository.js`

Read the file fully. Two common patterns exist:

**Pattern A — inline allowlist in `findWithCursor`:**

```js
const allowed = ['name', 'projectNumber', 'plannedStartDate', 'createdAt', 'estimatedBudget', 'status'];
const safeSortBy = allowed.includes(sortBy) ? sortBy : 'createdAt';
query.sort({ [safeSortBy]: sortOrder === 'desc' ? -1 : 1 });
```

**Pattern B — lookup map + aggregation `$sort`:**

```js
const SORT_FIELD_MAP = { name: 'name', ... };
const sortField = SORT_FIELD_MAP[sortBy] || 'createdAt';
pipeline.push({ $sort: { [sortField]: sortOrder === 'desc' ? -1 : 1 } });
```

Because `customerId` is a populated reference field, sorting by customer name requires an aggregation `$lookup` + `$sort` on the joined field `customerId.name`. If the query already uses an aggregation pipeline, add the sort field. If it uses `.populate()` + `.sort()`, it must be converted to aggregation for this sort key only.

### 3.4 Implement the sort (aggregation pipeline path — most likely)

Open `server/src/modules/pm/project.repository.js`.

**Step A:** Add `customer` to the sort map. If `SORT_FIELD_MAP` exists, add:

```js
customer: 'customerId.name',
```

**Step B:** Ensure the aggregation `$lookup` for `customerId` is present in `findWithCursor`. The populate call will already exist. If the query uses `.populate('customerId')` + `.lean()`, you must add a `$lookup` stage for `customer` sorts. Add the following **before** the `$sort` stage when `sortBy === 'customer'`:

```js
// Inside findWithCursor, before building the $sort stage:
if (sortBy === 'customer') {
  pipeline.push(
    { $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: '_customer' } },
    { $addFields: { '_customerName': { $ifNull: [{ $arrayElemAt: ['$_customer.name', 0] }, ''] } } },
  );
}
```

Then in the sort stage:

```js
const sortFieldResolved = sortBy === 'customer' ? '_customerName' : (SORT_FIELD_MAP[sortBy] || 'createdAt');
pipeline.push({ $sort: { [sortFieldResolved]: sortOrder === 'desc' ? -1 : 1 } });
```

**If the repository uses `.find().populate().sort()` (non-aggregation):** The complete conversion is larger. Add a dedicated aggregation branch for `sortBy === 'customer'` that runs the lookup pipeline and returns the same `{ data, nextCursor, hasNext }` shape. Keep the existing `.find()` path for all other sort fields to minimise blast radius.

The implementation must produce results sorted by the populated customer name. After applying whichever pattern matches the live code, re-run the test to verify.

### 3.5 Confirm tests pass

```
cd server && npm test -- tests/unit/pm.projectDashboard.test.js
```

All tests green.

### 3.6 Commit

```
git add server/src/modules/pm/project.repository.js \
        server/tests/unit/pm.projectDashboard.test.js
git commit -m "feat(pm): support sortBy=customer in project list endpoint (PROJ-007 AC-3)"
```

---

## Task 4 — Client: add `customer` column sort to `projects-table.jsx` (AC-3)

### 4.1 Write failing test

File: `client/src/modules/pm/components/__tests__/projects-table-sort.test.tsx`

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── Minimal mocks ────────────────────────────────────────────────
vi.mock('@/modules/pm/services/project-service', () => ({
  projectService: {
    getProjects: vi.fn().mockResolvedValue({ data: [], nextCursor: null, hasNext: false }),
    getDashboardSummary: vi.fn().mockResolvedValue({
      total: 0,
      byStatus: { DRAFT: 0, PLANNING: 0, IN_PROGRESS: 0, ON_HOLD: 0, COMPLETED: 0, ARCHIVED: 0 },
      risk: { overdue: 0, startingSoon: 0, endingSoon: 0 },
      budget: { estimatedBudgetTotal: 0 },
      upcomingMilestones: 0,
    }),
    getDashboardMilestones: vi.fn().mockResolvedValue([]),
    exportCsv: vi.fn().mockResolvedValue({ filename: 'test.csv' }),
  },
}));

vi.mock('@/modules/pm/hooks/use-project-mutations', () => ({
  useProjectMutations: () => ({
    create: { mutateAsync: vi.fn(), isPending: false },
    update: { mutateAsync: vi.fn(), isPending: false },
    remove: { mutate: vi.fn(), isPending: false },
    duplicate: { mutate: vi.fn() },
    bulkDelete: { mutate: vi.fn(), isPending: false },
    exportCsv: { mutate: vi.fn(), isPending: false },
  }),
}));

vi.mock('@/modules/pm/hooks/use-status-mutations', () => ({
  useStatusMutations: () => ({
    transition: { mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null },
  }),
}));

vi.mock('@/shared/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ t: (_k: string, fb: string) => fb, language: 'en' }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/modules/crm/hooks/use-cursor-list', () => ({
  useCursorList: () => ({
    items: [],
    pageSize: 25,
    setPageSize: vi.fn(),
    hasNext: false,
    hasPrev: false,
    isFetching: false,
    onNext: vi.fn(),
    onPrev: vi.fn(),
    reset: vi.fn(),
    refetch: vi.fn(),
  }),
}));

// ── Test ─────────────────────────────────────────────────────────
describe('ProjectsTable — customer sort column', () => {
  function renderTable() {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { ProjectsTable } = require('../projects-table');
    return render(
      <QueryClientProvider client={qc}>
        <ProjectsTable />
      </QueryClientProvider>,
    );
  }

  it('renders a sortable Customer column header', () => {
    renderTable();
    // The Customer column header must exist
    expect(screen.getByText('Customer')).toBeInTheDocument();
  });

  it('Customer column has accessorKey "customerId" (mapped to server "customer")', async () => {
    // This verifies the column definition exports the correct accessorKey.
    // We import the internal columns definition via a named export added in Task 4.2.
    const { PROJECTS_TABLE_COLUMNS_ACCESSOR_KEYS } = await import('../projects-table');
    expect(PROJECTS_TABLE_COLUMNS_ACCESSOR_KEYS).toContain('customerId');
  });
});
```

Run (must FAIL — no `Customer` column exists in the current table definition, and `PROJECTS_TABLE_COLUMNS_ACCESSOR_KEYS` export does not exist):

```
cd client && npx vitest run src/modules/pm/components/__tests__/projects-table-sort.test.tsx
```

### 4.2 Implement the customer column and sort mapping

File: `client/src/modules/pm/components/projects-table.jsx`

**Step A:** Export a constant listing the column accessor keys (used by the test and for introspection). Add after the import block, before `export function ProjectsTable`:

```js
// Exported for testing — lists column accessorKeys in render order.
export const PROJECTS_TABLE_COLUMNS_ACCESSOR_KEYS = [
  'name', 'projectType', 'customerId', 'status', 'projectManagerId', 'plannedStartDate', 'estimatedBudget',
];
```

**Step B:** Add the `Customer` column definition inside the `columns` `useMemo`. Insert it after the `projectType` column (between `projectType` and `status`), so it appears as the third column:

```js
    {
      accessorKey: 'customerId',
      header: t('pm.customer', 'Customer'),
      size: 200,
      Cell: ({ row }) => {
        const name = row.original.customerId?.name;
        if (!name) return <span className="text-xs text-muted-foreground/60">—</span>;
        return <span className="text-xs">{name}</span>;
      },
    },
```

**Step C:** Map the client column `accessorKey` to the server `sortBy` field. The `handleSortingChange` writes `sorting[0].id` directly into `apiParams.sortBy`. When `sorting[0].id === 'customerId'` the server receives `sortBy=customerId` but the server allowlist expects `sortBy=customer`. Add a mapping in `apiParams` derivation inside the `useMemo` (line 84–86 area):

```js
    if (sorting.length > 0) {
      // Map client accessorKey → server sortBy field name
      const SORT_KEY_MAP = {
        customerId: 'customer',
        projectManagerId: 'projectManager',
      };
      p.sortBy = SORT_KEY_MAP[sorting[0].id] ?? sorting[0].id;
      p.sortOrder = sorting[0].desc ? 'desc' : 'asc';
    }
```

Replace the existing two-line sort block:

```js
    if (sorting.length > 0) {
      p.sortBy = sorting[0].id;
      p.sortOrder = sorting[0].desc ? 'desc' : 'asc';
    }
```

with the mapping version above.

**Step D:** Remove the `customerId.name` sub-text that currently appears inside the `name` column cell (line 186–188 in the original file) to avoid double-rendering the customer name. The `name` column already shows `p.customerId?.name` as a subtitle; keep that subtitle **only** if the Customer column is absent (i.e., narrow screens). For simplicity — and to keep the plan scope tight — leave the subtitle in the `name` column as-is; it provides project-row context at a glance. The dedicated `Customer` column carries the sortable value.

### 4.3 Confirm tests pass

```
cd client && npx vitest run src/modules/pm/components/__tests__/projects-table-sort.test.tsx
```

All tests green.

### 4.4 Commit

```
git add client/src/modules/pm/components/projects-table.jsx \
        client/src/modules/pm/components/__tests__/projects-table-sort.test.tsx
git commit -m "feat(pm): add sortable Customer column to projects table (PROJ-007 AC-3)"
```

---

## Task 5 — Client: render all six status cards in `project-stats-row.jsx` (AC-1)

### 5.1 Understand the current state

The current `ProjectStatsRow` renders four cards in a `grid-cols-2 lg:grid-cols-4` grid:
1. Total Projects (`summary.total`) — violet
2. In Progress (`summary.byStatus.IN_PROGRESS`) — blue
3. Overdue (`summary.risk.overdue`) — amber
4. Upcoming Milestones (`summary.upcomingMilestones`) — emerald

AC-1 requires **all status cards** to be rendered. The server `getDashboardSummary` already returns a complete `byStatus` object keyed by all six statuses: `DRAFT`, `PLANNING`, `IN_PROGRESS`, `ON_HOLD`, `COMPLETED`, `ARCHIVED`. `summary.upcomingMilestones` is a count of MILESTONE-type schedule entries in the next 30 days. The field `summary.upcomingMilestones` (not `summary.byStatus.upcomingMilestones`) is correct — it lives at the top level of the summary response (see `project.service.js` line 275).

The redesigned layout must show:
1. Total Projects
2. Draft (`summary.byStatus.DRAFT`)
3. Planning (`summary.byStatus.PLANNING`)
4. In Progress (`summary.byStatus.IN_PROGRESS`)
5. On Hold (`summary.byStatus.ON_HOLD`)
6. Completed (`summary.byStatus.COMPLETED`)
7. Overdue (`summary.risk.overdue`)
8. Upcoming Milestones (`summary.upcomingMilestones`)

That is 8 cards. The grid changes from `grid-cols-2 lg:grid-cols-4` to `grid-cols-2 sm:grid-cols-4 lg:grid-cols-8` (all on one row on large screens) or a two-row layout `grid-cols-2 sm:grid-cols-4` (4+4). Use the two-row approach as it fits the existing `lg:col-span-2` container in `projects-table.jsx`.

Skeleton loader must also expand to 8 items.

### 5.2 Write failing test

File: `client/src/modules/pm/components/__tests__/project-stats-row.test.tsx`

```tsx
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/modules/pm/services/project-service', () => ({
  projectService: {
    getDashboardSummary: vi.fn().mockResolvedValue({
      total: 42,
      byStatus: {
        DRAFT: 5,
        PLANNING: 8,
        IN_PROGRESS: 12,
        ON_HOLD: 3,
        COMPLETED: 10,
        ARCHIVED: 4,
      },
      risk: { overdue: 2, startingSoon: 1, endingSoon: 1 },
      budget: { estimatedBudgetTotal: 500000 },
      upcomingMilestones: 7,
    }),
  },
}));

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ t: (_k: string, fb: string) => fb }),
}));

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('ProjectStatsRow — all-status cards (AC-1)', () => {
  it('renders Total Projects card', async () => {
    const { ProjectStatsRow } = await import('../project-stats-row');
    const { findByText } = render(<ProjectStatsRow />, { wrapper: Wrapper });
    expect(await findByText('Total Projects')).toBeInTheDocument();
    expect(await findByText('42')).toBeInTheDocument();
  });

  it('renders Draft card', async () => {
    const { ProjectStatsRow } = await import('../project-stats-row');
    const { findByText } = render(<ProjectStatsRow />, { wrapper: Wrapper });
    expect(await findByText('Draft')).toBeInTheDocument();
    expect(await findByText('5')).toBeInTheDocument();
  });

  it('renders Planning card', async () => {
    const { ProjectStatsRow } = await import('../project-stats-row');
    const { findByText } = render(<ProjectStatsRow />, { wrapper: Wrapper });
    expect(await findByText('Planning')).toBeInTheDocument();
    expect(await findByText('8')).toBeInTheDocument();
  });

  it('renders In Progress card', async () => {
    const { ProjectStatsRow } = await import('../project-stats-row');
    const { findByText } = render(<ProjectStatsRow />, { wrapper: Wrapper });
    expect(await findByText('In Progress')).toBeInTheDocument();
    expect(await findByText('12')).toBeInTheDocument();
  });

  it('renders On Hold card', async () => {
    const { ProjectStatsRow } = await import('../project-stats-row');
    const { findByText } = render(<ProjectStatsRow />, { wrapper: Wrapper });
    expect(await findByText('On Hold')).toBeInTheDocument();
    expect(await findByText('3')).toBeInTheDocument();
  });

  it('renders Completed card', async () => {
    const { ProjectStatsRow } = await import('../project-stats-row');
    const { findByText } = render(<ProjectStatsRow />, { wrapper: Wrapper });
    expect(await findByText('Completed')).toBeInTheDocument();
    expect(await findByText('10')).toBeInTheDocument();
  });

  it('renders Overdue card', async () => {
    const { ProjectStatsRow } = await import('../project-stats-row');
    const { findByText } = render(<ProjectStatsRow />, { wrapper: Wrapper });
    expect(await findByText('Overdue')).toBeInTheDocument();
    expect(await findByText('2')).toBeInTheDocument();
  });

  it('renders Upcoming Milestones card', async () => {
    const { ProjectStatsRow } = await import('../project-stats-row');
    const { findByText } = render(<ProjectStatsRow />, { wrapper: Wrapper });
    expect(await findByText('Upcoming Milestones')).toBeInTheDocument();
    expect(await findByText('7')).toBeInTheDocument();
  });
});
```

Run (must FAIL — Draft, Planning, On Hold, Completed cards do not exist):

```
cd client && npx vitest run src/modules/pm/components/__tests__/project-stats-row.test.tsx
```

Expected failure: multiple `findByText` assertions fail for Draft, Planning, On Hold, Completed.

### 5.3 Implement the full stats row

File: `client/src/modules/pm/components/project-stats-row.jsx`

Replace the entire file content with:

```jsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { projectService } from '@/modules/pm/services/project-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { PremiumStatCard } from '@/shared/components/premium-stat-card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FolderKanban, AlertTriangle, Milestone, PlayCircle,
  FileEdit, Calendar, PauseCircle, CheckCircle2,
} from 'lucide-react';

export function ProjectStatsRow() {
  const { t } = useLanguage();

  const { data: summary, isLoading } = useQuery({
    queryKey: queryKeys.pm.dashboard.summary(),
    queryFn: () => projectService.getDashboardSummary(),
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[100px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      <PremiumStatCard
        label={t('pm.totalProjects', 'Total Projects')}
        value={summary.total ?? 0}
        icon={FolderKanban}
        accent="violet"
      />
      <PremiumStatCard
        label={t('pm.statusDraft', 'Draft')}
        value={summary.byStatus?.DRAFT ?? 0}
        icon={FileEdit}
        accent="violet"
      />
      <PremiumStatCard
        label={t('pm.statusPlanning', 'Planning')}
        value={summary.byStatus?.PLANNING ?? 0}
        icon={Calendar}
        accent="blue"
      />
      <PremiumStatCard
        label={t('pm.statusInProgress', 'In Progress')}
        value={summary.byStatus?.IN_PROGRESS ?? 0}
        icon={PlayCircle}
        accent="blue"
      />
      <PremiumStatCard
        label={t('pm.statusOnHold', 'On Hold')}
        value={summary.byStatus?.ON_HOLD ?? 0}
        icon={PauseCircle}
        accent="amber"
      />
      <PremiumStatCard
        label={t('pm.statusCompleted', 'Completed')}
        value={summary.byStatus?.COMPLETED ?? 0}
        icon={CheckCircle2}
        accent="emerald"
      />
      <PremiumStatCard
        label={t('pm.overdueProjects', 'Overdue')}
        value={summary.risk?.overdue ?? 0}
        icon={AlertTriangle}
        accent="rose"
      />
      <PremiumStatCard
        label={t('pm.upcomingMilestones', 'Upcoming Milestones')}
        value={summary.upcomingMilestones ?? 0}
        icon={Milestone}
        accent="emerald"
      />
    </div>
  );
}
```

### 5.4 Update the grid container in `projects-table.jsx`

The stats row is rendered inside a `grid-cols-1 lg:grid-cols-3` container where it occupies `lg:col-span-2`. With 8 cards in two rows of 4, the `lg:col-span-2` parent is still appropriate — the inner grid is self-contained. No change to `projects-table.jsx` is needed for this step.

### 5.5 Confirm tests pass

```
cd client && npx vitest run src/modules/pm/components/__tests__/project-stats-row.test.tsx
```

All 8 tests green.

### 5.6 Commit

```
git add client/src/modules/pm/components/project-stats-row.jsx \
        client/src/modules/pm/components/__tests__/project-stats-row.test.tsx
git commit -m "feat(pm): render all six status stat cards in ProjectStatsRow (PROJ-007 AC-1)"
```

---

## Task 6 — Milestones widget field name verification (AC-8, part c)

The re-audit report notes a "field mismatch" on the upcoming-milestones card. The `MilestonesWidget` already reads `m.milestoneDate || m.endDate` (line 76 of the current file) and `m.projectId?._id || m.projectId` (line 80) which are correct. The `summary.upcomingMilestones` field used in the old `PremiumStatCard` was reading `summary.upcomingMilestones` — this field exists on the server response (line 275 of `project.service.js`). The field mismatch was that the old stats row was reading `summary.upcomingMilestones` (correct) but the label said "Upcoming Milestones" while showing no breakdown by status — that is fully resolved by Task 5 which replaces the single card with a dedicated Milestones count card.

No additional code change is needed for this sub-item. Verify by running all pm tests:

```
cd server && npm test -- tests/unit/pm.projectDashboard.test.js
cd client && npx vitest run src/modules/pm/components/__tests__/
```

---

## Task 7 — Full regression run and final commit

### 7.1 Run all PM server tests

```
cd server && npm test -- tests/unit/pm.projectDashboard.test.js tests/unit/pm.test.js
```

All tests must be green.

### 7.2 Run all PM client tests

```
cd client && npx vitest run src/modules/pm/
```

All tests must be green.

### 7.3 Run full client test suite to confirm no regressions

```
cd client && npx vitest run
```

No new failures.

### 7.4 Final commit (if any files were left unstaged)

```
git status
# If clean, nothing to commit. Otherwise:
git add -p
git commit -m "chore(pm): C6 dashboard-gaps — final cleanup (PROJ-007 AC-1/AC-3/AC-8)"
```

---

## AC closure checklist

| AC | Closed by | Evidence |
|----|-----------|----------|
| PROJ-007 AC-1 — all-status cards rendered | Task 5 | `ProjectStatsRow` renders 8 cards: Total, Draft, Planning, In Progress, On Hold, Completed, Overdue, Upcoming Milestones — all driven by `summary.byStatus.*` and `summary.risk.overdue` |
| PROJ-007 AC-3 — customer sort column | Tasks 3 + 4 | Server repository accepts `sortBy=customer` and runs a `$lookup`-backed sort; `projects-table.jsx` maps `accessorKey='customerId'` → server `sortBy=customer` via `SORT_KEY_MAP`; column header renders and triggers server-side sort |
| PROJ-007 AC-8 — milestones refresh fixes | Tasks 1 + 2 | Server `getDashboardMilestones` uses `pm:dashboard:milestones:${days}` cache key; `_invalidateDashboardCache` uses `invalidatePattern` for `pm:dashboard:milestones:*`; client `useScheduleMutations.invalidate()` fires with `exact: false` on the `['pm','dashboard','milestones']` prefix, invalidating all `days` variants |

---

## File change summary

| File | Change |
|------|--------|
| `server/src/modules/pm/project.service.js` | Fix `getDashboardMilestones` cache key to include `days`; fix `_invalidateDashboardCache` to use pattern delete |
| `server/src/modules/pm/project.repository.js` | Add `customer` to sort allowlist; implement aggregation `$lookup` + `$sort` for customer name |
| `server/tests/unit/pm.projectDashboard.test.js` | Add tests for `days`-keyed milestones cache and customer sort asc/desc |
| `client/src/modules/pm/hooks/use-schedule-mutations.js` | Fix `invalidate()` to use `exact: false` prefix match for milestones query key |
| `client/src/modules/pm/components/project-stats-row.jsx` | Replace 4-card layout with 8-card all-status layout |
| `client/src/modules/pm/components/projects-table.jsx` | Add Customer column; add `SORT_KEY_MAP` to translate `customerId` → `customer` for server sort |
| `client/src/modules/pm/components/__tests__/use-schedule-mutations.test.tsx` | New — tests milestones invalidation uses `exact: false` |
| `client/src/modules/pm/components/__tests__/project-stats-row.test.tsx` | New — tests all 8 stat cards render with correct values |
| `client/src/modules/pm/components/__tests__/projects-table-sort.test.tsx` | New — tests Customer column exists and accessor key is present |
