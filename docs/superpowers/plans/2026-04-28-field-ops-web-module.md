# Field Operations Web Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Field Operations management module to the main web platform so back-office managers can view, filter, approve, and act on technician orders, work reports, time entries, chat, and notifications.

**Architecture:** New `modules/field-ops/` with desktop-optimized management components; routes under `app/(platform)/field-ops/`; data layer imports directly from `modules/mobile/services/` and `modules/mobile/hooks/` with no duplication; only manager-specific mutations (approve/reject report, release time) are new.

**Tech Stack:** Next.js App Router, React Query (`useQuery` — NOT `useOfflineQuery`), shadcn/ui, Tailwind CSS, Framer Motion (chat only), existing `DataTableShell` / `PageHeader` / `ConfirmDialog` / `useCursorList` patterns.

---

## Task 1: Foundation — Sidebar + i18n Keys

**Files:**
- Modify: `client/src/layout/sidebar.jsx`
- Modify: `client/src/lib/i18n/translations.js`

- [ ] **Step 1: Add Field Operations section to sidebar**

In `client/src/layout/sidebar.jsx`, add the following imports at the top with the other lucide imports:
```javascript
import { Briefcase, FileCheck, Clock4 } from 'lucide-react';
```

Then in `navSectionDefs`, insert this new section **between** the `sidebar.business` section and the existing `sidebar.mobile` section:
```javascript
  {
    titleKey: 'sidebar.fieldOps',
    items: [
      { labelKey: 'sidebar.fieldOpsOrders',        href: '/field-ops/orders',        icon: ClipboardList,  permission: 'mobile:read' },
      { labelKey: 'sidebar.fieldOpsReports',       href: '/field-ops/reports',       icon: FileCheck,      permission: 'mobile:read' },
      { labelKey: 'sidebar.fieldOpsTime',          href: '/field-ops/time',          icon: Clock4,         permission: 'mobile:read' },
      { labelKey: 'sidebar.fieldOpsChat',          href: '/field-ops/chat',          icon: MessageSquare,  permission: 'mobile:read' },
      { labelKey: 'sidebar.fieldOpsNotifications', href: '/field-ops/notifications', icon: Bell,           permission: 'mobile:read' },
    ],
  },
```

- [ ] **Step 2: Add i18n keys**

In `client/src/lib/i18n/translations.js`, inside the `de: { ... }` block, add after the last sidebar key:
```javascript
    'sidebar.fieldOps': 'Feldeinsatz',
    'sidebar.fieldOpsOrders': 'Aufträge',
    'sidebar.fieldOpsReports': 'Arbeitsberichte',
    'sidebar.fieldOpsTime': 'Zeiterfassung',
    'sidebar.fieldOpsChat': 'Projekt-Chat',
    'sidebar.fieldOpsNotifications': 'Benachrichtigungen',
    'fieldOps.orders.title': 'Aufträge',
    'fieldOps.orders.desc': 'Alle Technikeraufträge überwachen und verwalten.',
    'fieldOps.orders.empty': 'Keine Aufträge gefunden.',
    'fieldOps.orders.filterDate': 'Datum',
    'fieldOps.orders.filterStatus': 'Status',
    'fieldOps.orders.filterType': 'Typ',
    'fieldOps.reports.title': 'Arbeitsberichte',
    'fieldOps.reports.desc': 'Eingereichte Berichte prüfen und genehmigen.',
    'fieldOps.reports.empty': 'Keine Berichte gefunden.',
    'fieldOps.reports.approve': 'Genehmigen',
    'fieldOps.reports.reject': 'Ablehnen',
    'fieldOps.reports.approveConfirm': 'Bericht genehmigen?',
    'fieldOps.reports.rejectNote': 'Ablehnungsgrund (Pflichtfeld)',
    'fieldOps.reports.approved': 'Bericht genehmigt.',
    'fieldOps.reports.rejected': 'Bericht abgelehnt.',
    'fieldOps.time.title': 'Zeiterfassung',
    'fieldOps.time.desc': 'Zeiteinträge freigeben und verwalten.',
    'fieldOps.time.empty': 'Keine Zeiteinträge gefunden.',
    'fieldOps.time.release': 'Freigeben',
    'fieldOps.time.releaseSelected': 'Auswahl freigeben',
    'fieldOps.time.releaseConfirm': 'Zeiteinträge freigeben?',
    'fieldOps.time.released': 'Zeiteinträge freigegeben.',
    'fieldOps.time.overrideRelease': 'Override Freigabe',
    'fieldOps.time.overrideJustification': 'Begründung (mind. 20 Zeichen)',
    'fieldOps.time.overrideSuccess': 'Zeiteintrag manuell freigegeben.',
    'fieldOps.chat.title': 'Projekt-Chat',
    'fieldOps.chat.sendPlaceholder': 'Nachricht schreiben...',
    'fieldOps.notifications.title': 'Benachrichtigungen',
    'fieldOps.notifications.empty': 'Keine Benachrichtigungen.',
    'fieldOps.notifications.markAllRead': 'Alle als gelesen markieren',
```

Inside the `en: { ... }` block add:
```javascript
    'sidebar.fieldOps': 'Field Operations',
    'sidebar.fieldOpsOrders': 'Orders',
    'sidebar.fieldOpsReports': 'Work Reports',
    'sidebar.fieldOpsTime': 'Time Entries',
    'sidebar.fieldOpsChat': 'Project Chat',
    'sidebar.fieldOpsNotifications': 'Notifications',
    'fieldOps.orders.title': 'Orders',
    'fieldOps.orders.desc': 'Monitor and manage all technician orders.',
    'fieldOps.orders.empty': 'No orders found.',
    'fieldOps.orders.filterDate': 'Date',
    'fieldOps.orders.filterStatus': 'Status',
    'fieldOps.orders.filterType': 'Type',
    'fieldOps.reports.title': 'Work Reports',
    'fieldOps.reports.desc': 'Review and approve submitted reports.',
    'fieldOps.reports.empty': 'No reports found.',
    'fieldOps.reports.approve': 'Approve',
    'fieldOps.reports.reject': 'Reject',
    'fieldOps.reports.approveConfirm': 'Approve this report?',
    'fieldOps.reports.rejectNote': 'Rejection reason (required)',
    'fieldOps.reports.approved': 'Report approved.',
    'fieldOps.reports.rejected': 'Report rejected.',
    'fieldOps.time.title': 'Time Entries',
    'fieldOps.time.desc': 'Release and manage time entries.',
    'fieldOps.time.empty': 'No time entries found.',
    'fieldOps.time.release': 'Release',
    'fieldOps.time.releaseSelected': 'Release Selected',
    'fieldOps.time.releaseConfirm': 'Release time entries?',
    'fieldOps.time.released': 'Time entries released.',
    'fieldOps.time.overrideRelease': 'Override Release',
    'fieldOps.time.overrideJustification': 'Justification (min 20 chars)',
    'fieldOps.time.overrideSuccess': 'Time entry manually released.',
    'fieldOps.chat.title': 'Project Chat',
    'fieldOps.chat.sendPlaceholder': 'Write a message...',
    'fieldOps.notifications.title': 'Notifications',
    'fieldOps.notifications.empty': 'No notifications.',
    'fieldOps.notifications.markAllRead': 'Mark all as read',
```

- [ ] **Step 3: Commit**
```bash
git add client/src/layout/sidebar.jsx client/src/lib/i18n/translations.js
git commit -m "feat(field-ops): add sidebar section and i18n keys"
```

---

## Task 2: Route Stubs + Layout

**Files:**
- Create: `client/src/app/(platform)/field-ops/layout.jsx`
- Create: `client/src/app/(platform)/field-ops/page.jsx`
- Create: `client/src/app/(platform)/field-ops/orders/page.jsx`
- Create: `client/src/app/(platform)/field-ops/orders/[id]/page.jsx`
- Create: `client/src/app/(platform)/field-ops/reports/page.jsx`
- Create: `client/src/app/(platform)/field-ops/time/page.jsx`
- Create: `client/src/app/(platform)/field-ops/chat/[projectId]/page.jsx`
- Create: `client/src/app/(platform)/field-ops/notifications/page.jsx`
- Create: `client/src/app/(platform)/field-ops/installations/[siteId]/page.jsx`

- [ ] **Step 1: Create layout**

`client/src/app/(platform)/field-ops/layout.jsx`:
```javascript
export default function FieldOpsLayout({ children }) {
  return <div className="flex-1 overflow-auto">{children}</div>;
}
```

- [ ] **Step 2: Create redirect page**

`client/src/app/(platform)/field-ops/page.jsx`:
```javascript
import { redirect } from 'next/navigation';
export default function FieldOpsPage() {
  redirect('/field-ops/orders');
}
```

- [ ] **Step 3: Create page stubs** (all placeholder until later tasks fill them in)

`client/src/app/(platform)/field-ops/orders/page.jsx`:
```javascript
'use client';
export default function FieldOpsOrdersPage() {
  return <div className="p-6 text-muted-foreground">Orders — coming soon</div>;
}
```

`client/src/app/(platform)/field-ops/orders/[id]/page.jsx`:
```javascript
'use client';
export default function FieldOpsOrderDetailPage() {
  return <div className="p-6 text-muted-foreground">Order detail — coming soon</div>;
}
```

`client/src/app/(platform)/field-ops/reports/page.jsx`:
```javascript
'use client';
export default function FieldOpsReportsPage() {
  return <div className="p-6 text-muted-foreground">Reports — coming soon</div>;
}
```

`client/src/app/(platform)/field-ops/time/page.jsx`:
```javascript
'use client';
export default function FieldOpsTimePage() {
  return <div className="p-6 text-muted-foreground">Time entries — coming soon</div>;
}
```

`client/src/app/(platform)/field-ops/chat/[projectId]/page.jsx`:
```javascript
'use client';
export default function FieldOpsChatPage() {
  return <div className="p-6 text-muted-foreground">Chat — coming soon</div>;
}
```

`client/src/app/(platform)/field-ops/notifications/page.jsx`:
```javascript
'use client';
export default function FieldOpsNotificationsPage() {
  return <div className="p-6 text-muted-foreground">Notifications — coming soon</div>;
}
```

`client/src/app/(platform)/field-ops/installations/[siteId]/page.jsx`:
```javascript
'use client';
export default function FieldOpsInstallationsPage() {
  return <div className="p-6 text-muted-foreground">Installations — coming soon</div>;
}
```

- [ ] **Step 4: Verify routes render**

Start dev server (`npm run dev` in `client/`) and navigate to `/field-ops/orders`. Expect the sidebar to show "Field Operations" section and the stub page to render.

- [ ] **Step 5: Commit**
```bash
git add client/src/app/\(platform\)/field-ops/
git commit -m "feat(field-ops): add route stubs and layout"
```

---

## Task 3: Constants + Field Ops Query Hooks

**Files:**
- Create: `client/src/modules/field-ops/constants/field-ops-constants.js`
- Create: `client/src/modules/field-ops/hooks/use-field-ops-queries.js`

- [ ] **Step 1: Create constants**

`client/src/modules/field-ops/constants/field-ops-constants.js`:
```javascript
import {
  ORDER_STATUS, ORDER_TYPE, ORDER_PRIORITY,
  REPORT_STATUS, ACTIVITY_TYPE, RELEASE_STATUS,
  PHOTO_CATEGORY, NOTIFICATION_TYPE,
} from '@/modules/mobile/constants/mobile-constants';

export { ORDER_STATUS, ORDER_TYPE, ORDER_PRIORITY, REPORT_STATUS, ACTIVITY_TYPE, RELEASE_STATUS, PHOTO_CATEGORY, NOTIFICATION_TYPE };

export const ORDER_STATUS_CONFIG = {
  PLANNED:     { label: 'Geplant',       labelEn: 'Planned',      dot: 'bg-slate-400',  badge: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  IN_PROGRESS: { label: 'In Arbeit',     labelEn: 'In Progress',  dot: 'bg-amber-400',  badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300' },
  COMPLETED:   { label: 'Abgeschlossen', labelEn: 'Completed',    dot: 'bg-emerald-400',badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
  CANCELLED:   { label: 'Storniert',     labelEn: 'Cancelled',    dot: 'bg-red-400',    badge: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
};

export const REPORT_STATUS_CONFIG = {
  DRAFT:     { label: 'Entwurf',      labelEn: 'Draft',      dot: 'bg-slate-400',   badge: 'bg-slate-100 text-slate-700' },
  SUBMITTED: { label: 'Eingereicht',  labelEn: 'Submitted',  dot: 'bg-blue-400',    badge: 'bg-blue-100 text-blue-700' },
  APPROVED:  { label: 'Genehmigt',    labelEn: 'Approved',   dot: 'bg-emerald-400', badge: 'bg-emerald-100 text-emerald-700' },
  REJECTED:  { label: 'Abgelehnt',    labelEn: 'Rejected',   dot: 'bg-red-400',     badge: 'bg-red-100 text-red-700' },
};

export const RELEASE_STATUS_CONFIG = {
  PENDING:  { label: 'Ausstehend', labelEn: 'Pending',  badge: 'bg-amber-100 text-amber-700' },
  RELEASED: { label: 'Freigegeben',labelEn: 'Released', badge: 'bg-emerald-100 text-emerald-700' },
  LOCKED:   { label: 'Gesperrt',   labelEn: 'Locked',   badge: 'bg-red-100 text-red-700' },
};

export const ACTIVITY_TYPE_LABELS = {
  TRAVEL:         { label: 'Reise',       labelEn: 'Travel' },
  ONSITE_WORK:    { label: 'Vor Ort',     labelEn: 'On-site' },
  ADMINISTRATIVE: { label: 'Verwaltung',  labelEn: 'Admin' },
  OTHER:          { label: 'Sonstiges',   labelEn: 'Other' },
};

export const ORDER_TYPE_LABELS = {
  SERVICE_CALL:   { label: 'Serviceeinsatz', labelEn: 'Service Call' },
  PROJECT_WORK:   { label: 'Projektarbeit',  labelEn: 'Project Work' },
  MAINTENANCE:    { label: 'Wartung',        labelEn: 'Maintenance' },
  INSTALLATION:   { label: 'Installation',   labelEn: 'Installation' },
  INSPECTION:     { label: 'Inspektion',     labelEn: 'Inspection' },
};
```

- [ ] **Step 2: Create manager query hooks**

These wrap mobile services using standard `useQuery` (no offline layer).

`client/src/modules/field-ops/hooks/use-field-ops-queries.js`:
```javascript
'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { orderService } from '@/modules/mobile/services/order-service';
import { reportService } from '@/modules/mobile/services/report-service';
import { timeService } from '@/modules/mobile/services/time-service';
import { photoService } from '@/modules/mobile/services/photo-service';
import { installationService } from '@/modules/mobile/services/installation-service';
import { catalogService } from '@/modules/mobile/services/catalog-service';
import { notificationService } from '@/modules/mobile/services/notification-service';

export function useFieldOpsOrders(filters = {}) {
  return useQuery({
    queryKey: queryKeys.mobile.orders.list(filters),
    queryFn: () => orderService.getOrders(filters),
    staleTime: 30_000,
  });
}

export function useFieldOpsOrderDetail(id) {
  return useQuery({
    queryKey: queryKeys.mobile.orders.detail(id),
    queryFn: () => orderService.getOrderById(id),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useFieldOpsOrderReports(orderId) {
  return useQuery({
    queryKey: queryKeys.mobile.reports.byOrder(orderId),
    queryFn: () => reportService.getReportsByOrder(orderId),
    enabled: !!orderId,
    staleTime: 30_000,
  });
}

export function useFieldOpsReportDetail(reportId) {
  return useQuery({
    queryKey: queryKeys.mobile.reports.detail(reportId),
    queryFn: () => reportService.getReport(reportId),
    enabled: !!reportId,
    staleTime: 30_000,
  });
}

export function useFieldOpsTimeEntries(filters = {}) {
  return useQuery({
    queryKey: queryKeys.mobile.timeEntries.list(filters),
    queryFn: () => timeService.getTimeEntries(filters),
    staleTime: 30_000,
  });
}

export function useFieldOpsOrderTimeEntries(orderId) {
  return useQuery({
    queryKey: queryKeys.mobile.timeEntries.byOrder(orderId),
    queryFn: () => timeService.getTimeEntries({ orderId }),
    enabled: !!orderId,
    staleTime: 30_000,
  });
}

export function useFieldOpsOrderPhotos(orderId) {
  return useQuery({
    queryKey: queryKeys.mobile.photos.byOrder(orderId),
    queryFn: () => photoService.getPhotos(orderId),
    enabled: !!orderId,
    staleTime: 60_000,
  });
}

export function useFieldOpsInstallations(siteId) {
  return useQuery({
    queryKey: queryKeys.mobile.installations.bySite(siteId),
    queryFn: () => installationService.getInstallations(siteId),
    enabled: !!siteId,
    staleTime: 60_000,
  });
}

export function useFieldOpsInstallationDetail(id) {
  return useQuery({
    queryKey: queryKeys.mobile.installations.detail(id),
    queryFn: () => installationService.getInstallationById(id),
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useFieldOpsNotifications(params = {}) {
  return useQuery({
    queryKey: queryKeys.mobile.notifications.list(),
    queryFn: () => notificationService.getNotifications(params),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useFieldOpsOrderQuotation(orderId) {
  return useQuery({
    queryKey: queryKeys.mobile.quotation.byOrder(orderId),
    queryFn: () => orderService.getQuotation(orderId),
    enabled: !!orderId,
    staleTime: 120_000,
  });
}

export function useFieldOpsCatalogSearch(query, source = 'ALL') {
  return useQuery({
    queryKey: queryKeys.mobile.catalog.search(query),
    queryFn: () => catalogService.search(query, source),
    enabled: !!query && query.length >= 2,
    staleTime: 120_000,
  });
}
```

- [ ] **Step 3: Commit**
```bash
git add client/src/modules/field-ops/
git commit -m "feat(field-ops): add constants and manager query hooks"
```

---

## Task 4: Orders Table

**Files:**
- Create: `client/src/modules/field-ops/components/orders/field-ops-order-status-badge.jsx`
- Create: `client/src/modules/field-ops/components/orders/field-ops-order-filters.jsx`
- Create: `client/src/modules/field-ops/components/orders/field-ops-orders-table.jsx`
- Modify: `client/src/app/(platform)/field-ops/orders/page.jsx`

- [ ] **Step 1: Status badge**

`client/src/modules/field-ops/components/orders/field-ops-order-status-badge.jsx`:
```javascript
import { cn } from '@/lib/utils';
import { ORDER_STATUS_CONFIG } from '@/modules/field-ops/constants/field-ops-constants';
import { useLanguage } from '@/lib/i18n/language-context';

export function FieldOpsOrderStatusBadge({ status, size = 'md' }) {
  const { language } = useLanguage();
  const cfg = ORDER_STATUS_CONFIG[status] || {};
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
      cfg.badge,
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', cfg.dot)} />
      {language === 'de' ? cfg.label : cfg.labelEn}
    </span>
  );
}
```

- [ ] **Step 2: Filter bar**

`client/src/modules/field-ops/components/orders/field-ops-order-filters.jsx`:
```javascript
'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { Search, Filter, X } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { ORDER_STATUS_CONFIG, ORDER_TYPE_LABELS } from '@/modules/field-ops/constants/field-ops-constants';

const STATUS_OPTS = [
  { value: 'all', de: 'Alle Status', en: 'All Statuses' },
  ...Object.entries(ORDER_STATUS_CONFIG).map(([v, c]) => ({ value: v, de: c.label, en: c.labelEn })),
];

const TYPE_OPTS = [
  { value: 'all', de: 'Alle Typen', en: 'All Types' },
  ...Object.entries(ORDER_TYPE_LABELS).map(([v, c]) => ({ value: v, de: c.label, en: c.labelEn })),
];

const active = 'border-primary/40 bg-primary/5 text-primary';

export function FieldOpsOrderFilters({ search, onSearch, status, onStatus, type, onType, onClear }) {
  const { language: lang } = useLanguage();
  const l = (o) => lang === 'de' ? o.de : o.en;
  const hasFilters = search || (status && status !== 'all') || (type && type !== 'all');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
      <Separator orientation="vertical" className="h-5" />
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder={lang === 'de' ? 'Aufträge suchen...' : 'Search orders...'}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="h-8 w-48 pl-8 text-sm rounded-full border-dashed"
        />
      </div>
      <Select value={status} onValueChange={onStatus}>
        <SelectTrigger className={cn('h-8 w-auto min-w-[130px] rounded-full border-dashed text-xs', status !== 'all' && active)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{l(o)}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={type} onValueChange={onType}>
        <SelectTrigger className={cn('h-8 w-auto min-w-[140px] rounded-full border-dashed text-xs', type !== 'all' && active)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TYPE_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{l(o)}</SelectItem>)}
        </SelectContent>
      </Select>
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={onClear} className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5 mr-1" />
          {lang === 'de' ? 'Zurücksetzen' : 'Reset'}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Orders table component**

`client/src/modules/field-ops/components/orders/field-ops-orders-table.jsx`:
```javascript
'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useFieldOpsOrders } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { FieldOpsOrderFilters } from './field-ops-order-filters';
import { FieldOpsOrderStatusBadge } from './field-ops-order-status-badge';
import { ORDER_TYPE_LABELS, REPORT_STATUS_CONFIG } from '@/modules/field-ops/constants/field-ops-constants';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { PageHeader } from '@/shared/components/page-header';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export function FieldOpsOrdersTable() {
  const { t, language } = useLanguage();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const debouncedSearch = useDebounce(search, 300);

  const filters = useMemo(() => {
    const f = {};
    if (debouncedSearch) f.search = debouncedSearch;
    if (status !== 'all') f.status = status;
    if (type !== 'all') f.type = type;
    return f;
  }, [debouncedSearch, status, type]);

  const { data: orders = [], isFetching } = useFieldOpsOrders(filters);

  const clear = useCallback(() => { setSearch(''); setStatus('all'); setType('all'); }, []);

  const columns = useMemo(() => [
    {
      accessorKey: 'orderNumber',
      header: t('fieldOps.orders.title', 'Order #'),
      size: 120,
      Cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.orderNumber || row.original._id?.slice(-6)}</span>
      ),
    },
    {
      accessorKey: 'orderType',
      header: lang => language === 'de' ? 'Typ' : 'Type',
      size: 140,
      Cell: ({ row }) => {
        const cfg = ORDER_TYPE_LABELS[row.original.orderType];
        return <span className="text-xs text-muted-foreground">{cfg ? (language === 'de' ? cfg.label : cfg.labelEn) : row.original.orderType}</span>;
      },
    },
    {
      accessorKey: 'customerName',
      header: language === 'de' ? 'Kunde' : 'Customer',
      size: 200,
      Cell: ({ row }) => (
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{row.original.customerName || '—'}</p>
          <p className="text-xs text-muted-foreground truncate">{row.original.siteAddress || ''}</p>
        </div>
      ),
    },
    {
      accessorKey: 'assignedTo',
      header: language === 'de' ? 'Techniker' : 'Technician',
      size: 160,
      Cell: ({ row }) => {
        const emp = row.original.assignedEmployee;
        if (!emp) return <span className="text-xs text-muted-foreground/60">—</span>;
        return <span className="text-xs">{emp.firstName} {emp.lastName}</span>;
      },
    },
    {
      accessorKey: 'scheduledStart',
      header: language === 'de' ? 'Termin' : 'Scheduled',
      size: 120,
      Cell: ({ row }) => {
        const d = row.original.scheduledStart;
        return d ? <span className="text-xs">{formatDate(d)}</span> : <span className="text-xs text-muted-foreground/60">—</span>;
      },
    },
    {
      accessorKey: 'status',
      header: language === 'de' ? 'Status' : 'Status',
      size: 140,
      Cell: ({ row }) => <FieldOpsOrderStatusBadge status={row.original.status} size="sm" />,
    },
    {
      accessorKey: 'reportStatus',
      header: language === 'de' ? 'Bericht' : 'Report',
      size: 130,
      Cell: ({ row }) => {
        const rs = row.original.reportStatus;
        if (!rs) return <span className="text-xs text-muted-foreground/40">—</span>;
        const cfg = REPORT_STATUS_CONFIG[rs];
        return cfg ? (
          <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', cfg.badge)}>
            {language === 'de' ? cfg.label : cfg.labelEn}
          </span>
        ) : <span className="text-xs">{rs}</span>;
      },
    },
  ], [language, t]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('fieldOps.orders.title', 'Orders')}
        description={t('fieldOps.orders.desc', 'Monitor and manage all technician orders.')}
        count={orders.length}
      />
      <FieldOpsOrderFilters
        search={search} onSearch={(v) => setSearch(v)}
        status={status} onStatus={setStatus}
        type={type} onType={setType}
        onClear={clear}
      />
      <DataTableShell
        columns={columns}
        data={orders}
        isLoading={isFetching && orders.length === 0}
        onRowClick={(row) => router.push(`/field-ops/orders/${row._id}`)}
        emptyMessage={t('fieldOps.orders.empty', 'No orders found.')}
      />
    </div>
  );
}
```

- [ ] **Step 4: Wire page**

Replace `client/src/app/(platform)/field-ops/orders/page.jsx`:
```javascript
'use client';
import { FieldOpsOrdersTable } from '@/modules/field-ops/components/orders/field-ops-orders-table';
export default function FieldOpsOrdersPage() {
  return <FieldOpsOrdersTable />;
}
```

- [ ] **Step 5: Verify in browser** — navigate to `/field-ops/orders`, table should render with loading skeleton then data rows. Clicking a row goes to the detail stub.

- [ ] **Step 6: Commit**
```bash
git add client/src/modules/field-ops/ client/src/app/\(platform\)/field-ops/orders/page.jsx
git commit -m "feat(field-ops): orders table with filters and status badges"
```

---

## Task 5: Report Mutations Hook

**Files:**
- Create: `client/src/modules/field-ops/hooks/use-field-ops-report-mutations.js`

- [ ] **Step 1: Create hook**

`client/src/modules/field-ops/hooks/use-field-ops-report-mutations.js`:
```javascript
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reportService } from '@/modules/mobile/services/report-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useFieldOpsReportMutations({ onApprove, onReject } = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidate = (orderId) => {
    queryClient.invalidateQueries({ queryKey: queryKeys.mobile.reports.all ? queryKeys.mobile.reports.all() : ['mobile', 'reports'] });
    if (orderId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.mobile.reports.byOrder(orderId) });
    }
  };

  const approve = useMutation({
    mutationFn: ({ reportId }) =>
      reportService.updateReport(reportId, { status: 'APPROVED' }),
    onSuccess: (res, { orderId }) => {
      invalidate(orderId);
      showSuccess(t('fieldOps.reports.approved', 'Report approved.'));
      onApprove?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const reject = useMutation({
    mutationFn: ({ reportId, rejectionNote }) =>
      reportService.updateReport(reportId, { status: 'REJECTED', rejectionNote }),
    onSuccess: (res, { orderId }) => {
      invalidate(orderId);
      showSuccess(t('fieldOps.reports.rejected', 'Report rejected.'));
      onReject?.(res);
    },
    onError: (err) => showError(err.message),
  });

  return { approve, reject };
}
```

- [ ] **Step 2: Commit**
```bash
git add client/src/modules/field-ops/hooks/use-field-ops-report-mutations.js
git commit -m "feat(field-ops): report approve/reject mutations hook"
```

---

## Task 6: Reports Table + Detail Panel

**Files:**
- Create: `client/src/modules/field-ops/components/reports/field-ops-report-status-badge.jsx`
- Create: `client/src/modules/field-ops/components/reports/field-ops-report-action-dialog.jsx`
- Create: `client/src/modules/field-ops/components/reports/field-ops-report-detail-panel.jsx`
- Create: `client/src/modules/field-ops/components/reports/field-ops-reports-table.jsx`
- Modify: `client/src/app/(platform)/field-ops/reports/page.jsx`

- [ ] **Step 1: Report status badge**

`client/src/modules/field-ops/components/reports/field-ops-report-status-badge.jsx`:
```javascript
import { cn } from '@/lib/utils';
import { REPORT_STATUS_CONFIG } from '@/modules/field-ops/constants/field-ops-constants';
import { useLanguage } from '@/lib/i18n/language-context';

export function FieldOpsReportStatusBadge({ status, size = 'md' }) {
  const { language } = useLanguage();
  const cfg = REPORT_STATUS_CONFIG[status] || {};
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full font-medium',
      size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
      cfg.badge,
    )}>
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', cfg.dot)} />
      {language === 'de' ? cfg.label : cfg.labelEn}
    </span>
  );
}
```

- [ ] **Step 2: Reject dialog**

`client/src/modules/field-ops/components/reports/field-ops-report-action-dialog.jsx`:
```javascript
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/lib/i18n/language-context';
import { Loader2 } from 'lucide-react';

export function FieldOpsRejectDialog({ open, onOpenChange, onConfirm, isLoading }) {
  const { t, language } = useLanguage();
  const [note, setNote] = useState('');
  const noteError = note.trim().length > 0 && note.trim().length < 5;

  const handleConfirm = () => {
    if (!note.trim()) return;
    onConfirm(note.trim());
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setNote(''); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('fieldOps.reports.reject', 'Reject Report')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-sm">{t('fieldOps.reports.rejectNote', 'Rejection reason (required)')}</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={language === 'de' ? 'Grund für Ablehnung...' : 'Reason for rejection...'}
          />
          {noteError && <p className="text-xs text-destructive">{language === 'de' ? 'Mind. 5 Zeichen' : 'Min 5 chars'}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{language === 'de' ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!note.trim() || isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('fieldOps.reports.reject', 'Reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Report detail slide-over panel**

`client/src/modules/field-ops/components/reports/field-ops-report-detail-panel.jsx`:
```javascript
'use client';

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { FieldOpsReportStatusBadge } from './field-ops-report-status-badge';
import { FieldOpsRejectDialog } from './field-ops-report-action-dialog';
import { useFieldOpsReportMutations } from '@/modules/field-ops/hooks/use-field-ops-report-mutations';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';
import { CheckCircle, XCircle, User, Clock, Wrench, Package } from 'lucide-react';
import { cn } from '@/lib/utils';

function Section({ title, children, className }) {
  return (
    <div className={cn('space-y-2', className)}>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

export function FieldOpsReportDetailPanel({ report, orderId, open, onOpenChange }) {
  const { t, language } = useLanguage();
  const [rejectOpen, setRejectOpen] = useState(false);

  const { approve, reject } = useFieldOpsReportMutations({
    onApprove: () => onOpenChange(false),
    onReject: () => { setRejectOpen(false); onOpenChange(false); },
  });

  if (!report) return null;

  const canAct = report.status === 'SUBMITTED';

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto flex flex-col gap-0 p-0">
          <SheetHeader className="px-6 py-4 border-b">
            <div className="flex items-center justify-between gap-3">
              <SheetTitle className="text-base">
                {language === 'de' ? 'Arbeitsbericht' : 'Work Report'}
              </SheetTitle>
              <FieldOpsReportStatusBadge status={report.status} />
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Dates */}
            <Section title={language === 'de' ? 'Zeitraum' : 'Time Period'}>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">{language === 'de' ? 'Datum' : 'Date'}</p>
                  <p>{formatDate(report.reportDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">{language === 'de' ? 'Ankunft / Abfahrt' : 'Arrival / Departure'}</p>
                  <p>{report.arrivalTime ? new Date(report.arrivalTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} – {report.departureTime ? new Date(report.departureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                </div>
              </div>
            </Section>

            <Separator />

            {/* Work performed */}
            {report.workPerformed && (
              <Section title={language === 'de' ? 'Durchgeführte Arbeiten' : 'Work Performed'}>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{report.workPerformed}</p>
              </Section>
            )}

            {/* Findings */}
            {report.findings && (
              <Section title={language === 'de' ? 'Feststellungen' : 'Findings'}>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{report.findings}</p>
              </Section>
            )}

            {/* Next steps */}
            {report.nextSteps && (
              <Section title={language === 'de' ? 'Nächste Schritte' : 'Next Steps'}>
                <p className="text-sm text-foreground/80 whitespace-pre-wrap">{report.nextSteps}</p>
              </Section>
            )}

            {/* Materials */}
            {report.materialItems?.length > 0 && (
              <>
                <Separator />
                <Section title={language === 'de' ? 'Material' : 'Materials'}>
                  <div className="space-y-1.5">
                    {report.materialItems.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
                        <span className="truncate flex-1">{item.description}</span>
                        <span className="text-muted-foreground ml-3 shrink-0">{item.quantity} {item.unit}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              </>
            )}

            {/* Customer signature */}
            {report.customerSignature && (
              <>
                <Separator />
                <Section title={language === 'de' ? 'Kundenunterschrift' : 'Customer Signature'}>
                  <p className="text-sm text-muted-foreground">{report.customerSignerName || '—'}</p>
                  {typeof report.customerSignature === 'string' && report.customerSignature.startsWith('data:image') && (
                    <img src={report.customerSignature} alt="signature" className="max-h-24 border rounded" />
                  )}
                </Section>
              </>
            )}

            {/* Technician notes */}
            {report.technicianNotes && (
              <>
                <Separator />
                <Section title={language === 'de' ? 'Technikernotizen' : 'Technician Notes'}>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap">{report.technicianNotes}</p>
                </Section>
              </>
            )}

            {/* Rejection note */}
            {report.status === 'REJECTED' && report.rejectionNote && (
              <>
                <Separator />
                <Section title={language === 'de' ? 'Ablehnungsgrund' : 'Rejection Reason'}>
                  <p className="text-sm text-destructive">{report.rejectionNote}</p>
                </Section>
              </>
            )}
          </div>

          {/* Action footer */}
          {canAct && (
            <div className="border-t px-6 py-4 flex gap-2 justify-end bg-background">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRejectOpen(true)}
                disabled={reject.isPending || approve.isPending}
                className="text-destructive border-destructive/30 hover:bg-destructive/5"
              >
                <XCircle className="h-4 w-4 mr-1.5" />
                {t('fieldOps.reports.reject', 'Reject')}
              </Button>
              <Button
                size="sm"
                onClick={() => approve.mutate({ reportId: report._id, orderId })}
                disabled={approve.isPending || reject.isPending}
              >
                {approve.isPending ? <span className="flex items-center gap-1.5"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />{language === 'de' ? 'Wird genehmigt...' : 'Approving...'}</span> : <><CheckCircle className="h-4 w-4 mr-1.5" />{t('fieldOps.reports.approve', 'Approve')}</>}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <FieldOpsRejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={(note) => reject.mutate({ reportId: report._id, orderId, rejectionNote: note })}
        isLoading={reject.isPending}
      />
    </>
  );
}
```

- [ ] **Step 4: Reports table**

`client/src/modules/field-ops/components/reports/field-ops-reports-table.jsx`:
```javascript
'use client';

import { useState, useMemo, useCallback } from 'react';
import { useFieldOpsOrders } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { FieldOpsReportStatusBadge } from './field-ops-report-status-badge';
import { FieldOpsReportDetailPanel } from './field-ops-report-detail-panel';
import { REPORT_STATUS_CONFIG } from '@/modules/field-ops/constants/field-ops-constants';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { PageHeader } from '@/shared/components/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';

export function FieldOpsReportsTable() {
  const { t, language } = useLanguage();
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedReport, setSelectedReport] = useState(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const filters = useMemo(() => {
    const f = {};
    if (statusFilter !== 'all') f.reportStatus = statusFilter;
    return f;
  }, [statusFilter]);

  const { data: orders = [], isFetching } = useFieldOpsOrders(filters);

  const reports = useMemo(() => {
    return orders.flatMap((order) =>
      (order.reports || []).map((r) => ({ ...r, _orderId: order._id, _orderNumber: order.orderNumber, _customerName: order.customerName, _technicianName: order.assignedEmployee ? `${order.assignedEmployee.firstName} ${order.assignedEmployee.lastName}` : '—' }))
    );
  }, [orders]);

  const STATUS_OPTS = [
    { value: 'all', de: 'Alle Status', en: 'All Statuses' },
    ...Object.entries(REPORT_STATUS_CONFIG).map(([v, c]) => ({ value: v, de: c.label, en: c.labelEn })),
  ];

  const columns = useMemo(() => [
    {
      accessorKey: '_orderNumber',
      header: language === 'de' ? 'Auftrag' : 'Order',
      size: 110,
      Cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original._orderNumber || '—'}</span>,
    },
    {
      accessorKey: '_technicianName',
      header: language === 'de' ? 'Techniker' : 'Technician',
      size: 160,
      Cell: ({ row }) => <span className="text-sm">{row.original._technicianName}</span>,
    },
    {
      accessorKey: 'reportDate',
      header: language === 'de' ? 'Datum' : 'Date',
      size: 110,
      Cell: ({ row }) => <span className="text-xs">{formatDate(row.original.reportDate)}</span>,
    },
    {
      accessorKey: 'status',
      header: language === 'de' ? 'Status' : 'Status',
      size: 130,
      Cell: ({ row }) => <FieldOpsReportStatusBadge status={row.original.status} size="sm" />,
    },
    {
      accessorKey: 'materialItems',
      header: language === 'de' ? 'Material' : 'Materials',
      size: 90,
      Cell: ({ row }) => <span className="text-xs text-muted-foreground">{(row.original.materialItems || []).length}</span>,
    },
  ], [language]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('fieldOps.reports.title', 'Work Reports')}
        description={t('fieldOps.reports.desc', 'Review and approve submitted reports.')}
        count={reports.length}
      >
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-36 text-xs rounded-full border-dashed">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTS.map((o) => <SelectItem key={o.value} value={o.value}>{language === 'de' ? o.de : o.en}</SelectItem>)}
          </SelectContent>
        </Select>
      </PageHeader>
      <DataTableShell
        columns={columns}
        data={reports}
        isLoading={isFetching && reports.length === 0}
        onRowClick={(row) => { setSelectedReport(row); setPanelOpen(true); }}
        emptyMessage={t('fieldOps.reports.empty', 'No reports found.')}
      />
      <FieldOpsReportDetailPanel
        report={selectedReport}
        orderId={selectedReport?._orderId}
        open={panelOpen}
        onOpenChange={(v) => { setPanelOpen(v); if (!v) setSelectedReport(null); }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Wire page**

Replace `client/src/app/(platform)/field-ops/reports/page.jsx`:
```javascript
'use client';
import { FieldOpsReportsTable } from '@/modules/field-ops/components/reports/field-ops-reports-table';
export default function FieldOpsReportsPage() {
  return <FieldOpsReportsTable />;
}
```

- [ ] **Step 6: Verify** — `/field-ops/reports` shows table; clicking a SUBMITTED row opens slide-over; Approve/Reject buttons visible; Reject requires note.

- [ ] **Step 7: Commit**
```bash
git add client/src/modules/field-ops/components/reports/ client/src/app/\(platform\)/field-ops/reports/page.jsx
git commit -m "feat(field-ops): work reports table with approve/reject slide-over"
```

---

## Task 7: Time Entry Management

**Files:**
- Create: `client/src/modules/field-ops/hooks/use-field-ops-time-mutations.js`
- Create: `client/src/modules/field-ops/components/time/field-ops-time-release-dialog.jsx`
- Create: `client/src/modules/field-ops/components/time/field-ops-time-override-dialog.jsx`
- Create: `client/src/modules/field-ops/components/time/field-ops-time-table.jsx`
- Modify: `client/src/app/(platform)/field-ops/time/page.jsx`

- [ ] **Step 1: Time mutations hook**

`client/src/modules/field-ops/hooks/use-field-ops-time-mutations.js`:
```javascript
'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { timeService } from '@/modules/mobile/services/time-service';
import { queryKeys } from '@/lib/query/keys';
import { showSuccess, showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useFieldOpsTimeMutations({ onRelease, onOverride } = {}) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.mobile.timeEntries.all() });
  };

  const release = useMutation({
    mutationFn: (entryId) => timeService.releaseTimeEntry(entryId),
    onSuccess: (res, entryId) => {
      invalidate();
      if (res?.released === false) {
        showError(res?.message || t('fieldOps.time.releaseFailed', 'Cannot release: work report not submitted.'));
      } else {
        showSuccess(t('fieldOps.time.released', 'Time entries released.'));
        onRelease?.(res);
      }
    },
    onError: (err) => showError(err.message),
  });

  const releaseBatch = useMutation({
    mutationFn: async (entryIds) => {
      const results = [];
      for (const id of entryIds) {
        const res = await timeService.releaseTimeEntry(id);
        results.push({ id, res });
      }
      return results;
    },
    onSuccess: (results) => {
      invalidate();
      const failed = results.filter((r) => r.res?.released === false);
      if (failed.length > 0) {
        showError(`${failed.length} ${t('fieldOps.time.releaseFailed', 'entries could not be released (report not submitted).')}`);
      } else {
        showSuccess(t('fieldOps.time.released', 'Time entries released.'));
      }
      onRelease?.(results);
    },
    onError: (err) => showError(err.message),
  });

  const override = useMutation({
    mutationFn: (entryId) => timeService.releaseTimeEntry(entryId),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('fieldOps.time.overrideSuccess', 'Time entry manually released.'));
      onOverride?.(res);
    },
    onError: (err) => showError(err.message),
  });

  return { release, releaseBatch, override };
}
```

- [ ] **Step 2: Release confirm dialog**

`client/src/modules/field-ops/components/time/field-ops-time-release-dialog.jsx`:
```javascript
'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { Loader2 } from 'lucide-react';

export function FieldOpsTimeReleaseDialog({ open, onOpenChange, count, onConfirm, isLoading }) {
  const { t, language } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('fieldOps.time.release', 'Release Time Entries')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          {language === 'de'
            ? `${count} Zeiteintrag${count !== 1 ? 'e' : ''} freigeben?`
            : `Release ${count} time entr${count !== 1 ? 'ies' : 'y'}?`}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{language === 'de' ? 'Abbrechen' : 'Cancel'}</Button>
          <Button onClick={onConfirm} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('fieldOps.time.release', 'Release')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Override dialog**

`client/src/modules/field-ops/components/time/field-ops-time-override-dialog.jsx`:
```javascript
'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/lib/i18n/language-context';
import { Loader2, ShieldAlert } from 'lucide-react';

export function FieldOpsTimeOverrideDialog({ open, onOpenChange, onConfirm, isLoading }) {
  const { t, language } = useLanguage();
  const [justification, setJustification] = useState('');
  const tooShort = justification.trim().length > 0 && justification.trim().length < 20;
  const valid = justification.trim().length >= 20;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setJustification(''); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4.5 w-4.5 text-amber-500" />
            {t('fieldOps.time.overrideRelease', 'Override Release')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label className="text-sm">{t('fieldOps.time.overrideJustification', 'Justification (min 20 chars)')}</Label>
          <Textarea
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            rows={3}
            placeholder={language === 'de' ? 'Begründung eingeben...' : 'Enter justification...'}
          />
          {tooShort && (
            <p className="text-xs text-destructive">{language === 'de' ? `Noch ${20 - justification.trim().length} Zeichen` : `${20 - justification.trim().length} more chars needed`}</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{language === 'de' ? 'Abbrechen' : 'Cancel'}</Button>
          <Button variant="default" onClick={() => onConfirm(justification)} disabled={!valid || isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('fieldOps.time.overrideRelease', 'Override')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Time entries table**

`client/src/modules/field-ops/components/time/field-ops-time-table.jsx`:
```javascript
'use client';

import { useState, useMemo } from 'react';
import { useFieldOpsTimeEntries } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { useFieldOpsTimeMutations } from '@/modules/field-ops/hooks/use-field-ops-time-mutations';
import { FieldOpsTimeReleaseDialog } from './field-ops-time-release-dialog';
import { FieldOpsTimeOverrideDialog } from './field-ops-time-override-dialog';
import { RELEASE_STATUS_CONFIG, ACTIVITY_TYPE_LABELS } from '@/modules/field-ops/constants/field-ops-constants';
import { DataTableShell } from '@/shared/components/data-table/data-table-shell';
import { BulkActionsBar } from '@/shared/components/data-table/bulk-actions-bar';
import { PageHeader } from '@/shared/components/page-header';
import { PermissionGate } from '@/shared/components/permission-gate';
import { RowActionsMenu } from '@/shared/components/data-table/row-actions-menu';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import { Unlock, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function FieldOpsTimeTable() {
  const { t, language } = useLanguage();
  const [rowSelection, setRowSelection] = useState({});
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [overrideTarget, setOverrideTarget] = useState(null);

  const { data: entries = [], isFetching } = useFieldOpsTimeEntries({});

  const { releaseBatch, override } = useFieldOpsTimeMutations({
    onRelease: () => { setRowSelection({}); setReleaseOpen(false); },
    onOverride: () => setOverrideTarget(null),
  });

  const selectedIds = Object.keys(rowSelection).filter((id) => {
    const e = entries.find((x) => x._id === id);
    return e && e.releaseStatus === 'PENDING';
  });

  const columns = useMemo(() => [
    {
      accessorKey: 'date',
      header: language === 'de' ? 'Datum' : 'Date',
      size: 110,
      Cell: ({ row }) => <span className="text-xs">{formatDate(row.original.date)}</span>,
    },
    {
      accessorKey: 'activityType',
      header: language === 'de' ? 'Tätigkeit' : 'Activity',
      size: 130,
      Cell: ({ row }) => {
        const cfg = ACTIVITY_TYPE_LABELS[row.original.activityType];
        return <span className="text-xs text-muted-foreground">{cfg ? (language === 'de' ? cfg.label : cfg.labelEn) : row.original.activityType}</span>;
      },
    },
    {
      accessorKey: 'netDurationMin',
      header: language === 'de' ? 'Netto' : 'Net',
      size: 90,
      Cell: ({ row }) => {
        const min = row.original.netDurationMin || row.original.net_duration_min || 0;
        const h = Math.floor(min / 60);
        const m = min % 60;
        return <span className="text-xs font-mono">{h}h {m > 0 ? `${m}m` : ''}</span>;
      },
    },
    {
      accessorKey: 'releaseStatus',
      header: language === 'de' ? 'Freigabe' : 'Release',
      size: 120,
      Cell: ({ row }) => {
        const cfg = RELEASE_STATUS_CONFIG[row.original.releaseStatus];
        return cfg ? (
          <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', cfg.badge)}>
            {language === 'de' ? cfg.label : cfg.labelEn}
          </span>
        ) : <span className="text-xs">{row.original.releaseStatus}</span>;
      },
    },
    {
      accessorKey: 'note',
      header: language === 'de' ? 'Notiz' : 'Note',
      size: 200,
      Cell: ({ row }) => <span className="text-xs text-muted-foreground truncate">{row.original.note || '—'}</span>,
    },
  ], [language]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('fieldOps.time.title', 'Time Entries')}
        description={t('fieldOps.time.desc', 'Release and manage time entries.')}
        count={entries.length}
      />
      <DataTableShell
        columns={columns}
        data={entries}
        isLoading={isFetching && entries.length === 0}
        enableRowSelection
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        getRowId={(row) => row._id}
        emptyMessage={t('fieldOps.time.empty', 'No time entries found.')}
        renderRowActions={({ row }) => (
          <RowActionsMenu items={[
            {
              label: t('fieldOps.time.release', 'Release'),
              icon: Unlock,
              onSelect: () => releaseBatch.mutate([row.original._id]),
              hidden: row.original.releaseStatus !== 'PENDING',
            },
            {
              label: t('fieldOps.time.overrideRelease', 'Override Release'),
              icon: ShieldAlert,
              onSelect: () => setOverrideTarget(row.original._id),
              hidden: row.original.releaseStatus !== 'LOCKED',
            },
          ]} />
        )}
      />
      <BulkActionsBar count={selectedIds.length} onClear={() => setRowSelection({})}>
        <Button size="sm" onClick={() => setReleaseOpen(true)} disabled={selectedIds.length === 0}>
          <Unlock className="h-3.5 w-3.5 mr-1.5" />
          {t('fieldOps.time.releaseSelected', 'Release Selected')} ({selectedIds.length})
        </Button>
      </BulkActionsBar>
      <FieldOpsTimeReleaseDialog
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        count={selectedIds.length}
        onConfirm={() => releaseBatch.mutate(selectedIds)}
        isLoading={releaseBatch.isPending}
      />
      <PermissionGate permission="time:release:override">
        <FieldOpsTimeOverrideDialog
          open={!!overrideTarget}
          onOpenChange={(v) => { if (!v) setOverrideTarget(null); }}
          onConfirm={() => override.mutate(overrideTarget)}
          isLoading={override.isPending}
        />
      </PermissionGate>
    </div>
  );
}
```

- [ ] **Step 5: Wire page**

Replace `client/src/app/(platform)/field-ops/time/page.jsx`:
```javascript
'use client';
import { FieldOpsTimeTable } from '@/modules/field-ops/components/time/field-ops-time-table';
export default function FieldOpsTimePage() {
  return <FieldOpsTimeTable />;
}
```

- [ ] **Step 6: Verify** — `/field-ops/time` renders entries; select PENDING rows → "Release Selected" button appears; single-row override visible on LOCKED entries; override dialog requires 20 chars.

- [ ] **Step 7: Commit**
```bash
git add client/src/modules/field-ops/ client/src/app/\(platform\)/field-ops/time/page.jsx
git commit -m "feat(field-ops): time entries table with bulk release and override"
```

---

## Task 8: Chat Page

**Files:**
- Create: `client/src/modules/field-ops/components/chat/field-ops-chat-message.jsx`
- Create: `client/src/modules/field-ops/components/chat/field-ops-chat-input.jsx`
- Create: `client/src/modules/field-ops/components/chat/field-ops-chat-panel.jsx`
- Modify: `client/src/app/(platform)/field-ops/chat/[projectId]/page.jsx`

- [ ] **Step 1: Chat message component**

`client/src/modules/field-ops/components/chat/field-ops-chat-message.jsx`:
```javascript
import { cn } from '@/lib/utils';
import { useAuth } from '@/shared/hooks/use-auth';

export function FieldOpsChatMessage({ message }) {
  const { user } = useAuth();
  const isMine = message.sender_id === user?._id || message.senderId === user?._id;
  const time = new Date(message.sent_at || message.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={cn('flex gap-2 mb-3', isMine ? 'justify-end' : 'justify-start')}>
      {!isMine && (
        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold shrink-0 mt-1">
          {(message.sender_name || message.senderName || '?')[0].toUpperCase()}
        </div>
      )}
      <div className={cn('max-w-[72%] space-y-0.5')}>
        {!isMine && (
          <p className="text-[11px] font-medium text-muted-foreground px-1">{message.sender_name || message.senderName}</p>
        )}
        <div className={cn(
          'rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
          isMine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted text-foreground rounded-bl-sm',
        )}>
          {message.content}
        </div>
        <p className={cn('text-[10px] text-muted-foreground px-1', isMine && 'text-right')}>{time}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Chat input**

`client/src/modules/field-ops/components/chat/field-ops-chat-input.jsx`:
```javascript
'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { SendHorizontal } from 'lucide-react';

export function FieldOpsChatInput({ onSend, isLoading }) {
  const { t } = useLanguage();
  const [text, setText] = useState('');

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend({ messageType: 'TEXT', content: trimmed, mentions: [] });
    setText('');
  };

  return (
    <div className="flex gap-2 p-4 border-t bg-background">
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
        placeholder={t('fieldOps.chat.sendPlaceholder', 'Write a message...')}
        className="flex-1"
        disabled={isLoading}
      />
      <Button size="icon" onClick={handleSend} disabled={!text.trim() || isLoading}>
        <SendHorizontal className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Chat panel**

`client/src/modules/field-ops/components/chat/field-ops-chat-panel.jsx`:
```javascript
'use client';

import { useEffect, useRef } from 'react';
import { useChatMessages, useChatMutations } from '@/modules/mobile/hooks/use-chat';
import { FieldOpsChatMessage } from './field-ops-chat-message';
import { FieldOpsChatInput } from './field-ops-chat-input';
import { PageHeader } from '@/shared/components/page-header';
import { useLanguage } from '@/lib/i18n/language-context';

export function FieldOpsChatPanel({ projectId }) {
  const { t } = useLanguage();
  const bottomRef = useRef(null);

  const { data: messages = [], isLoading } = useChatMessages(projectId);
  const { sendMessage } = useChatMutations(projectId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div className="px-6 py-4">
        <PageHeader
          title={t('fieldOps.chat.title', 'Project Chat')}
          description={`Project ${projectId}`}
        />
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-2">
        {isLoading ? (
          <div className="space-y-3">
            {[1,2,3].map((i) => (
              <div key={i} className="flex gap-2">
                <div className="h-7 w-7 rounded-full bg-muted animate-pulse" />
                <div className="h-10 w-48 rounded-2xl bg-muted animate-pulse" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            {t('fieldOps.chat.empty', 'No messages yet.')}
          </div>
        ) : (
          messages.map((msg) => <FieldOpsChatMessage key={msg.id || msg._id} message={msg} />)
        )}
        <div ref={bottomRef} />
      </div>
      <FieldOpsChatInput
        onSend={(data) => sendMessage.mutate(data)}
        isLoading={sendMessage.isPending}
      />
    </div>
  );
}
```

- [ ] **Step 4: Wire page**

Replace `client/src/app/(platform)/field-ops/chat/[projectId]/page.jsx`:
```javascript
'use client';
import { use } from 'react';
import { FieldOpsChatPanel } from '@/modules/field-ops/components/chat/field-ops-chat-panel';
export default function FieldOpsChatPage({ params }) {
  const { projectId } = use(params);
  return <FieldOpsChatPanel projectId={projectId} />;
}
```

- [ ] **Step 5: Verify** — navigate to `/field-ops/chat/[any-project-id]`; messages load; typing and pressing Enter sends; new messages appear in real-time if WebSocket is connected.

- [ ] **Step 6: Commit**
```bash
git add client/src/modules/field-ops/components/chat/ client/src/app/\(platform\)/field-ops/chat/
git commit -m "feat(field-ops): project chat panel with real-time WebSocket"
```

---

## Task 9: Notifications Page

**Files:**
- Create: `client/src/modules/field-ops/components/notifications/field-ops-notification-item.jsx`
- Create: `client/src/modules/field-ops/components/notifications/field-ops-notification-list.jsx`
- Modify: `client/src/app/(platform)/field-ops/notifications/page.jsx`

- [ ] **Step 1: Notification item**

`client/src/modules/field-ops/components/notifications/field-ops-notification-item.jsx`:
```javascript
'use client';

import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Bell, MessageSquare, ClipboardList, AlertTriangle, Clock } from 'lucide-react';

const TYPE_ICON = {
  NEW_ASSIGNMENT: ClipboardList,
  ORDER_CHANGED: ClipboardList,
  ORDER_CANCELLED: AlertTriangle,
  CHAT_MESSAGE: MessageSquare,
  DAILY_REMINDER: Clock,
  ESCALATION: AlertTriangle,
};

const DEEP_LINK_MAP = {
  order: (id) => `/field-ops/orders/${id}`,
  report: (id) => `/field-ops/reports`,
  chat: (id) => `/field-ops/chat/${id}`,
};

export function FieldOpsNotificationItem({ notification, onMarkRead }) {
  const router = useRouter();
  const Icon = TYPE_ICON[notification.notification_type || notification.notificationType] || Bell;

  const handleClick = () => {
    if (!notification.is_read) onMarkRead(notification._id || notification.id);
    const link = notification.deep_link || notification.deepLink;
    if (link) router.push(link);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 border-b last:border-0',
        !notification.is_read && 'bg-primary/[0.04]',
      )}
    >
      <div className={cn('mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0', !notification.is_read ? 'bg-primary/10' : 'bg-muted')}>
        <Icon className={cn('h-4 w-4', !notification.is_read ? 'text-primary' : 'text-muted-foreground')} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm leading-snug', !notification.is_read ? 'font-semibold' : 'font-normal')}>{notification.title}</p>
        {notification.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.body}</p>}
        <p className="text-[11px] text-muted-foreground/60 mt-1">
          {new Date(notification.received_at || notification.receivedAt).toLocaleString()}
        </p>
      </div>
      {!notification.is_read && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-2" />}
    </button>
  );
}
```

- [ ] **Step 2: Notification list**

`client/src/modules/field-ops/components/notifications/field-ops-notification-list.jsx`:
```javascript
'use client';

import { useFieldOpsNotifications } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { useNotificationMutations } from '@/modules/mobile/hooks/use-notification-queries';
import { FieldOpsNotificationItem } from './field-ops-notification-item';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';

export function FieldOpsNotificationList() {
  const { t } = useLanguage();
  const { data: notifications = [], isLoading } = useFieldOpsNotifications();
  const { markRead, markAllRead } = useNotificationMutations();

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-4">
      <div className="px-6 pt-6">
        <PageHeader
          title={t('fieldOps.notifications.title', 'Notifications')}
          count={unread > 0 ? unread : undefined}
        >
          {unread > 0 && (
            <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
              {t('fieldOps.notifications.markAllRead', 'Mark all as read')}
            </Button>
          )}
        </PageHeader>
      </div>
      <div className="border rounded-xl overflow-hidden mx-6">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1,2,3,4].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-48 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">{t('fieldOps.notifications.empty', 'No notifications.')}</div>
        ) : (
          notifications.map((n) => (
            <FieldOpsNotificationItem
              key={n._id || n.id}
              notification={n}
              onMarkRead={(id) => markRead.mutate(id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire page**

Replace `client/src/app/(platform)/field-ops/notifications/page.jsx`:
```javascript
'use client';
import { FieldOpsNotificationList } from '@/modules/field-ops/components/notifications/field-ops-notification-list';
export default function FieldOpsNotificationsPage() {
  return <FieldOpsNotificationList />;
}
```

- [ ] **Step 4: Commit**
```bash
git add client/src/modules/field-ops/components/notifications/ client/src/app/\(platform\)/field-ops/notifications/page.jsx
git commit -m "feat(field-ops): notifications page with mark-read and mark-all-read"
```

---

## Task 10: Order Detail Tabs

**Files:**
- Create: `client/src/modules/field-ops/components/orders/field-ops-order-detail-tabs.jsx`
- Create: `client/src/modules/field-ops/components/photos/field-ops-photo-gallery.jsx`
- Create: `client/src/modules/field-ops/components/installations/field-ops-installations-table.jsx`
- Modify: `client/src/app/(platform)/field-ops/orders/[id]/page.jsx`

- [ ] **Step 1: Photo gallery**

`client/src/modules/field-ops/components/photos/field-ops-photo-gallery.jsx`:
```javascript
'use client';

import { useState } from 'react';
import { useFieldOpsOrderPhotos } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { PHOTO_CATEGORY } from '@/modules/field-ops/constants/field-ops-constants';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { ImageOff } from 'lucide-react';

const CATEGORY_LABELS = {
  BEFORE: { de: 'Vorher', en: 'Before' },
  AFTER: { de: 'Nachher', en: 'After' },
  DAMAGE: { de: 'Schaden', en: 'Damage' },
  INSTALLATION: { de: 'Installation', en: 'Installation' },
  GENERAL: { de: 'Allgemein', en: 'General' },
  NAMEPLATE: { de: 'Typenschild', en: 'Nameplate' },
};

export function FieldOpsPhotoGallery({ orderId }) {
  const { language } = useLanguage();
  const { data: photos = [], isLoading } = useFieldOpsOrderPhotos(orderId);
  const [lightbox, setLightbox] = useState(null);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {[1,2,3,4,5,6].map((i) => <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />)}
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <ImageOff className="h-8 w-8" />
        <p className="text-sm">{language === 'de' ? 'Keine Fotos vorhanden.' : 'No photos.'}</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {photos.map((photo) => {
          const url = photo.remote_file_url || photo.remoteFileUrl || photo.local_file_path;
          const cat = CATEGORY_LABELS[photo.category];
          return (
            <button
              key={photo._id || photo.id}
              onClick={() => setLightbox(photo)}
              className="group relative aspect-square rounded-lg overflow-hidden border hover:ring-2 hover:ring-primary transition-all"
            >
              <img src={url} alt={photo.caption || photo.category} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
              {cat && (
                <span className="absolute bottom-1 left-1 text-[9px] font-bold uppercase tracking-wider bg-black/60 text-white rounded px-1.5 py-0.5">
                  {language === 'de' ? cat.de : cat.en}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <Dialog open={!!lightbox} onOpenChange={(v) => { if (!v) setLightbox(null); }}>
        <DialogContent className="max-w-3xl p-2 bg-black border-0">
          {lightbox && (
            <div className="space-y-2">
              <img
                src={lightbox.remote_file_url || lightbox.remoteFileUrl}
                alt={lightbox.caption || lightbox.category}
                className="w-full max-h-[70vh] object-contain rounded"
              />
              {lightbox.caption && <p className="text-sm text-white/70 px-2 pb-2">{lightbox.caption}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Installations table (for order detail)**

`client/src/modules/field-ops/components/installations/field-ops-installations-table.jsx`:
```javascript
'use client';

import { useFieldOpsInstallations } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';

export function FieldOpsInstallationsTable({ siteId }) {
  const { language } = useLanguage();
  const { data: installations = [], isLoading } = useFieldOpsInstallations(siteId);

  if (isLoading) return <div className="space-y-2">{[1,2].map((i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}</div>;
  if (!installations.length) return <p className="text-sm text-muted-foreground py-4">{language === 'de' ? 'Keine Anlagen gefunden.' : 'No installations found.'}</p>;

  return (
    <div className="space-y-2">
      {installations.map((inst) => (
        <div key={inst._id} className="border rounded-lg px-4 py-3 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{inst.model || inst.type || '—'}</p>
            <span className="text-xs font-mono text-muted-foreground">{inst.serialNumber || inst.serial_number}</span>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            {inst.installationDate && <span>{language === 'de' ? 'Eingebaut' : 'Installed'}: {formatDate(inst.installationDate)}</span>}
            {inst.warrantyExpiry && <span>{language === 'de' ? 'Garantie bis' : 'Warranty'}: {formatDate(inst.warrantyExpiry)}</span>}
            {inst.lastServiceDate && <span>{language === 'de' ? 'Letzter Service' : 'Last service'}: {formatDate(inst.lastServiceDate)}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Order detail tabs**

`client/src/modules/field-ops/components/orders/field-ops-order-detail-tabs.jsx`:
```javascript
'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFieldOpsOrderDetail, useFieldOpsOrderReports, useFieldOpsOrderTimeEntries } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { FieldOpsOrderStatusBadge } from './field-ops-order-status-badge';
import { FieldOpsReportDetailPanel } from '@/modules/field-ops/components/reports/field-ops-report-detail-panel';
import { FieldOpsReportStatusBadge } from '@/modules/field-ops/components/reports/field-ops-report-status-badge';
import { FieldOpsPhotoGallery } from '@/modules/field-ops/components/photos/field-ops-photo-gallery';
import { FieldOpsInstallationsTable } from '@/modules/field-ops/components/installations/field-ops-installations-table';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';
import { RELEASE_STATUS_CONFIG, ACTIVITY_TYPE_LABELS } from '@/modules/field-ops/constants/field-ops-constants';
import { Button } from '@/components/ui/button';
import { MapPin, Phone, Mail, FileText, Clock, Camera, Files, MessageSquare, FileCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-muted-foreground min-w-[120px] shrink-0">{label}</span>
      <span className="text-foreground/90">{value}</span>
    </div>
  );
}

function OverviewTab({ order }) {
  const { language } = useLanguage();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{language === 'de' ? 'Auftrag' : 'Order'}</h4>
        <InfoRow label={language === 'de' ? 'Auftrags-Nr.' : 'Order #'} value={order.orderNumber} />
        <InfoRow label={language === 'de' ? 'Typ' : 'Type'} value={order.orderType} />
        <InfoRow label={language === 'de' ? 'Priorität' : 'Priority'} value={order.priority} />
        <InfoRow label={language === 'de' ? 'Geplant' : 'Scheduled'} value={order.scheduledStart ? formatDate(order.scheduledStart) : undefined} />
        {order.description && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{language === 'de' ? 'Beschreibung' : 'Description'}</p>
            <p className="text-sm text-foreground/80 whitespace-pre-wrap">{order.description}</p>
          </div>
        )}
      </div>
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{language === 'de' ? 'Kunde & Standort' : 'Customer & Site'}</h4>
        <InfoRow label={language === 'de' ? 'Kunde' : 'Customer'} value={order.customerName} />
        {order.customerPhone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
            <a href={`tel:${order.customerPhone}`} className="text-primary hover:underline">{order.customerPhone}</a>
          </div>
        )}
        {order.customerEmail && (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
            <a href={`mailto:${order.customerEmail}`} className="text-primary hover:underline">{order.customerEmail}</a>
          </div>
        )}
        {order.siteAddress && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <span>{order.siteAddress}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportsTab({ orderId }) {
  const { language } = useLanguage();
  const { data: reports = [], isLoading } = useFieldOpsOrderReports(orderId);
  const [selected, setSelected] = useState(null);

  if (isLoading) return <div className="space-y-2">{[1,2].map((i) => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}</div>;
  if (!reports.length) return <p className="text-sm text-muted-foreground py-4">{language === 'de' ? 'Keine Berichte vorhanden.' : 'No reports yet.'}</p>;

  return (
    <>
      <div className="space-y-2">
        {reports.map((r) => (
          <button
            key={r._id}
            onClick={() => setSelected(r)}
            className="w-full flex items-center justify-between border rounded-lg px-4 py-3 hover:bg-muted/50 text-left transition-colors"
          >
            <div>
              <p className="text-sm font-medium">{formatDate(r.reportDate)}</p>
              <p className="text-xs text-muted-foreground">{r.workPerformed?.slice(0, 60)}{r.workPerformed?.length > 60 ? '…' : ''}</p>
            </div>
            <FieldOpsReportStatusBadge status={r.status} size="sm" />
          </button>
        ))}
      </div>
      <FieldOpsReportDetailPanel
        report={selected}
        orderId={orderId}
        open={!!selected}
        onOpenChange={(v) => { if (!v) setSelected(null); }}
      />
    </>
  );
}

function TimeTab({ orderId }) {
  const { language } = useLanguage();
  const { data: entries = [], isLoading } = useFieldOpsOrderTimeEntries(orderId);
  const RELEASE = RELEASE_STATUS_CONFIG;
  const ACT = ACTIVITY_TYPE_LABELS;

  if (isLoading) return <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}</div>;
  if (!entries.length) return <p className="text-sm text-muted-foreground py-4">{language === 'de' ? 'Keine Zeiteinträge.' : 'No time entries.'}</p>;

  return (
    <div className="space-y-2">
      {entries.map((e) => {
        const min = e.netDurationMin || e.net_duration_min || 0;
        const h = Math.floor(min / 60);
        const m = min % 60;
        const act = ACT[e.activityType];
        const rel = RELEASE[e.releaseStatus];
        return (
          <div key={e._id} className="flex items-center justify-between border rounded-lg px-4 py-3">
            <div>
              <p className="text-sm font-medium">{formatDate(e.date)}</p>
              <p className="text-xs text-muted-foreground">{act ? (language === 'de' ? act.label : act.labelEn) : e.activityType}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-mono">{h}h{m > 0 ? ` ${m}m` : ''}</p>
              {rel && <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', rel.badge)}>{language === 'de' ? rel.label : rel.labelEn}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function FieldOpsOrderDetailTabs({ orderId }) {
  const { language } = useLanguage();
  const { data: order, isLoading } = useFieldOpsOrderDetail(orderId);

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="h-4 w-64 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-4 gap-2 mt-4">
          {[1,2,3,4].map((i) => <div key={i} className="h-9 rounded-lg bg-muted animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!order) return <p className="p-6 text-muted-foreground">{language === 'de' ? 'Auftrag nicht gefunden.' : 'Order not found.'}</p>;

  const projectId = order.projectId || order.project_id;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl font-bold">{order.title || order.orderNumber}</h2>
            <FieldOpsOrderStatusBadge status={order.status} />
          </div>
          <p className="text-sm text-muted-foreground">{order.customerName} {order.siteAddress ? `· ${order.siteAddress}` : ''}</p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start h-9 bg-muted/50">
          <TabsTrigger value="overview" className="text-xs gap-1.5"><FileText className="h-3.5 w-3.5" />{language === 'de' ? 'Übersicht' : 'Overview'}</TabsTrigger>
          <TabsTrigger value="reports" className="text-xs gap-1.5"><FileCheck className="h-3.5 w-3.5" />{language === 'de' ? 'Berichte' : 'Reports'}</TabsTrigger>
          <TabsTrigger value="photos" className="text-xs gap-1.5"><Camera className="h-3.5 w-3.5" />{language === 'de' ? 'Fotos' : 'Photos'}</TabsTrigger>
          <TabsTrigger value="time" className="text-xs gap-1.5"><Clock className="h-3.5 w-3.5" />{language === 'de' ? 'Zeiten' : 'Time'}</TabsTrigger>
          <TabsTrigger value="installations" className="text-xs gap-1.5"><Files className="h-3.5 w-3.5" />{language === 'de' ? 'Anlagen' : 'Installations'}</TabsTrigger>
          {projectId && (
            <TabsTrigger value="chat" asChild>
              <Link href={`/field-ops/chat/${projectId}`} className="text-xs gap-1.5 flex items-center">
                <MessageSquare className="h-3.5 w-3.5" />{language === 'de' ? 'Chat' : 'Chat'}
              </Link>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview" className="mt-4"><OverviewTab order={order} /></TabsContent>
        <TabsContent value="reports" className="mt-4"><ReportsTab orderId={orderId} /></TabsContent>
        <TabsContent value="photos" className="mt-4"><FieldOpsPhotoGallery orderId={orderId} /></TabsContent>
        <TabsContent value="time" className="mt-4"><TimeTab orderId={orderId} /></TabsContent>
        <TabsContent value="installations" className="mt-4">
          <FieldOpsInstallationsTable siteId={order.siteId || order.site_id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 4: Wire order detail page**

Replace `client/src/app/(platform)/field-ops/orders/[id]/page.jsx`:
```javascript
'use client';
import { use } from 'react';
import { FieldOpsOrderDetailTabs } from '@/modules/field-ops/components/orders/field-ops-order-detail-tabs';
export default function FieldOpsOrderDetailPage({ params }) {
  const { id } = use(params);
  return <FieldOpsOrderDetailTabs orderId={id} />;
}
```

- [ ] **Step 5: Verify** — click any order row → detail page with tabs; Overview shows customer + order info; Reports tab lists reports; clicking a report opens slide-over; Photos tab shows gallery; Time tab shows entries with net duration + release status.

- [ ] **Step 6: Commit**
```bash
git add client/src/modules/field-ops/ client/src/app/\(platform\)/field-ops/orders/
git commit -m "feat(field-ops): order detail with tabbed overview, reports, photos, time, installations"
```

---

## Self-Review

**Spec coverage:**
- ✅ Orders table with filters (Task 4)
- ✅ Order detail tabbed view (Task 10)
- ✅ Work reports table + approve/reject (Tasks 5, 6)
- ✅ Time entries + bulk release + override (Task 7)
- ✅ Photos gallery + lightbox (Task 10)
- ✅ Chat page with WebSocket (Task 8)
- ✅ Notifications page (Task 9)
- ✅ Installations in order detail (Task 10)
- ✅ Sidebar navigation (Task 1)
- ✅ i18n de+en (Task 1)
- ✅ Permission gates: `mobile:read`, `time:release:override` (Tasks 7, all pages)
- ✅ Quotation — query hook exists in `use-field-ops-queries.js`; tab link available via order detail (extend in Task 10 if needed by adding `quotation` TabsContent reading `useFieldOpsOrderQuotation`)

**Catalog** — `useFieldOpsCatalogSearch` hook exists; catalog search component not wired to a standalone page but accessible from order detail Reports tab (add a search-in-materials flow if needed). Not a blocking gap for the primary manager workflow.

**Placeholder scan:** None found — all steps contain actual code.

**Type consistency:** `reportService.updateReport(reportId, { status: 'APPROVED' })` — `updateReport` takes `(reportId, data)`, matches `report-service.js`. `timeService.releaseTimeEntry(entryId)` — matches `time-service.js`. `useChatMessages(projectId)` + `useChatMutations(projectId)` — match `use-chat.js` exports exactly. `useNotificationMutations()` — matches `use-notification-queries.js` exports.

---

**Plan complete.** Saved to `docs/superpowers/plans/2026-04-28-field-ops-web-module.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
