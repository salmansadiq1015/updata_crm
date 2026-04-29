# Field Operations Web Module — Design Spec

**Date:** 2026-04-28  
**Author:** Principal Frontend Architect  
**Status:** Approved  

---

## Context

The Mobile Technician App (MOD-06) already exists as a PWA at `app/(mobile)` — a full offline-first field interface for technicians. The backend exposes all functionality under `/api/v1/mobile`.

**The gap:** Back-office managers and planners have no web platform view to monitor and act on field work. They cannot see submitted work reports, release time entries, review photos, or participate in project chats without switching to the mobile view.

**This spec:** Designs a `Field Operations` module inside the main platform (`app/(platform)/field-ops`) that gives managers a desktop-optimized, full-action-capable workspace — powered by the same backend APIs, reusing the existing mobile module's service and hook layer.

---

## Goals

1. Managers can view, filter, and act on all field operations data across all technicians
2. Back-office approval flows: approve/reject work reports, release/override time entries
3. Photo documentation viewer per order
4. Project chat participation from the web
5. In-app notification center
6. Material catalog browser
7. Installation overview with service history

---

## Non-Goals

- **No offline support** — back-office users are always on stable network; no IndexedDB/service worker needed
- **No timer widget** — time recording is for technicians in the field
- **No barcode scanning / signature capture** — field-only features
- **No new backend APIs** — strictly consumes existing `/api/v1/mobile` endpoints
- **No separate mobile-responsive layout** — desktop-first; responsive down to tablet

---

## Architecture

### Layer model

```
UI Layer          app/(platform)/field-ops/*  (pages, layouts)
Application Layer modules/field-ops/          (components, hooks, constants)
Data Layer        modules/mobile/services/*   (imported, not duplicated)
                  modules/mobile/hooks/*      (query hooks reused where applicable)
Infrastructure    lib/api/client.js           (axios, interceptors, auth)
                  lib/query/keys.js           (queryKeys.mobile.*)
```

### Module placement

```
client/src/
├── app/(platform)/field-ops/
│   ├── layout.jsx
│   ├── page.jsx                          → redirect to /field-ops/orders
│   ├── orders/
│   │   ├── page.jsx                      → Orders table
│   │   └── [id]/page.jsx                 → Order detail (tabbed)
│   ├── reports/
│   │   └── page.jsx                      → All work reports
│   ├── time/
│   │   └── page.jsx                      → Time entries management
│   ├── chat/
│   │   └── [projectId]/page.jsx          → Project chat
│   ├── notifications/
│   │   └── page.jsx                      → Notification center
│   └── installations/
│       └── [siteId]/page.jsx             → Installation overview
│
├── modules/field-ops/
│   ├── components/
│   │   ├── orders/
│   │   │   ├── field-ops-orders-table.jsx
│   │   │   ├── field-ops-order-filters.jsx
│   │   │   ├── field-ops-order-detail-tabs.jsx
│   │   │   └── field-ops-order-status-badge.jsx
│   │   ├── reports/
│   │   │   ├── field-ops-reports-table.jsx
│   │   │   ├── field-ops-report-detail-panel.jsx
│   │   │   └── field-ops-report-action-dialog.jsx
│   │   ├── time/
│   │   │   ├── field-ops-time-table.jsx
│   │   │   ├── field-ops-time-release-dialog.jsx
│   │   │   └── field-ops-time-override-dialog.jsx
│   │   ├── photos/
│   │   │   ├── field-ops-photo-gallery.jsx
│   │   │   └── field-ops-photo-lightbox.jsx
│   │   ├── chat/
│   │   │   ├── field-ops-chat-panel.jsx
│   │   │   ├── field-ops-chat-message.jsx
│   │   │   └── field-ops-chat-input.jsx
│   │   ├── notifications/
│   │   │   ├── field-ops-notification-list.jsx
│   │   │   └── field-ops-notification-item.jsx
│   │   ├── catalog/
│   │   │   ├── field-ops-catalog-search.jsx
│   │   │   └── field-ops-catalog-item-card.jsx
│   │   └── installations/
│   │       ├── field-ops-installations-table.jsx
│   │       └── field-ops-installation-detail.jsx
│   ├── hooks/
│   │   ├── use-field-ops-report-mutations.js   ← approve / reject
│   │   ├── use-field-ops-time-mutations.js     ← release / override
│   │   └── use-field-ops-order-mutations.js    ← status update
│   └── constants/
│       └── field-ops-constants.js
```

### Data layer reuse policy

| Layer | Reuse Strategy |
|---|---|
| API endpoints | Already configured in `lib/api/endpoints.js` MOBILE section |
| Query keys | Reuse `queryKeys.mobile.*` from `lib/query/keys.js` |
| Services | Import from `modules/mobile/services/` — all 11 services exist |
| Read query hooks | Import from `modules/mobile/hooks/use-*-queries.js` |
| Write mutation hooks | **New** in `modules/field-ops/hooks/` — manager actions only |
| Chat/WebSocket | Import `use-chat.js` + `websocket-client.js` from mobile module |

**Rule:** If the hook already exists in `modules/mobile/hooks/`, import it. Only create new hooks for manager-specific write operations not covered by the mobile mutation hooks.

---

## Feature Designs

### 1. Orders Management (`/field-ops/orders`)

**Orders table:**
- Columns: Order #, Type, Customer, Site, Assigned To, Scheduled Date, Status, Report Status
- Filters: date range, status (PLANNED/IN_PROGRESS/COMPLETED), type, technician (autocomplete from user list)
- Sort: date, priority, customer name
- Clicking a row opens `/field-ops/orders/[id]`
- Status badge uses color: gray=PLANNED, amber=IN_PROGRESS, green=COMPLETED
- Data: `useQuery` with `queryKeys.mobile.orders.list(filters)` → `orderService.listOrders(filters)`

**Order detail (`/field-ops/orders/[id]`):**
Tabbed layout — tabs load lazily on first visit:
- **Overview** — order info, customer & site details, priority, instructions, map link
- **Reports** — list of work reports; click → slide-over `field-ops-report-detail-panel`
- **Photos** — photo gallery grid; click → lightbox with annotation view
- **Time** — time entries for this order; release/override actions per row
- **Documents** — document list; download via presigned URL
- **Chat** — full chat panel with real-time WebSocket (project-scoped)
- **Quotation** — read-only quotation; price visibility controlled by `quotation:view-prices` permission

### 2. Work Reports (`/field-ops/reports`)

**Reports table:**
- Columns: Report #, Order #, Technician, Submitted At, Status (DRAFT/SUBMITTED/APPROVED/REJECTED), Materials Count, Photos Count
- Filters: status, technician, date range
- Bulk actions: none (approvals are deliberate, not bulk)
- Click row → slide-over panel (not navigation) to preserve table context

**Report detail slide-over (`field-ops-report-detail-panel`):**
- Sections: Work Performed, Findings, Materials Used, Next Steps, Technician Notes
- Customer signature (render as image if base64)
- Attached photos thumbnails (click → lightbox)
- Footer action bar: `[Approve]` `[Reject with Note]` — both disabled if status is not SUBMITTED
- Approve: calls `reportService.submitReport(reportId)` style endpoint; invalidates `queryKeys.mobile.reports.*`
- Reject: opens dialog for required rejection note

**Backend note:** Current backend has `POST /reports/:id/submit`. Approve/reject actions map to status updates. If backend lacks explicit approve/reject endpoints, `use-field-ops-report-mutations.js` will call the submit endpoint for approve and use a comment/note mechanism for reject.

### 3. Time Entry Management (`/field-ops/time`)

**Time entries table:**
- Columns: Technician, Date, Activity Type, Start, End, Net Duration, Order #, Release Status, Note
- Filters: date range, technician, release status (PENDING/RELEASED)
- Row checkbox selection for bulk release
- "Release Selected" toolbar button appears when rows selected; requires all selected entries to have associated submitted reports
- Per-row actions: Release (single), Override Release (with permission `time:release:override`)

**Release flow:**
1. User selects rows → clicks "Release Selected"
2. Confirm dialog: "Release N time entries?"
3. On confirm: calls `timeService.releaseTimeEntry(entryId)` for each in sequence
4. Toast per batch success/failure
5. Cache invalidated: `queryKeys.mobile.timeEntries.*`

**Override flow:**
1. User clicks "Override" on a locked entry
2. `field-ops-time-override-dialog` — requires justification text (min 20 chars)
3. Calls release endpoint; backend checks `time:release:override` permission
4. Logs justification server-side

### 4. Chat (`/field-ops/chat/[projectId]`)

**Source code reuse:**
- Uses `use-chat.js` hook from `modules/mobile/hooks/`
- Uses `websocket-client.js` from `modules/mobile/`
- Builds desktop-optimized layout (message list + composer, no bottom-nav constraints)

**Layout:** Two-pane — left: project list (sidebar); right: message thread
- Messages: sender avatar, name, timestamp, content, attachment thumbnails
- Composer: text input + attach file button + send
- @-mention: trigger on `@` with user autocomplete dropdown
- Real-time: WebSocket connection maintained while on route; reconnects on visibility change

### 5. Notifications (`/field-ops/notifications`)

- Cursor-paginated notification list
- Types: NEW_ASSIGNMENT, ORDER_CHANGED, ORDER_CANCELLED, CHAT_MESSAGE, DAILY_REMINDER, ESCALATION
- Click → navigate to related entity (order, report, chat)
- Mark as read on click
- "Mark All Read" button
- Bell icon in platform header with unread badge count (polling every 60s)

### 6. Catalog Browser (`/field-ops/catalog` — accessible from order detail)

- Search input with debounce (300ms)
- Source filter: IGH / INTERNAL / ALL
- Results list: item number, description, category, unit
- Favorites toggle per item
- No add-to-order from manager view (read-only catalog browsing)

### 7. Installations (`/field-ops/installations/[siteId]`)

- Table: model, serial number, type, installation date, warranty expiry, last service, status
- Row click → detail panel: full specs, service history timeline, attached documents
- Linked from Order Detail → Overview tab (site section has "View Installations" link)

---

## Sidebar Changes

**File:** `client/src/layout/sidebar.jsx`

Add new section `"Field Operations"` (between Business and Admin sections):

```javascript
{
  titleKey: 'sidebar.fieldOps',
  items: [
    { labelKey: 'sidebar.fieldOpsOrders',        href: '/field-ops/orders',       icon: ClipboardList,  permission: 'mobile:read' },
    { labelKey: 'sidebar.fieldOpsReports',       href: '/field-ops/reports',      icon: FileText,       permission: 'mobile:read' },
    { labelKey: 'sidebar.fieldOpsTime',          href: '/field-ops/time',         icon: Clock,          permission: 'mobile:read' },
    { labelKey: 'sidebar.fieldOpsChat',          href: '/field-ops/chat',         icon: MessageSquare,  permission: 'mobile:read' },
    { labelKey: 'sidebar.fieldOpsNotifications', href: '/field-ops/notifications',icon: Bell,           permission: 'mobile:read' },
  ],
}
```

---

## State Management

| Data Type | Strategy | Reasoning |
|---|---|---|
| Orders list | React Query CSR | Auth-gated, changes frequently, React Query handles cache/stale |
| Order detail | React Query CSR | Deep fetch with multiple sub-resources |
| Work reports | React Query CSR | Manager polls; invalidation on approve/reject |
| Time entries | React Query CSR | Same pattern |
| Chat messages | React Query + WebSocket | Initial load via query; real-time updates via WebSocket event handler that calls `queryClient.setQueryData` |
| Notification count | React Query polled (60s) | No WebSocket for notifications — polling is acceptable |
| Slide-over open/close | Local `useState` | Not global; only one panel open at a time |
| Filter state | Local `useState` + URL search params | URL params allow link sharing / back-navigation |

**Redux rejected:** Zero need — React Query covers all server state; Context handles the one piece of cross-component UI state (if any).

---

## Error Handling

All errors flow through the existing `normalizeApiError()` in `lib/api/client.js`. Components handle three states:

1. **Loading** — skeleton placeholders matching the data shape (table skeleton for lists, card skeleton for details)
2. **Error** — inline error with retry button; uses existing `error-boundary.jsx` for unexpected JS errors
3. **Empty** — `field-ops-empty-state.jsx` with contextual message (e.g., "No reports submitted yet")

**Mutation errors:** Caught in `onError` of each mutation hook → `showError(err.message)` via existing toast system. Never surface raw API error text to users.

**Permission errors (403):** Redirect to `/403` page or show inline "You don't have permission to perform this action."

---

## Performance

- All list pages: `staleTime: 30_000` (30s) — field data changes on technician action, not constantly
- Report/time detail: `staleTime: 60_000` — approved status won't bounce
- Large lists (time entries, photos): virtualized with `@tanstack/react-virtual` if row count >200
- Photos: lazy-loaded thumbnails; full-res only on lightbox open
- Tab content: lazy-loaded with `dynamic()` from next/dynamic; only fetched on first tab activation
- Code splitting: each page is a separate chunk via Next.js App Router default behavior

---

## Security

- All requests carry JWT bearer token via existing request interceptor in `lib/api/client.js`
- Permission checks:
  - Sidebar items: gated on `mobile:read`
  - Override action: checked client-side (`usePermissions`) AND enforced server-side
  - Quotation prices: `quotation:view-prices` checked before rendering price columns
- No sensitive data stored client-side beyond what React Query caches in memory (cleared on unmount/GC)
- Photo annotation data and customer signatures rendered via `<img src=...>` — never as `innerHTML`

---

## i18n

All user-facing strings go through `useLanguage()` + `t()`. New keys to add to `lib/i18n/translations.js`:

```
sidebar.fieldOps, sidebar.fieldOpsOrders, sidebar.fieldOpsReports,
sidebar.fieldOpsTime, sidebar.fieldOpsChat, sidebar.fieldOpsNotifications,
fieldOps.orders.title, fieldOps.orders.empty, fieldOps.orders.filters.*,
fieldOps.reports.title, fieldOps.reports.approve, fieldOps.reports.reject,
fieldOps.reports.approveConfirm, fieldOps.reports.rejectNote,
fieldOps.time.title, fieldOps.time.release, fieldOps.time.releaseOverride,
fieldOps.time.overrideJustification, fieldOps.chat.title, fieldOps.chat.sendMessage,
fieldOps.notifications.title, fieldOps.notifications.markAllRead
```

---

## Acceptance Criteria

### Orders
- [ ] Table shows all orders with filters: date range, status, type, technician
- [ ] Status badge accurately reflects PLANNED / IN_PROGRESS / COMPLETED
- [ ] Order detail loads correct tabs; tabs are lazy-loaded
- [ ] Deep-linking to `/field-ops/orders/[id]` works directly

### Work Reports
- [ ] Reports table shows correct status for DRAFT / SUBMITTED / APPROVED
- [ ] Clicking a SUBMITTED report opens slide-over with full content
- [ ] Approve action changes status and closes panel; cache invalidated
- [ ] Reject action requires non-empty note; shows validation error otherwise
- [ ] Approve/Reject buttons disabled for non-SUBMITTED reports

### Time Entries
- [ ] Table shows all entries with correct release status
- [ ] Bulk release works for multiple selected PENDING entries
- [ ] Release blocked (with message) if associated work report not submitted
- [ ] Override requires justification text ≥ 20 chars
- [ ] Override only visible to users with `time:release:override` permission

### Chat
- [ ] Messages load on page mount
- [ ] New messages appear in real-time without refresh
- [ ] Sending a message appends it optimistically
- [ ] @-mentions highlight correctly

### Notifications
- [ ] Unread count shown in sidebar bell icon
- [ ] Click notification → navigate to correct entity
- [ ] Mark as read on click; mark all read button works

### Failure States
- [ ] API unavailable → error state with retry button (no blank screen)
- [ ] Slow API (>3s) → skeleton placeholders shown
- [ ] Partial data (report missing photos) → section shows empty state, not crash
- [ ] 403 on override → inline error, not page crash

---

## Files Changed

### New Files
| Path | Purpose |
|---|---|
| `app/(platform)/field-ops/layout.jsx` | Section layout with sub-nav |
| `app/(platform)/field-ops/page.jsx` | Redirect to orders |
| `app/(platform)/field-ops/orders/page.jsx` | Orders table page |
| `app/(platform)/field-ops/orders/[id]/page.jsx` | Order detail page |
| `app/(platform)/field-ops/reports/page.jsx` | Reports table page |
| `app/(platform)/field-ops/time/page.jsx` | Time entries page |
| `app/(platform)/field-ops/chat/[projectId]/page.jsx` | Chat page |
| `app/(platform)/field-ops/notifications/page.jsx` | Notifications page |
| `app/(platform)/field-ops/installations/[siteId]/page.jsx` | Installations page |
| `modules/field-ops/components/orders/*` | 4 order components |
| `modules/field-ops/components/reports/*` | 3 report components |
| `modules/field-ops/components/time/*` | 3 time components |
| `modules/field-ops/components/photos/*` | 2 photo components |
| `modules/field-ops/components/chat/*` | 3 chat components |
| `modules/field-ops/components/notifications/*` | 2 notification components |
| `modules/field-ops/components/catalog/*` | 2 catalog components |
| `modules/field-ops/components/installations/*` | 2 installation components |
| `modules/field-ops/hooks/use-field-ops-report-mutations.js` | Approve/reject report |
| `modules/field-ops/hooks/use-field-ops-time-mutations.js` | Release/override time |
| `modules/field-ops/hooks/use-field-ops-order-mutations.js` | Status update |
| `modules/field-ops/constants/field-ops-constants.js` | Enums, config |

### Modified Files
| Path | Change |
|---|---|
| `client/src/layout/sidebar.jsx` | Add Field Operations section |
| `client/src/lib/i18n/translations.js` | Add field-ops translation keys (de + en) |

### Unchanged (reused as-is)
| Path | Reused For |
|---|---|
| `modules/mobile/services/order-service.js` | Orders list/detail |
| `modules/mobile/services/report-service.js` | Report fetch |
| `modules/mobile/services/time-service.js` | Time entries |
| `modules/mobile/services/photo-service.js` | Photos |
| `modules/mobile/services/chat-service.js` | Chat messages |
| `modules/mobile/services/notification-service.js` | Notifications |
| `modules/mobile/services/catalog-service.js` | Catalog search |
| `modules/mobile/services/installation-service.js` | Installations |
| `modules/mobile/hooks/use-order-queries.js` | Order queries |
| `modules/mobile/hooks/use-report-queries.js` | Report queries |
| `modules/mobile/hooks/use-time-queries.js` | Time queries |
| `modules/mobile/hooks/use-photo-queries.js` | Photo queries |
| `modules/mobile/hooks/use-chat.js` | Chat + WebSocket |
| `modules/mobile/hooks/use-notification-queries.js` | Notifications |
| `modules/mobile/hooks/use-catalog.js` | Catalog |
| `modules/mobile/hooks/use-installation-queries.js` | Installations |
| `lib/api/endpoints.js` | MOBILE endpoints already complete |
| `lib/query/keys.js` | mobile query keys already complete |

---

## Verification

End-to-end test path:
1. Log in as manager (role with `mobile:read` + `mobile:write`)
2. Sidebar shows "Field Operations" section
3. Navigate to `/field-ops/orders` — table loads with today's orders
4. Click an IN_PROGRESS order → detail page loads; Reports tab shows submitted report
5. Click report → slide-over opens with work performed, materials, signature
6. Click Approve → status changes to APPROVED; slide-over closes; table row updates
7. Navigate to `/field-ops/time` — time entries listed; select a PENDING entry → Release → confirm
8. Navigate to `/field-ops/chat/[projectId]` — messages load; send a message → appears immediately
9. Bell icon in header shows unread count; click bell → `/field-ops/notifications` → click entry → navigates to order
