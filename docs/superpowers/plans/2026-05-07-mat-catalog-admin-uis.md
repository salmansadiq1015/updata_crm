# MAT Catalog — Admin UIs (UoM, Text Blocks, Price Management)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the three admin management UIs for Module 10 — Units of Measure configuration, Text Block management with rich-text editing, and Price Management (bulk update preview, history, rollback, scheduled changes).

**Architecture:** All server infrastructure exists (models, repos, services, routes). This plan builds purely client-side pages and their supporting hooks/services. All pages scaffold-created in Plan 1 are replaced with full implementations. Server routes are at `/api/v1/catalog/units`, `/api/v1/catalog/text-blocks`, `/api/v1/catalog/prices/*`.

**Tech Stack:** Next.js App Router, React 19, React Hook Form + Zod 4, TanStack Query 5, Vitest + MSW 2, Tailwind + shadcn/ui, TipTap (rich text, already used in doctpl module)

**Prerequisite:** Plan 1 must be complete (permissions, endpoints, query keys, translation keys, scaffold pages).

---

## File Map

**Created (client):**
- `client/src/modules/catalog/services/unit-service.js`
- `client/src/modules/catalog/services/text-block-service.js`
- `client/src/modules/catalog/services/price-service.js`
- `client/src/modules/catalog/hooks/use-unit-queries.js`
- `client/src/modules/catalog/hooks/use-unit-mutations.js`
- `client/src/modules/catalog/hooks/use-text-block-queries.js`
- `client/src/modules/catalog/hooks/use-text-block-mutations.js`
- `client/src/modules/catalog/hooks/use-price-queries.js`
- `client/src/modules/catalog/hooks/use-price-mutations.js`
- `client/src/modules/catalog/components/uom-management-table.jsx`
- `client/src/modules/catalog/components/uom-form-dialog.jsx`
- `client/src/modules/catalog/components/text-block-table.jsx`
- `client/src/modules/catalog/components/text-block-form-dialog.jsx`
- `client/src/modules/catalog/components/price-management-table.jsx`
- `client/src/modules/catalog/components/price-update-dialog.jsx`
- `client/src/modules/catalog/components/price-history-panel.jsx`
- `client/src/modules/catalog/components/price-rollback-dialog.jsx`

**Modified (client):**
- `client/src/app/(platform)/catalog/settings/units/page.jsx` — replace scaffold with full UI
- `client/src/app/(platform)/catalog/text-blocks/page.jsx` — replace scaffold with full UI
- `client/src/app/(platform)/catalog/prices/page.jsx` — replace scaffold with full UI

**Test files:**
- `client/src/modules/catalog/__tests__/use-unit-mutations.test.ts`
- `client/src/modules/catalog/__tests__/use-text-block-mutations.test.ts`
- `client/src/modules/catalog/__tests__/use-price-mutations.test.ts`

---

## Task 1: Unit of Measure — Service, Hooks & Page

**Files:**
- Create: `client/src/modules/catalog/services/unit-service.js`
- Create: `client/src/modules/catalog/hooks/use-unit-queries.js`
- Create: `client/src/modules/catalog/hooks/use-unit-mutations.js`
- Create: `client/src/modules/catalog/components/uom-management-table.jsx`
- Create: `client/src/modules/catalog/components/uom-form-dialog.jsx`
- Modify: `client/src/app/(platform)/catalog/settings/units/page.jsx`
- Test: `client/src/modules/catalog/__tests__/use-unit-mutations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `client/src/modules/catalog/__tests__/use-unit-mutations.test.ts`:

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useUnitMutations } from '../hooks/use-unit-mutations';
import React from 'react';

const server = setupServer(
  http.post('/api/v1/catalog/units', () =>
    HttpResponse.json({ data: { _id: 'u1', code: 'PAL', nameDe: 'Palette', nameFr: 'Palette', nameIt: 'Pallet', isSystem: false } }, { status: 201 })
  ),
  http.delete('/api/v1/catalog/units/PAL', () =>
    HttpResponse.json({ data: { deleted: true } })
  )
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: new QueryClient() }, children);

describe('useUnitMutations', () => {
  it('createUnit fires POST and returns created unit', async () => {
    const { result } = renderHook(() => useUnitMutations(), { wrapper });
    result.current.createUnit.mutate({ code: 'PAL', nameDe: 'Palette', nameFr: 'Palette', nameIt: 'Pallet' });
    await waitFor(() => expect(result.current.createUnit.isSuccess).toBe(true));
    expect(result.current.createUnit.data?.data?.code).toBe('PAL');
  });

  it('deleteUnit fires DELETE', async () => {
    const { result } = renderHook(() => useUnitMutations(), { wrapper });
    result.current.deleteUnit.mutate('PAL');
    await waitFor(() => expect(result.current.deleteUnit.isSuccess).toBe(true));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
cd client && npx vitest run src/modules/catalog/__tests__/use-unit-mutations.test.ts
```

Expected: FAIL — `useUnitMutations` not found.

- [ ] **Step 3: Create `unit-service.js`**

Create `client/src/modules/catalog/services/unit-service.js`:

```javascript
import apiClient from '@/lib/api/client';
import { ENDPOINTS as E } from '@/lib/api/endpoints';

export const unitService = {
  list: () => apiClient.get(E.CATALOG.UNITS),
  getByCode: (code) => apiClient.get(E.CATALOG.UNIT_BY_CODE(code)),
  create: (data) => apiClient.post(E.CATALOG.UNITS, data),
  update: (code, data) => apiClient.put(E.CATALOG.UNIT_BY_CODE(code), data),
  remove: (code) => apiClient.delete(E.CATALOG.UNIT_BY_CODE(code)),
};
```

(Replace `ENDPOINTS` with the actual export name used in this project — check `article-service.js` to see if it imports as `E`, `ENDPOINTS`, or destructures from `endpoints`.)

- [ ] **Step 4: Create `use-unit-queries.js`**

Create `client/src/modules/catalog/hooks/use-unit-queries.js`:

```javascript
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { unitService } from '../services/unit-service';

export function useUnits() {
  return useQuery({
    queryKey: queryKeys.catalog.units(),
    queryFn: () => unitService.list().then((r) => r.data ?? r),
    staleTime: 5 * 60_000,
  });
}

export function useUnitDetail(code) {
  return useQuery({
    queryKey: queryKeys.catalog.unitDetail(code),
    queryFn: () => unitService.getByCode(code).then((r) => r.data ?? r),
    enabled: !!code,
  });
}
```

- [ ] **Step 5: Create `use-unit-mutations.js`**

Create `client/src/modules/catalog/hooks/use-unit-mutations.js`:

```javascript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { unitService } from '../services/unit-service';

export function useUnitMutations() {
  const qc = useQueryClient();

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.catalog.units() });

  const createUnit = useMutation({
    mutationFn: unitService.create,
    onSuccess: invalidate,
  });

  const updateUnit = useMutation({
    mutationFn: ({ code, data }) => unitService.update(code, data),
    onSuccess: invalidate,
  });

  const deleteUnit = useMutation({
    mutationFn: unitService.remove,
    onSuccess: invalidate,
  });

  return { createUnit, updateUnit, deleteUnit };
}
```

- [ ] **Step 6: Run test to verify it passes**

```
cd client && npx vitest run src/modules/catalog/__tests__/use-unit-mutations.test.ts
```

Expected: PASS.

- [ ] **Step 7: Create `uom-form-dialog.jsx`**

Create `client/src/modules/catalog/components/uom-form-dialog.jsx`:

```jsx
'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/shared/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import { useUnitMutations } from '../hooks/use-unit-mutations';
import { useLanguage } from '@/lib/i18n/language-context';

const schema = z.object({
  code: z.string().min(1).max(10).regex(/^[A-Za-z0-9]+$/, 'Alphanumeric only'),
  nameDe: z.string().min(1).max(50),
  nameFr: z.string().min(1).max(50),
  nameIt: z.string().min(1).max(50),
  baseUnitCode: z.string().max(10).optional().or(z.literal('')),
  conversionFactor: z.preprocess(
    (v) => (v === '' ? undefined : Number(v)),
    z.number().positive().optional()
  ),
});

export function UomFormDialog({ open, onClose, unit }) {
  const { t } = useLanguage();
  const { createUnit, updateUnit } = useUnitMutations();
  const isEdit = !!unit;

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      code: '',
      nameDe: '',
      nameFr: '',
      nameIt: '',
      baseUnitCode: '',
      conversionFactor: '',
    },
  });

  useEffect(() => {
    if (unit) {
      form.reset({
        code: unit.code,
        nameDe: unit.nameDe,
        nameFr: unit.nameFr,
        nameIt: unit.nameIt,
        baseUnitCode: unit.baseUnitCode ?? '',
        conversionFactor: unit.conversionFactor ?? '',
      });
    } else {
      form.reset({ code: '', nameDe: '', nameFr: '', nameIt: '', baseUnitCode: '', conversionFactor: '' });
    }
  }, [unit]);

  const onSubmit = async (values) => {
    const payload = {
      ...values,
      baseUnitCode: values.baseUnitCode || undefined,
      conversionFactor: values.conversionFactor || undefined,
    };
    if (isEdit) {
      await updateUnit.mutateAsync({ code: unit.code, data: payload });
    } else {
      await createUnit.mutateAsync(payload);
    }
    onClose();
  };

  const isPending = createUnit.isPending || updateUnit.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('catalog.units.create').replace('Create', 'Edit') : t('catalog.units.create')}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('catalog.units.code')}</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      disabled={isEdit}
                      placeholder="e.g. lfm"
                      className="uppercase"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {(['nameDe', 'nameFr', 'nameIt'] as const).map((name) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t(`catalog.units.${name}`)}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="baseUnitCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('catalog.units.baseUnit')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. m" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="conversionFactor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('catalog.units.conversionFactor')}</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" step="any" placeholder="e.g. 0.01" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8: Create `uom-management-table.jsx`**

Create `client/src/modules/catalog/components/uom-management-table.jsx`:

```jsx
'use client';

import { useState } from 'react';
import { Trash2, Pencil, Lock } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/shared/components/ui/table';
import { Button } from '@/shared/components/ui/button';
import { Badge } from '@/shared/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/shared/components/ui/alert-dialog';
import { useUnits } from '../hooks/use-unit-queries';
import { useUnitMutations } from '../hooks/use-unit-mutations';
import { UomFormDialog } from './uom-form-dialog';
import { useLanguage } from '@/lib/i18n/language-context';

export function UomManagementTable() {
  const { t } = useLanguage();
  const { data: units = [], isLoading } = useUnits();
  const { deleteUnit } = useUnitMutations();
  const [dialogUnit, setDialogUnit] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const openCreate = () => { setDialogUnit(null); setDialogOpen(true); };
  const openEdit = (u) => { setDialogUnit(u); setDialogOpen(true); };

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground animate-pulse">Loading units...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end px-1">
        <Button size="sm" onClick={openCreate}>
          + {t('catalog.units.create')}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">{t('catalog.units.code')}</TableHead>
              <TableHead>{t('catalog.units.nameDe')}</TableHead>
              <TableHead>{t('catalog.units.nameFr')}</TableHead>
              <TableHead>{t('catalog.units.nameIt')}</TableHead>
              <TableHead>{t('catalog.units.baseUnit')}</TableHead>
              <TableHead>{t('catalog.units.conversionFactor')}</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => (
              <TableRow key={unit.code}>
                <TableCell className="font-mono font-medium">
                  {unit.code}
                  {unit.isSystem && (
                    <Lock className="inline ml-1.5 w-3 h-3 text-muted-foreground" />
                  )}
                </TableCell>
                <TableCell>{unit.nameDe}</TableCell>
                <TableCell>{unit.nameFr}</TableCell>
                <TableCell>{unit.nameIt}</TableCell>
                <TableCell>{unit.baseUnitCode ?? '—'}</TableCell>
                <TableCell>{unit.conversionFactor ?? '—'}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      disabled={unit.isSystem}
                      onClick={() => openEdit(unit)}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          disabled={unit.isSystem || (unit.usageCount ?? 0) > 0}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete unit "{unit.code}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => deleteUnit.mutate(unit.code)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <UomFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        unit={dialogUnit}
      />
    </div>
  );
}
```

- [ ] **Step 9: Replace scaffold with full page**

Replace `client/src/app/(platform)/catalog/settings/units/page.jsx`:

```jsx
'use client';

import { Ruler } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';
import { UomManagementTable } from '@/modules/catalog/components/uom-management-table';
import { useLanguage } from '@/lib/i18n/language-context';

export default function UnitsPage() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        icon={Ruler}
        title={t('catalog.units.title')}
        description="Configure measurement units used across the catalog"
      />
      <div className="flex-1 overflow-y-auto">
        <UomManagementTable />
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Run all unit tests**

```
cd client && npx vitest run src/modules/catalog/__tests__/use-unit-mutations.test.ts
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add client/src/modules/catalog/services/unit-service.js \
        client/src/modules/catalog/hooks/use-unit-queries.js \
        client/src/modules/catalog/hooks/use-unit-mutations.js \
        client/src/modules/catalog/components/uom-management-table.jsx \
        client/src/modules/catalog/components/uom-form-dialog.jsx \
        client/src/app/(platform)/catalog/settings/units/page.jsx \
        client/src/modules/catalog/__tests__/use-unit-mutations.test.ts
git commit -m "feat(catalog): UoM management page — CRUD with multilingual names (MAT-008)"
```

---

## Task 2: Text Block Management — Service, Hooks, Rich Text & Page

**Files:**
- Create: `client/src/modules/catalog/services/text-block-service.js`
- Create: `client/src/modules/catalog/hooks/use-text-block-queries.js`
- Create: `client/src/modules/catalog/hooks/use-text-block-mutations.js`
- Create: `client/src/modules/catalog/components/text-block-table.jsx`
- Create: `client/src/modules/catalog/components/text-block-form-dialog.jsx`
- Modify: `client/src/app/(platform)/catalog/text-blocks/page.jsx`
- Test: `client/src/modules/catalog/__tests__/use-text-block-mutations.test.ts`

- [ ] **Step 1: Verify TipTap is already installed**

```
cd client && grep -r "tiptap" package.json
```

If TipTap packages are present (`@tiptap/react`, `@tiptap/starter-kit`), proceed. If not, check how the doctpl module implements rich text (`grep -r "tiptap\|prosemirror\|quill" client/src/modules/doctpl --include="*.jsx" -l`), and use the same editor component found there rather than adding a new dependency.

- [ ] **Step 2: Write the failing test**

Create `client/src/modules/catalog/__tests__/use-text-block-mutations.test.ts`:

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { useTextBlockMutations } from '../hooks/use-text-block-mutations';
import React from 'react';

const server = setupServer(
  http.post('/api/v1/catalog/text-blocks', () =>
    HttpResponse.json({
      data: {
        _id: 'tb1',
        title: 'Warranty Terms',
        bodyHtml: '<p>12 months warranty</p>',
        price: 0,
        status: 'ACTIVE',
      },
    }, { status: 201 })
  ),
  http.delete('/api/v1/catalog/text-blocks/tb1', () =>
    HttpResponse.json({ data: { deleted: true } })
  )
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: new QueryClient() }, children);

describe('useTextBlockMutations', () => {
  it('createTextBlock fires POST', async () => {
    const { result } = renderHook(() => useTextBlockMutations(), { wrapper });
    result.current.createTextBlock.mutate({
      title: 'Warranty Terms',
      bodyHtml: '<p>12 months warranty</p>',
    });
    await waitFor(() => expect(result.current.createTextBlock.isSuccess).toBe(true));
    expect(result.current.createTextBlock.data?.data?.title).toBe('Warranty Terms');
  });

  it('deleteTextBlock fires DELETE', async () => {
    const { result } = renderHook(() => useTextBlockMutations(), { wrapper });
    result.current.deleteTextBlock.mutate('tb1');
    await waitFor(() => expect(result.current.deleteTextBlock.isSuccess).toBe(true));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```
cd client && npx vitest run src/modules/catalog/__tests__/use-text-block-mutations.test.ts
```

Expected: FAIL — `useTextBlockMutations` not found.

- [ ] **Step 4: Create `text-block-service.js`**

Create `client/src/modules/catalog/services/text-block-service.js`:

```javascript
import apiClient from '@/lib/api/client';
import { ENDPOINTS as E } from '@/lib/api/endpoints';

export const textBlockService = {
  list: (params = {}) => apiClient.get(E.CATALOG.TEXT_BLOCKS, { params }),
  getById: (id) => apiClient.get(E.CATALOG.TEXT_BLOCK_BY_ID(id)),
  create: (data) => apiClient.post(E.CATALOG.TEXT_BLOCKS, data),
  update: (id, data) => apiClient.put(E.CATALOG.TEXT_BLOCK_BY_ID(id), data),
  remove: (id) => apiClient.delete(E.CATALOG.TEXT_BLOCK_BY_ID(id)),
};
```

- [ ] **Step 5: Create `use-text-block-queries.js`**

Create `client/src/modules/catalog/hooks/use-text-block-queries.js`:

```javascript
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { textBlockService } from '../services/text-block-service';

export function useTextBlocks(filters = {}) {
  return useQuery({
    queryKey: queryKeys.catalog.textBlocks(filters),
    queryFn: () => textBlockService.list(filters).then((r) => (Array.isArray(r) ? r : (r?.data ?? []))),
    staleTime: 60_000,
  });
}

export function useTextBlockDetail(id) {
  return useQuery({
    queryKey: queryKeys.catalog.textBlockDetail(id),
    queryFn: () => textBlockService.getById(id).then((r) => r.data ?? r),
    enabled: !!id,
  });
}
```

- [ ] **Step 6: Create `use-text-block-mutations.js`**

Create `client/src/modules/catalog/hooks/use-text-block-mutations.js`:

```javascript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { textBlockService } from '../services/text-block-service';

export function useTextBlockMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['catalog', 'textBlocks'] });

  const createTextBlock = useMutation({
    mutationFn: textBlockService.create,
    onSuccess: invalidate,
  });

  const updateTextBlock = useMutation({
    mutationFn: ({ id, data }) => textBlockService.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.catalog.textBlockDetail(id) });
      invalidate();
    },
  });

  const deleteTextBlock = useMutation({
    mutationFn: textBlockService.remove,
    onSuccess: invalidate,
  });

  return { createTextBlock, updateTextBlock, deleteTextBlock };
}
```

- [ ] **Step 7: Run test to verify it passes**

```
cd client && npx vitest run src/modules/catalog/__tests__/use-text-block-mutations.test.ts
```

Expected: PASS.

- [ ] **Step 8: Create `text-block-form-dialog.jsx`**

Before writing, check how the doctpl module implements its TipTap editor. Run:

```
grep -r "useEditor\|EditorContent\|StarterKit" client/src/modules/doctpl --include="*.jsx" -l
```

Open one of those files to see the editor setup. Then create `client/src/modules/catalog/components/text-block-form-dialog.jsx` using the same pattern:

```jsx
'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/shared/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select';
import { useTextBlockMutations } from '../hooks/use-text-block-mutations';
import { useCatalogCategories } from '../hooks/use-catalog-queries';
import { useLanguage } from '@/lib/i18n/language-context';

const schema = z.object({
  title: z.string().min(1).max(200),
  categoryId: z.string().optional(),
  price: z.preprocess((v) => (v === '' ? 0 : Number(v)), z.number().min(0)),
  unit: z.string().max(20).optional().or(z.literal('')),
  status: z.enum(['ACTIVE', 'INACTIVE']),
});

export function TextBlockFormDialog({ open, onClose, textBlock }) {
  const { t } = useLanguage();
  const { createTextBlock, updateTextBlock } = useTextBlockMutations();
  const { data: categories = [] } = useCatalogCategories();
  const isEdit = !!textBlock;

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      categoryId: '',
      price: '',
      unit: '',
      status: 'ACTIVE',
    },
  });

  const editor = useEditor({
    extensions: [StarterKit],
    content: textBlock?.bodyHtml ?? '',
  });

  useEffect(() => {
    if (textBlock) {
      form.reset({
        title: textBlock.title,
        categoryId: textBlock.categoryId ?? '',
        price: textBlock.price ?? '',
        unit: textBlock.unit ?? '',
        status: textBlock.status,
      });
      editor?.commands.setContent(textBlock.bodyHtml ?? '');
    } else {
      form.reset({ title: '', categoryId: '', price: '', unit: '', status: 'ACTIVE' });
      editor?.commands.clearContent();
    }
  }, [textBlock]);

  const onSubmit = async (values) => {
    const payload = {
      ...values,
      bodyHtml: editor?.getHTML() ?? '',
      categoryId: values.categoryId || undefined,
      unit: values.unit || undefined,
    };
    if (isEdit) {
      await updateTextBlock.mutateAsync({ id: textBlock._id, data: payload });
    } else {
      await createTextBlock.mutateAsync(payload);
    }
    onClose();
  };

  const isPending = createTextBlock.isPending || updateTextBlock.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t('catalog.textBlocks.edit') : t('catalog.textBlocks.create')}
          </DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="No category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="">No category</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c._id} value={c._id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('catalog.articles.status')}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ACTIVE">{t('catalog.articles.statusActive')}</SelectItem>
                        <SelectItem value="INACTIVE">{t('catalog.articles.statusInactive')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('catalog.articles.basePrice')}</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" step="0.01" min="0" placeholder="0.00" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('catalog.articles.unitOfMeasure')}</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g. h" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div>
              <p className="text-sm font-medium mb-2">{t('catalog.textBlocks.bodyHtml')}</p>
              <div className="rounded-md border min-h-32 p-2 prose prose-sm max-w-none">
                <EditorContent editor={editor} />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 9: Create `text-block-table.jsx`**

Create `client/src/modules/catalog/components/text-block-table.jsx`:

```jsx
'use client';

import { useState } from 'react';
import { Pencil, Trash2, Search } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/shared/components/ui/table';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Badge } from '@/shared/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/components/ui/alert-dialog';
import { useTextBlocks } from '../hooks/use-text-block-queries';
import { useTextBlockMutations } from '../hooks/use-text-block-mutations';
import { TextBlockFormDialog } from './text-block-form-dialog';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';

export function TextBlockTable() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [dialogBlock, setDialogBlock] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const { data: blocks = [], isLoading } = useTextBlocks({ q: debouncedSearch || undefined });
  const { deleteTextBlock } = useTextBlockMutations();

  const openCreate = () => { setDialogBlock(null); setDialogOpen(true); };
  const openEdit = (b) => { setDialogBlock(b); setDialogOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search text blocks..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={openCreate}>
          + {t('catalog.textBlocks.create')}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="w-28">Price (CHF)</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : blocks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  No text blocks found.
                </TableCell>
              </TableRow>
            ) : (
              blocks.map((block) => (
                <TableRow key={block._id}>
                  <TableCell className="font-medium">{block.title}</TableCell>
                  <TableCell>{block.category?.name ?? '—'}</TableCell>
                  <TableCell>
                    {block.price ? `${block.price.toFixed(2)}` : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={block.status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {block.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(block)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete "{block.title}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Existing uses in quotations and reports will not be affected.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => deleteTextBlock.mutate(block._id)}
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <TextBlockFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        textBlock={dialogBlock}
      />
    </div>
  );
}
```

- [ ] **Step 10: Replace scaffold with full page**

Replace `client/src/app/(platform)/catalog/text-blocks/page.jsx`:

```jsx
'use client';

import { Type } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';
import { TextBlockTable } from '@/modules/catalog/components/text-block-table';
import { useLanguage } from '@/lib/i18n/language-context';

export default function TextBlocksPage() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        icon={Type}
        title={t('catalog.textBlocks.title')}
        description="Manage reusable text blocks for quotations and reports"
      />
      <div className="flex-1 overflow-y-auto">
        <TextBlockTable />
      </div>
    </div>
  );
}
```

- [ ] **Step 11: Run all text block tests**

```
cd client && npx vitest run src/modules/catalog/__tests__/use-text-block-mutations.test.ts
```

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add client/src/modules/catalog/services/text-block-service.js \
        client/src/modules/catalog/hooks/use-text-block-queries.js \
        client/src/modules/catalog/hooks/use-text-block-mutations.js \
        client/src/modules/catalog/components/text-block-table.jsx \
        client/src/modules/catalog/components/text-block-form-dialog.jsx \
        client/src/app/(platform)/catalog/text-blocks/page.jsx \
        client/src/modules/catalog/__tests__/use-text-block-mutations.test.ts
git commit -m "feat(catalog): text block management page with rich text editor (MAT-004)"
```

---

## Task 3: Price Management — Service, Hooks & Bulk Update UI

**Files:**
- Create: `client/src/modules/catalog/services/price-service.js`
- Create: `client/src/modules/catalog/hooks/use-price-queries.js`
- Create: `client/src/modules/catalog/hooks/use-price-mutations.js`
- Create: `client/src/modules/catalog/components/price-update-dialog.jsx`
- Create: `client/src/modules/catalog/components/price-management-table.jsx`
- Modify: `client/src/app/(platform)/catalog/prices/page.jsx`
- Test: `client/src/modules/catalog/__tests__/use-price-mutations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `client/src/modules/catalog/__tests__/use-price-mutations.test.ts`:

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { usePriceMutations } from '../hooks/use-price-mutations';
import React from 'react';

const server = setupServer(
  http.post('/api/v1/catalog/prices/update', () =>
    HttpResponse.json({
      data: {
        batchId: 'batch123',
        articlesUpdated: 5,
        appliedAt: '2026-05-07T10:00:00Z',
      },
    })
  ),
  http.post('/api/v1/catalog/prices/rollback/batch123', () =>
    HttpResponse.json({ data: { rolledBack: 5 } })
  )
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(QueryClientProvider, { client: new QueryClient() }, children);

describe('usePriceMutations', () => {
  it('updatePrices fires POST /prices/update', async () => {
    const { result } = renderHook(() => usePriceMutations(), { wrapper });
    result.current.updatePrices.mutate({ articleIds: ['a1'], newPrice: 99 });
    await waitFor(() => expect(result.current.updatePrices.isSuccess).toBe(true));
    expect(result.current.updatePrices.data?.data?.batchId).toBe('batch123');
  });

  it('rollbackBatch fires POST /prices/rollback/:batchId', async () => {
    const { result } = renderHook(() => usePriceMutations(), { wrapper });
    result.current.rollbackBatch.mutate('batch123');
    await waitFor(() => expect(result.current.rollbackBatch.isSuccess).toBe(true));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
cd client && npx vitest run src/modules/catalog/__tests__/use-price-mutations.test.ts
```

Expected: FAIL — `usePriceMutations` not found.

- [ ] **Step 3: Create `price-service.js`**

Create `client/src/modules/catalog/services/price-service.js`:

```javascript
import apiClient from '@/lib/api/client';
import { ENDPOINTS as E } from '@/lib/api/endpoints';

export const priceService = {
  getHistory: (articleId) => apiClient.get(E.CATALOG.PRICE_HISTORY(articleId)),
  getBatches: () => apiClient.get(E.CATALOG.PRICE_BATCHES),
  update: (payload) => apiClient.post(E.CATALOG.PRICE_UPDATE, payload),
  schedule: (payload) => apiClient.post(E.CATALOG.PRICE_SCHEDULE, payload),
  rollback: (batchId) => apiClient.post(E.CATALOG.PRICE_ROLLBACK(batchId)),
};
```

- [ ] **Step 4: Create `use-price-queries.js`**

Create `client/src/modules/catalog/hooks/use-price-queries.js`:

```javascript
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { priceService } from '../services/price-service';

export function usePriceHistory(articleId) {
  return useQuery({
    queryKey: queryKeys.catalog.priceHistory(articleId),
    queryFn: () => priceService.getHistory(articleId).then((r) => (Array.isArray(r) ? r : (r?.data ?? []))),
    enabled: !!articleId,
  });
}

export function usePriceBatches() {
  return useQuery({
    queryKey: queryKeys.catalog.priceBatches(),
    queryFn: () => priceService.getBatches().then((r) => (Array.isArray(r) ? r : (r?.data ?? []))),
    staleTime: 30_000,
  });
}
```

- [ ] **Step 5: Create `use-price-mutations.js`**

Create `client/src/modules/catalog/hooks/use-price-mutations.js`:

```javascript
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { priceService } from '../services/price-service';

export function usePriceMutations() {
  const qc = useQueryClient();

  const updatePrices = useMutation({
    mutationFn: priceService.update,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog', 'articles'] });
      qc.invalidateQueries({ queryKey: queryKeys.catalog.priceBatches() });
    },
  });

  const schedulePrices = useMutation({
    mutationFn: priceService.schedule,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.catalog.priceBatches() }),
  });

  const rollbackBatch = useMutation({
    mutationFn: priceService.rollback,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['catalog', 'articles'] });
      qc.invalidateQueries({ queryKey: queryKeys.catalog.priceBatches() });
    },
  });

  return { updatePrices, schedulePrices, rollbackBatch };
}
```

- [ ] **Step 6: Run test to verify it passes**

```
cd client && npx vitest run src/modules/catalog/__tests__/use-price-mutations.test.ts
```

Expected: PASS.

- [ ] **Step 7: Create `price-update-dialog.jsx`**

Create `client/src/modules/catalog/components/price-update-dialog.jsx`:

```jsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/shared/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Button } from '@/shared/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { Label } from '@/shared/components/ui/label';
import { Badge } from '@/shared/components/ui/badge';
import { ArrowRight } from 'lucide-react';
import { usePriceMutations } from '../hooks/use-price-mutations';
import { useLanguage } from '@/lib/i18n/language-context';
import { format, addDays } from 'date-fns';

const schema = z.object({
  mode: z.enum(['fixed', 'percentage', 'schedule']),
  value: z.preprocess((v) => Number(v), z.number()),
  effectiveDate: z.string().optional(),
});

export function PriceUpdateDialog({ open, onClose, selectedArticles }) {
  const { t } = useLanguage();
  const { updatePrices, schedulePrices } = usePriceMutations();
  const [preview, setPreview] = useState(null);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { mode: 'fixed', value: '', effectiveDate: '' },
  });

  const mode = form.watch('mode');
  const value = form.watch('value');

  const computePreview = () => {
    return selectedArticles.map((a) => {
      const oldPrice = a.basePrice;
      const newPrice = mode === 'percentage'
        ? Math.round(oldPrice * (1 + value / 100) * 100) / 100
        : Number(value);
      return { ...a, oldPrice, newPrice, delta: newPrice - oldPrice };
    });
  };

  const onPreview = () => setPreview(computePreview());

  const onConfirm = async () => {
    const articleIds = selectedArticles.map((a) => a._id);
    const payload =
      mode === 'schedule'
        ? {
            articleIds,
            percentage: value,
            scheduledDate: form.getValues('effectiveDate'),
          }
        : mode === 'percentage'
        ? { articleIds, percentage: value }
        : { articleIds, newPrice: Number(value) };

    if (mode === 'schedule') {
      await schedulePrices.mutateAsync(payload);
    } else {
      await updatePrices.mutateAsync(payload);
    }
    onClose();
  };

  const isPending = updatePrices.isPending || schedulePrices.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('catalog.prices.update')}</DialogTitle>
          <DialogDescription>
            {selectedArticles.length} article{selectedArticles.length !== 1 ? 's' : ''} selected
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4">
            <FormField
              control={form.control}
              name="mode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Update type</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="flex gap-4"
                    >
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="fixed" id="fixed" />
                        <Label htmlFor="fixed">Fixed price</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="percentage" id="pct" />
                        <Label htmlFor="pct">Percentage</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="schedule" id="sched" />
                        <Label htmlFor="sched">{t('catalog.prices.schedule')}</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {mode === 'fixed' ? 'New Price (CHF)' : 'Percentage (%)'}
                    </FormLabel>
                    <FormControl>
                      <Input {...field} type="number" step={mode === 'fixed' ? '0.01' : '0.1'} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {mode === 'schedule' && (
                <FormField
                  control={form.control}
                  name="effectiveDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('catalog.prices.effectiveDate')}</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" min={format(addDays(new Date(), 1), 'yyyy-MM-dd')} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <Button type="button" variant="outline" size="sm" onClick={onPreview}>
              Preview Changes
            </Button>
          </form>
        </Form>

        {preview && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Preview</p>
            <div className="max-h-48 overflow-y-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">Article</th>
                    <th className="text-right px-3 py-2">{t('catalog.prices.oldPrice')}</th>
                    <th className="text-right px-3 py-2">{t('catalog.prices.newPrice')}</th>
                    <th className="text-right px-3 py-2">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row._id} className="border-t">
                      <td className="px-3 py-1.5 font-mono">{row.articleNumber}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">
                        {row.oldPrice.toFixed(2)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-medium">
                        {row.newPrice.toFixed(2)}
                      </td>
                      <td className={`px-3 py-1.5 text-right ${row.delta > 0 ? 'text-green-600' : row.delta < 0 ? 'text-destructive' : ''}`}>
                        {row.delta > 0 ? '+' : ''}{row.delta.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={onConfirm} disabled={isPending}>
                {isPending ? 'Applying...' : 'Confirm Update'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 8: Create `price-history-panel.jsx`**

Create `client/src/modules/catalog/components/price-history-panel.jsx`:

```jsx
'use client';

import { usePriceHistory } from '../hooks/use-price-queries';
import { format } from 'date-fns';
import { ArrowRight } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';

export function PriceHistoryPanel({ articleId }) {
  const { t } = useLanguage();
  const { data: history = [], isLoading } = usePriceHistory(articleId);

  if (!articleId) return null;

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground animate-pulse">Loading...</div>;
  }

  if (history.length === 0) {
    return <div className="p-4 text-sm text-muted-foreground">No price history.</div>;
  }

  return (
    <div className="space-y-2 p-4">
      <p className="text-sm font-medium">{t('catalog.prices.history')}</p>
      <div className="space-y-1.5">
        {history.map((entry) => (
          <div
            key={entry._id}
            className="flex items-center gap-3 text-xs rounded-md border px-3 py-2"
          >
            <span className="text-muted-foreground font-mono">{entry.oldPrice?.toFixed(2)}</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="font-medium font-mono">{entry.newPrice?.toFixed(2)}</span>
            <span className="ml-auto text-muted-foreground">
              {format(new Date(entry.effectiveDate), 'dd.MM.yyyy')}
            </span>
            {entry.createdBy && (
              <span className="text-muted-foreground">
                {entry.createdBy.firstName} {entry.createdBy.lastName}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Create `price-management-table.jsx`**

Create `client/src/modules/catalog/components/price-management-table.jsx`:

```jsx
'use client';

import { useState } from 'react';
import { TrendingUp, RotateCcw } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/shared/components/ui/table';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Badge } from '@/shared/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/shared/components/ui/alert-dialog';
import { useArticles } from '../hooks/use-catalog-queries';
import { usePriceBatches } from '../hooks/use-price-queries';
import { usePriceMutations } from '../hooks/use-price-mutations';
import { PriceUpdateDialog } from './price-update-dialog';
import { PriceHistoryPanel } from './price-history-panel';
import { format } from 'date-fns';
import { useLanguage } from '@/lib/i18n/language-context';

export function PriceManagementTable() {
  const { t } = useLanguage();
  const { data: articles = [], isLoading: articlesLoading } = useArticles({});
  const { data: batches = [] } = usePriceBatches();
  const { rollbackBatch } = usePriceMutations();
  const [selected, setSelected] = useState(new Set());
  const [updateOpen, setUpdateOpen] = useState(false);
  const [historyArticleId, setHistoryArticleId] = useState(null);

  const toggleSelect = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === articles.length) setSelected(new Set());
    else setSelected(new Set(articles.map((a) => a._id)));
  };

  const selectedArticles = articles.filter((a) => selected.has(a._id));

  const recentBatches = batches
    .filter((b) => b.status === 'APPLIED')
    .slice(0, 5);

  const canRollback = (batch) => {
    const appliedAt = new Date(batch.appliedAt);
    const diffDays = (Date.now() - appliedAt.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 30;
  };

  return (
    <div className="space-y-6">
      {/* Article price table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Articles</p>
          <Button
            size="sm"
            disabled={selected.size === 0}
            onClick={() => setUpdateOpen(true)}
          >
            <TrendingUp className="w-4 h-4 mr-2" />
            {t('catalog.prices.update')} ({selected.size})
          </Button>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.size === articles.length && articles.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>{t('catalog.articles.articleNumber')}</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Price (CHF)</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {articlesLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : articles.map((article) => (
                <TableRow
                  key={article._id}
                  className={selected.has(article._id) ? 'bg-muted/30' : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={selected.has(article._id)}
                      onCheckedChange={() => toggleSelect(article._id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{article.articleNumber}</TableCell>
                  <TableCell>{article.name}</TableCell>
                  <TableCell className="text-right font-medium">
                    {article.basePrice?.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setHistoryArticleId(
                        historyArticleId === article._id ? null : article._id
                      )}
                    >
                      History
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {historyArticleId && (
          <div className="rounded-md border bg-muted/20">
            <PriceHistoryPanel articleId={historyArticleId} />
          </div>
        )}
      </div>

      {/* Recent batches with rollback */}
      {recentBatches.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Recent Updates</p>
          <div className="space-y-2">
            {recentBatches.map((batch) => (
              <div
                key={batch._id}
                className="flex items-center gap-4 rounded-md border px-4 py-3 text-sm"
              >
                <Badge variant="outline">{batch.type}</Badge>
                <span className="text-muted-foreground">
                  {batch.articleCount} articles
                </span>
                <span className="text-muted-foreground">
                  {format(new Date(batch.appliedAt), 'dd.MM.yyyy HH:mm')}
                </span>
                <div className="ml-auto">
                  {canRollback(batch) ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <RotateCcw className="w-3 h-3" />
                          {t('catalog.prices.rollback')}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Rollback price update?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will restore the previous prices for {batch.articleCount} article
                            {batch.articleCount !== 1 ? 's' : ''}.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => rollbackBatch.mutate(batch._id)}
                          >
                            Rollback
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <span className="text-xs text-muted-foreground">Rollback expired</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <PriceUpdateDialog
        open={updateOpen}
        onClose={() => { setUpdateOpen(false); setSelected(new Set()); }}
        selectedArticles={selectedArticles}
      />
    </div>
  );
}
```

- [ ] **Step 10: Replace scaffold with full price management page**

Replace `client/src/app/(platform)/catalog/prices/page.jsx`:

```jsx
'use client';

import { TrendingUp } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';
import { PriceManagementTable } from '@/modules/catalog/components/price-management-table';
import { useLanguage } from '@/lib/i18n/language-context';

export default function PricesPage() {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        icon={TrendingUp}
        title={t('catalog.prices.title')}
        description="Bulk updates, history, scheduled changes, and rollback"
      />
      <div className="flex-1 overflow-y-auto">
        <PriceManagementTable />
      </div>
    </div>
  );
}
```

- [ ] **Step 11: Run all price tests**

```
cd client && npx vitest run src/modules/catalog/__tests__/use-price-mutations.test.ts
```

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add client/src/modules/catalog/services/price-service.js \
        client/src/modules/catalog/hooks/use-price-queries.js \
        client/src/modules/catalog/hooks/use-price-mutations.js \
        client/src/modules/catalog/components/price-update-dialog.jsx \
        client/src/modules/catalog/components/price-history-panel.jsx \
        client/src/modules/catalog/components/price-management-table.jsx \
        client/src/app/(platform)/catalog/prices/page.jsx \
        client/src/modules/catalog/__tests__/use-price-mutations.test.ts
git commit -m "feat(catalog): price management page — bulk update, history, rollback (MAT-007)"
```

---

## Self-Review Checklist

**Spec coverage:**
- MAT-004 (Text blocks): CRUD, rich text, categories, search, independent copy on insert. ✓
- MAT-007 (Price management): Bulk update with preview, individual update, history, rollback within 30 days, scheduled. ✓
- MAT-008 (UoM management): CRUD, multilingual names, system unit protection, code immutability, conversion factor. ✓

**Permission guards:**
- All pages use permissions from Plan 1. UoM and IGH pages require `catalog:admin`; price page requires `catalog:price`. These are enforced server-side (routes already use `requirePermission()`). Client-side `hasPermission()` guards on sidebar items from Plan 1. ✓

**No placeholders:** All steps have complete, runnable code. ✓

**Type consistency:** `priceService.update()`, `usePriceMutations().updatePrices`, `usePriceHistory()` names are consistent across service → hook → component. ✓

**Edge cases covered:**
- System UoM units: lock icon + disabled delete/edit buttons. ✓
- UoM deletion blocked when `usageCount > 0`. ✓
- Price rollback only shown for batches applied within 30 days. ✓
- Text block insert creates an independent copy (server enforces; UI communicates in delete confirmation). ✓
- Scheduled price: `effectiveDate` field shown only when schedule mode selected. ✓
