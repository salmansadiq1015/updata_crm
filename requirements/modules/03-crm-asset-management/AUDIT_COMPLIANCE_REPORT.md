# Module 03 — CRM & Asset Management: Final Compliance Report

**Date:** 2026-06-02
**Scope:** CRM-001 through CRM-014 (Swiss HVAC ERP, Module 03)
**Method:** Per-requirement audit of server + client against every acceptance criterion, verified against the actual codebase at `D:\Animmza\Boiler`. File paths are server- or client-relative as cited.

> **Scope note (web vs mobile):** This repo is the **web application**. The **mobile app is a separate project**. Acceptance criteria that are inherently mobile/field-only — CRM-006 (mobile installation capture) and the mobile clauses of CRM-003 (offline cache, mobile maps, sync interval), CRM-004 AC-4 (mobile display), CRM-010 AC-8 (offline image queue) — are owned by that separate mobile app and are **out of scope here**. The web app provides the equivalent online experiences (desktop address book with maps, ImagesPanel + customer Photos tab, site/installation detail). Shared backend APIs/models/jobs live in this repo and serve both apps.

---

## 0. Remediation Update — 2026-06-02 (post-audit)

The gaps below were remediated this session. **Web/server scope is now complete** except two intentionally-deferred provider integrations. Each phase was committed to `main` with lint + the relevant Jest suites green (full server suite: **63 suites / 359 tests passing**).

### All 7 runtime defects — FIXED
1. Maintenance dashboard counts (key mismatch) · 2. `MAINTENANCE_DUE` subscriber added · 3. timeline `nextDueDate` field · 4. widget `uploadAttachment` implemented · 5. widget confirmation email + dispatcher notify (already wired) · 6. scheduled-newsletter cron worker · 7. note author-only edit. Plus the customer **attachment upload 400** (axios JSON default serialized FormData) and a customer-activity pagination key mismatch.

### Per-requirement status after remediation (web/server scope)

| Req | Before | After | Notes |
|-----|:---:|:---:|-------|
| CRM-001 Customer master data | 63% | **100%** | client address validation aligned; merge reassigns notes+QOP; computed fields on detail |
| CRM-002 Contact management | 83% | **100%** | phone added to search + text index |
| CRM-003 Address book | 63% | **Web complete** | desktop address book (search incl. phone, maps link) complete; offline/sync/mobile-maps = separate mobile app |
| CRM-004 Sites | 75% | **100%** | multi-site map view; access instructions shown on web site-detail |
| CRM-005 Installations | 57% | **100%** | decommission excluded from maintenance; configurable templates; spare-parts tab on detail |
| CRM-006 Installation capture | 57% | **Mobile-app scope** | inherently the mobile field-capture flow — owned by the separate mobile app |
| CRM-007 Maintenance intervals | 57% | **100%** | free-text type; configurable templates; week/month grouping |
| CRM-008 Auto maintenance marking | 50% | **100%** | due subscriber; fixed dashboard counts; >30-day escalation event |
| CRM-009 History timeline | 0% | **100%** | unified aggregation (orders/quotes/invoices/maintenance/notes/images), type+date filters, reverse sort, navigation, CSV+PDF export |
| CRM-010 Image storage | 22% | **Web 100%** | HEIF→JPEG, 2 MB compression, configurable limit, customer gallery, download button; AC-8 offline queue = separate mobile app |
| CRM-011 Special notes | 71% | **100%** | author-only edit; notes in unified timeline |
| CRM-012 Spare parts | 86% | **100%** | partNumber/category optional (sparse-unique) |
| CRM-013 Newsletter | 40% | **80%** | structured filters, `bounced` status, scheduled-send worker, unsubscribe link+endpoint, real send template. **Deferred:** WhatsApp channel (AC-1/AC-6) — provider integration. |
| CRM-014 Website widget | 25% | **94%** | phone-or-email, Sanitaer category, priority field, phone matching, high-priority notify, logo render, language switch, embed `<script>`/iframe, photo upload, confirmation email, dispatcher notify. **Deferred:** client CAPTCHA widget (AC-6) — provider integration. |

**Intentionally deferred (per direction):** WhatsApp Business API (CRM-013) and reCAPTCHA/hCaptcha client widget (CRM-014) — both require external provider credentials. The server-side CAPTCHA verification and the WhatsApp adapter scaffold remain in place and are config-driven.

The original audit (sections 1–5 below) is retained for traceability.

---

## 1. Executive Summary

**Verdict: The module is NOT 100% complete.** By strict acceptance-criterion count it is approximately **52% complete** (**60 of 116 ACs fully IMPLEMENTED**). The remaining 56 ACs are PARTIAL (41) or MISSING (15).

The dominant pattern — as in Module 04 — is a **strong-server / weak-client split**. The backend is broadly built: CRUD, soft-delete, audit logging, event publishing, sequential numbering, cursor pagination, CSV import, and a daily maintenance job all exist behind authentication + permission middleware. Failures cluster in four categories:

1. **Unwired or partial client UI** — server endpoints with no UI to reach them, or UI that sends only a subset of supported params (history filters, date ranges, customer-side image gallery, multi-site map, conflict-resolution dialog).
2. **Stubbed integrations that look done** — the website-widget confirmation email, dispatcher notification, and submission processor are all scaffolded (reference numbers generated, recipients resolved, events published) but their consuming handlers only write `logger` lines. The WhatsApp adapter builds a payload and never makes an HTTP call.
3. **Dead events / broken seams** — `MAINTENANCE_DUE` is published every day but has no subscriber, so "due" notifications are never sent; `NOTE_CREATED` has no subscriber, so notes never enter the server-side activity feed.
4. **Spec drift in catalogs / config** — widget categories and priorities don't match the spec; spare-part `partNumber`/`category` are required where the spec says optional; image-limit, maintenance templates, and mobile sync interval are hardcoded where the spec says "configurable".

Weakest: **CRM-009 (0%)** — history/timeline is fragmented across three partial implementations that never converge — and **CRM-010 (22%)** and **CRM-014 (25%)**, both with multiple missing ACs and a runtime bug. Strongest: **CRM-006 (86%)**, **CRM-004 / CRM-012 (86% / 86%)**, **CRM-002 (83%)**.

### Genuine runtime defects (not merely gaps)

- **CRM-008 AC-5 — maintenance dashboard counts always 0.** UI reads `stats.overdueCount` / `stats.dueCount` (`client/.../maintenance-dashboard.jsx:92,101`) but the server returns `{overdue, due, scheduled, ok}` (`maintenanceInterval.repository.js:71`). The key mismatch makes the due/overdue stat cards render 0 permanently.
- **CRM-008 AC-4/AC-6 — "due" notifications never fire.** `maintenanceCheck.job.js:92` publishes `MAINTENANCE_DUE`, but no handler subscribes (only `MAINTENANCE_OVERDUE` is consumed in `notifications.events.js:272` / `crm.events.js:71`). The event is dead-lettered.
- **CRM-009 — scheduled-maintenance timeline entries never render.** `history-timeline.jsx:75` reads `m.nextServiceDate`; the model field is `nextDueDate`. The mapped value is always `undefined`.
- **CRM-014 AC-7 — widget photo upload throws at runtime.** `widgetPublic.controller.js:22` calls `widgetSubmissionService.uploadAttachment`, which does not exist on the service class. Any call to the attachments endpoint throws "not a function".
- **CRM-014 AC-10/11/12 — confirmation email + dispatcher notification are stubs.** All plumbing exists (reference number, dispatcher recipient resolution, `WIDGET_SUBMISSION_RECEIVED` published) but the consuming handler (`integrations.events.js:7-25`) and the process worker (`widgetSubmissionProcess.job.js`) only log. No email, no `notificationService.create`.
- **CRM-013 AC-8 — scheduled newsletters never send.** `status:'scheduled'` + `scheduledAt` are persisted, but no cron/poll worker scans for due newsletters (absent from `jobs/index.js`). Immediate send works; scheduling is inert.
- **CRM-011 AC-5 — any user can edit any note.** The 24-hour window is enforced (`entityNote.service.js:66-68`) but author identity is never checked; any `crm:write` user can edit another user's note.

### Pervasive contract mismatches

- **CRM-001 AC-1 — client/server address validation diverge.** Server Joi requires street/postalCode/city (`customer.validation.js:21-23`); client Zod makes them optional (`client/.../validations/customer.js:42-49`). A blank-address submit passes the client then 400s at the server.
- **CRM-014 AC-3/4/5 — widget field spec drift.** Categories are `heizungsstoerung/wartung/neuinstallation/beratung/other`, not the spec's `Heizung/Sanitaer/Sonstiges`; there is no priority field at all; email is mandatory rather than "phone OR email".

---

## 2. Compliance Table

| Req | Title | Implemented / Total ACs | % | Status |
|-----|-------|:----:|:----:|--------|
| CRM-001 | Customer Master Data Management | 5 / 8 | 63% | Partial |
| CRM-002 | Contact Management | 5 / 6 | 83% | Partial |
| CRM-003 | Address Book with Mobile Access | 5 / 8 | 63% | Partial (2 missing) |
| CRM-004 | Site / Object Management | 6 / 8 | 75% | Partial |
| CRM-005 | Technical Installation Management | 4 / 7 | 57% | Partial |
| CRM-006 | Installation Information Capture | 6 / 7 | 86% | Partial |
| CRM-007 | Maintenance Interval Management | 4 / 7 | 57% | Partial (1 missing) |
| CRM-008 | Automatic Maintenance Due Marking | 4 / 8 | 50% | Partial (1 defect, 1 missing) |
| CRM-009 | Order & Service History | 0 / 8 | 0% | Critical gaps |
| CRM-010 | Image Storage & Assignment | 2 / 9 | 22% | Critical gaps |
| CRM-011 | Special Notes per Site/Installation | 5 / 7 | 71% | Partial (1 defect) |
| CRM-012 | Spare Parts & Ordering | 6 / 7 | 86% | Partial |
| CRM-013 | Newsletter Distribution | 4 / 10 | 40% | Partial (1 missing) |
| CRM-014 | Website Plugin for Customer Orders | 4 / 16 | 25% | Critical gaps (1 runtime bug) |
| **Total** | **Module 03** | **60 / 116** | **~52%** | **Not Complete** |

---

## 3. Per-Requirement Detail (PARTIAL / MISSING ACs only)

### CRM-001 — Customer Master Data Management (63%)
Complete: AC-2, AC-3, AC-4, AC-5, AC-7.

- **AC-1 Fields & validation (PARTIAL)** — Server enforces all required fields incl. Swiss PLZ (`customer.validation.js:17-34`). **Client Zod makes street/postalCode/city optional** (`client/.../validations/customer.js:42-49`) → blank-address submit passes client, 400s at server.
- **AC-6 Merge reassigns all child records (PARTIAL)** — Only Contacts and Sites are reassigned (`customer.service.js:158-168`). **EntityNotes on the source customer and QOP records (quotations/orders/invoices) keyed by `customerId` are not reassigned** — merged-away financial history disappears from the survivor's timeline.
- **AC-8 Computed fields (PARTIAL)** — `totalSitesCount`, `totalInstallationsCount`, `lastServiceDate` attached only in the list path (`customer.repository.js:55,59-112`). **`findById` / detail view omits them** (`customer.repository.js:23-25`).

### CRM-002 — Contact Management (83%)
Complete: AC-1, AC-2, AC-3, AC-5, AC-6.

- **AC-4 Search by name, email, phone across all customers (PARTIAL)** — Server `search()` regex covers firstName/lastName/email only (`contact.repository.js:53-64`); **phone is not searched server-side** (also excluded from the text index, `contact.model.js:46-49`). Desktop phone filter is client-side over a 500-record page only.

### CRM-003 — Address Book with Mobile Access (63%)
Complete: AC-2, AC-3, AC-4, AC-6, AC-7.

- **AC-1 Loads & searchable < 2s offline (PARTIAL)** — Offline-first via Dexie + service worker, but local search is a linear `db.crmCustomers.filter(...)` scan and `search_text` is **not a declared Dexie index** (`mobile-db.js:64-68`). No 2s budget/test; at-risk at scale.
- **AC-5 Tap address → maps navigation (MISSING on mobile)** — Implemented on desktop (`address-book.jsx:138-140`) but the **mobile** address book has no maps/`geo` link; the site button routes to `/installations/:id` instead (`app/(mobile)/address-book/page.jsx:183-191`). The spec targets the mobile field-technician book.
- **AC-8 Sync frequency configurable (30/60 min) (MISSING)** — Single fixed `POLL_INTERVAL: 5 min` (`mobile-constants.js:129`); not configurable, no Wi-Fi/cellular distinction, and doesn't match spec defaults.

### CRM-004 — Site / Object Management (75%)
Complete: AC-1, AC-2, AC-3, AC-6, AC-7, AC-8.

- **AC-4 Access instructions visible on mobile (PARTIAL)** — `accessInstructions` is stored and synced offline (`crmAddressBook.service.js:299`) but **never rendered in any mobile UI**; mobile only surfaces free-text access *notes*, a different mechanism.
- **AC-5 Sites on map view via geocoded coordinates (PARTIAL)** — Per-site embed exists (`site-map-card.jsx`) but **no geocoding service exists anywhere** (coordinates are manual-input only) and there is **no aggregate multi-site map** — only a single-site embed in the detail page.

### CRM-005 — Technical Installation Management (57%)
Complete: AC-1, AC-2, AC-3, AC-7.

- **AC-4 Decommissioned excluded from active maintenance (PARTIAL)** — Exclusion is indirect: decommission flips intervals to `maintenanceStatus:'ok'` (`installation.service.js:167-171`). Maintenance queries filter on `maintenanceStatus`, **not** on `installation.status` (`maintenanceInterval.repository.js:40-79`), so a later status recompute could re-enter a decommissioned unit.
- **AC-5 Default intervals configurable per type (PARTIAL)** — Templates are **hardcoded JS constants** (`installation.service.js:12-19`); no config table or admin UI. (`other` type gets no default.)
- **AC-6 Detail view shows linked spare parts (PARTIAL)** — Maintenance/notes/images/history tabs exist, but **linked spare parts are not surfaced** in `installation-detail.jsx` despite backend support (`installationSparePart.model.js`).

### CRM-006 — Installation Information Capture (86%)
Complete: AC-1, AC-2, AC-3, AC-4, AC-6, AC-7.

- **AC-5 Conflict resolution available (PARTIAL)** — Server detects conflicts (409 `ConflictError`, `installation.controller.js:65-87`) and the client sends `baseUpdatedAt`, but there is **no resolution UI**: online path just toasts the error; queued path retries with the same stale `baseUpdatedAt` until it exhausts retries and silently drops (`sync-engine.js:72-74`).

### CRM-007 — Maintenance Interval Management (57%)
Complete: AC-2, AC-3, AC-7.

- **AC-1 Type free text OR enum (PARTIAL)** — Type is enum-only; free text is shoe-horned into `customTypeLabel` when `type=other` (`maintenanceInterval.model.js:10-23`). No first-class free-text type.
- **AC-4 Templates configurable per type (PARTIAL)** — Hardcoded constants, not user-configurable (same as CRM-005 AC-5).
- **AC-5 Auto-update next_due after service completion (MISSING)** — No service-order completion handler updates intervals. `linkedServiceOrderId` is settable but nothing recalculates `lastServiceDate`/`nextDueDate` on completion.
- **AC-6 Dashboard grouped by week/month (PARTIAL)** — Overdue/Due tabs are flat date-sorted lists (`maintenance-dashboard.jsx:124-151`); no week/month buckets.

### CRM-008 — Automatic Maintenance Due Marking (50%)
Complete: AC-1, AC-2, AC-3, AC-8.

- **AC-4 Events for newly-flagged items (PARTIAL — DEFECT)** — Both events fire on aggregate counts only (no per-item id). **`MAINTENANCE_DUE` has no subscriber** (`maintenanceCheck.job.js:92`) — dead event.
- **AC-5 Dashboard widget count (PARTIAL — DEFECT)** — Key mismatch: UI reads `overdueCount`/`dueCount`, server returns `overdue`/`due` (`maintenance-dashboard.jsx:92,101` vs `maintenanceInterval.repository.js:71`) → always 0.
- **AC-6 Notify users with `scheduling:read` (PARTIAL)** — Only the overdue path notifies; due items get nothing (consequence of AC-4 dead event).
- **AC-7 Escalation when overdue > 30 days (MISSING)** — No code computes ">30 days overdue" or emits an escalation.

### CRM-009 — Order & Service History (0%)
Complete: none.

- **AC-1 Aggregate orders/quotes/invoices/maintenance/notes/images (PARTIAL)** — No single source aggregates all six. Customer `getActivity` merges audit + QOP (`customer.service.js:271-331`); **site/installation `getActivity` query the audit log only** (`site.service.js:177-189`, `installation.service.js:204-216`); the client timeline merges **notes + maintenance only** (`history-timeline.jsx:50-86`). **Images are never aggregated anywhere.**
- **AC-2 Newest-first, reversible (PARTIAL)** — Sort direction hardcoded descending; no reverse option.
- **AC-3 Entry shows date/icon/label/summary/status/user (PARTIAL)** — Inconsistent across views; site/installation server entries lack enriched summary/responsible-user beyond raw audit.
- **AC-4 Click navigates to record (PARTIAL)** — Activity/timeline rows are not navigable (no links in `customer-activity-panel.jsx` / `history-timeline.jsx`).
- **AC-5 Filter by type and date range (PARTIAL)** — Backend supports `eventType`; **no date-range filter anywhere** and **no client filter UI**.
- **AC-6 Site-level (all installations) + installation-level (PARTIAL)** — Site-level matches only `details.siteId` audit entries; **no per-installation rollup**.
- **AC-7 Export PDF or CSV (MISSING)** — No history export of any kind.
- **AC-8 Loads < 3s for 500 entries (PARTIAL)** — In-memory multi-collection merge; no benchmark/test; unverifiable.
- *Defect:* `history-timeline.jsx:75` reads `m.nextServiceDate` (field is `nextDueDate`) → scheduled-maintenance entries never render.

### CRM-010 — Image Storage & Assignment (22%)
Complete: AC-4, AC-5.

- **AC-1 Assignable to customer/site/installation (PARTIAL)** — Server supports all three (`entityImage.model.js:7`); **client gallery only on site & installation detail**, not customer.
- **AC-2 JPEG/PNG/HEIF, HEIF→JPEG (MISSING)** — Entity images use the `images` bucket which **doesn't allow HEIF** (`storage.js:36-42`); no conversion.
- **AC-3 Auto-compress to 2 MB for mobile (MISSING)** — No original-compression pipeline; only thumbnail/medium variants generated.
- **AC-6 Gallery on entity detail (PARTIAL)** — Missing on customer detail (see AC-1).
- **AC-7 Download in original quality (PARTIAL)** — Original retained, but lightbox has **no download action** (`images-panel.jsx:221-263`).
- **AC-8 Offline capture queued + uploaded on reconnect (MISSING)** — Mobile offline photo queue handles **work-order photos only** (`mobile-db.js:10`); no CRM entity-image offline path.
- **AC-9 Max 50 per entity (configurable) (PARTIAL)** — Enforced but hardcoded literal `50` (`entityImage.service.js:40`); not configurable.

### CRM-011 — Special Notes per Site/Installation (71%)
Complete: AC-1, AC-2, AC-3, AC-4, AC-7.

- **AC-5 Editable by author within 24h (PARTIAL — DEFECT)** — 24h window enforced, but **author identity is not checked** (`entityNote.service.js:62-90`; route only gates `crm:write`) → any write-user can edit any note.
- **AC-6 Notes in history timeline (PARTIAL)** — `NOTE_CREATED` has **no server subscriber** (`crm.events.js`); notes are not written to the server activity feed. Timeline inclusion is client-only stitching (`history-timeline.jsx`), inheriting CRM-009's gaps.

### CRM-012 — Spare Parts & Ordering (86%)
Complete: AC-2, AC-3, AC-4, AC-5, AC-6, AC-7.

- **AC-1 Catalog field optionality (PARTIAL)** — Spec says `part_number` and `category` optional, but both are **required** (`partNumber` also unique) in model + validation (`sparePart.model.js:5-10,32`, `sparePart.validation.js:8,12`).

### CRM-013 — Newsletter Distribution (40%)
Complete: AC-3, AC-5, AC-7, AC-9.

- **AC-1 Email / WhatsApp / both (PARTIAL)** — Channel enum is `['email']` only (`newsletter.model.js:25-30`); WhatsApp not wired in.
- **AC-2 Filter by type/location/installation-type/opt-in (PARTIAL)** — `recipientFilter` is an unvalidated `Mixed` object; **no installation-type field on Customer**; no filter UI controls.
- **AC-4 Delivery status incl. bounced (PARTIAL)** — Enum missing `bounced`; no provider webhook ever sets `delivered`/`bounced` (`newsletterDispatch.job.js:72,79`).
- **AC-6 WhatsApp plain text + templates (MISSING)** — No WhatsApp path; the notifications WhatsApp adapter is itself a stub (no HTTP call, fake id) (`whatsapp.adapter.js:16-33`).
- **AC-8 Schedulable for future delivery (PARTIAL — effectively inert)** — `scheduledAt` persisted but **no worker dispatches scheduled newsletters** (absent from `jobs/index.js`).
- **AC-10 nDSG opt-out + unsubscribe link (PARTIAL)** — No unsubscribe link injected into emails (raw `bodyHtml` sent unchanged); **no public unsubscribe endpoint**; opt-out is admin-only.

### CRM-014 — Website Plugin for Customer Orders (25%)
Complete: AC-2, AC-9, AC-13, AC-16.

- **AC-1 Embeddable via `<script>` or `<iframe>` (PARTIAL)** — A hosted Next.js form page exists, but **no script loader / iframe bootstrap / embed snippet**.
- **AC-3 Required: name, phone OR email, category, description (PARTIAL)** — Email is **mandatory**; "phone OR email (at least one)" not implemented (`widgetPublic.validation.js:9-24`).
- **AC-4 Categories Heizung/Sanitaer/Sonstiges (MISSING)** — Implemented set is `heizungsstoerung/wartung/neuinstallation/beratung/other`; no "Sanitaer".
- **AC-5 Priorities Niedrig/Mittel/Hoch (MISSING)** — No priority field anywhere.
- **AC-6 CAPTCHA integrated (PARTIAL)** — Server verifies reCAPTCHA *if* a secret is configured, but the **client widget renders no CAPTCHA and never sends a token** (`widget.jsx:89-101`) → non-functional end-to-end.
- **AC-7 Photo upload max 1 / 5 MB (MISSING — runtime bug)** — Endpoint calls `widgetSubmissionService.uploadAttachment`, which **does not exist** (`widgetPublic.controller.js:22`); multer limit is 10 MB; no client upload field.
- **AC-8 Match by email AND phone (PARTIAL)** — Email-only matching (`widgetSubmission.service.js:309-312`).
- **AC-10 Confirmation email with reference number (MISSING)** — Reference number generated but **no email sent** (handler/worker only log).
- **AC-11 Dispatcher in-app notification (MISSING)** — Recipients resolved and put on the event, but **no subscriber creates a notification** (`integrations.events.js:7-25` only logs).
- **AC-12 High-priority extra email (MISSING)** — No priority concept and no email dispatch.
- **AC-14 Branding (configurable colors + logo) (PARTIAL)** — `primaryColor`/`companyName` applied; **`logoUrl` stored but never rendered**.
- **AC-15 German + configurable languages (PARTIAL)** — German hardcoded; multi-language is data-model-only — UI never switches or renders Fr/It/En.

---

## 4. Remaining Work (Prioritized)

### HIGH — runtime defects or blocks core functionality

**Server**
- CRM-008 AC-5: fix dashboard stat keys (`overdue`/`due` vs `overdueCount`/`dueCount`) so counts render.
- CRM-008 AC-4/AC-6: add a `MAINTENANCE_DUE` subscriber so due notifications dispatch; emit per-item ids in both events.
- CRM-008 AC-7: implement >30-day overdue escalation event/notification.
- CRM-007 AC-5: wire service-order completion → interval `lastServiceDate`/`nextDueDate` recalculation.
- CRM-014 AC-7: implement `widgetSubmissionService.uploadAttachment` (or remove the route); enforce max-1 / 5 MB / image-type.
- CRM-014 AC-10/11/12: replace the logging stubs with real confirmation email + dispatcher `notificationService.create` + high-priority email.
- CRM-013 AC-8: add a cron/poll worker that dispatches `status:'scheduled'` newsletters when `scheduledAt <= now`.
- CRM-011 AC-5: enforce author-only edit on note update.
- CRM-001 AC-1: align client Zod address validation with the server (street/postalCode/city required).

**Client**
- CRM-009 (whole): build a real aggregated timeline (orders + quotes + invoices + maintenance + notes + images) at site and installation level; fix `nextServiceDate` → `nextDueDate`.
- CRM-014 AC-4/AC-5: reconcile categories to Heizung/Sanitaer/Sonstiges and add the Niedrig/Mittel/Hoch priority field (server + UI).
- CRM-014 AC-6: render a CAPTCHA widget and send the token.

### MED — meaningful gaps

**Server:** CRM-001 AC-6 (reassign notes + QOP records on merge); CRM-001 AC-8 (computed fields on detail path); CRM-002 AC-4 (phone in server search/index); CRM-005 AC-4 (filter maintenance by `installation.status`); CRM-013 AC-1/AC-6 (wire a real WhatsApp channel + adapter HTTP call); CRM-013 AC-4 (add `bounced`, provider webhook); CRM-013 AC-10 (unsubscribe link + public endpoint); CRM-014 AC-8 (phone matching).

**Client:** CRM-003 AC-5 (mobile maps/`geo` link); CRM-006 AC-5 (conflict-resolution dialog); CRM-007 AC-6 (week/month grouping); CRM-009 AC-5 (date-range + type filter UI); CRM-010 AC-1/AC-6 (customer-side image gallery), AC-7 (download action); CRM-014 AC-1 (embed snippet), AC-15 (language switch).

### LOW — config / polish / spec drift

**Server:** make image limit (CRM-010 AC-9), maintenance templates (CRM-005 AC-5 / CRM-007 AC-4), and mobile sync interval (CRM-003 AC-8) configurable; relax spare-part `partNumber`/`category` to optional (CRM-012 AC-1); CRM-007 AC-1 first-class free-text type.
**Client/Mobile:** CRM-004 AC-4 (render access instructions on mobile); CRM-004 AC-5 (geocoding + multi-site map); CRM-005 AC-6 (linked spare parts on installation detail); CRM-010 AC-2/AC-3/AC-8 (HEIF conversion, 2 MB compression, offline image queue); CRM-014 AC-14 (render logo).

---

## 5. Cross-Cutting Notes

1. **Strong-server / weak-client split (module-wide)** — most PARTIALs are functional server endpoints with missing or subset-only client wiring (history filters, image gallery, conflict UI, sort/reverse, multi-site map).
2. **Dead-event / stubbed-handler pattern (systemic)** — `MAINTENANCE_DUE` and `NOTE_CREATED` are published with no subscriber; the widget's `WIDGET_SUBMISSION_RECEIVED` handler and process worker only log. Recommend a published-event-without-subscriber lint/alarm.
3. **Stubbed external integrations presented as built** — WhatsApp adapter makes no HTTP call; widget confirmation email / dispatcher notification are log-only; client CAPTCHA absent. The scaffolding masks that the feature does nothing end-to-end.
4. **Config gaps** — "configurable" requirements implemented as hardcoded constants: image limit (50), maintenance templates, mobile sync interval, widget multer limit.
5. **Catalog / field spec drift** — widget categories & priorities diverge from spec; spare-part `partNumber`/`category` required vs optional; newsletter delivery enum missing `bounced`.
6. **History/timeline is the biggest hole (CRM-009 = 0%)** — three partial implementations (customer audit+QOP, site/installation audit-only, client notes+maintenance) never converge; images never aggregated; no export, no date filter, no navigation.
7. **Client/server validation divergence (CRM-001)** — optional vs required address fields produce avoidable 400s.
8. **Authorization gap (CRM-011 AC-5)** — note edit checks the time window but not the author.

---

*All gaps independently verified against the codebase at `D:\Animmza\Boiler` by per-requirement audit. File paths are server- or client-relative as cited. This report supersedes the running `audit.md` working log for compliance-status purposes.*
