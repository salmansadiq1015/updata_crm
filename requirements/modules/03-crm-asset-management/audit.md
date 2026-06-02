# Module 03: CRM & Asset Management -- Audit

Last updated: 2026-06-02

> **2026-06-02 remediation:** Web/server scope brought to completion (except WhatsApp + client CAPTCHA, intentionally deferred as external-provider integrations). All 7 runtime defects fixed; the customer attachment upload 400 fixed. Mobile-only ACs (CRM-006, and the mobile clauses of CRM-003/004/010) are owned by the **separate mobile app** — this repo is the web application. Full server suite: 63 suites / 359 tests green. See `AUDIT_COMPLIANCE_REPORT.md` (section 0) for the per-requirement remediation table.

## Current Slice: CRM Mobile Installation Capture/OCR

### Completed

- Customer creation now surfaces duplicate warnings while still allowing creation, matching the requirement that duplicate detection warns instead of blocking.
- Customer create validation now requires street, Swiss postal code, and city.
- Customer list records now include page-scoped computed fields:
  - `totalSitesCount`
  - `totalInstallationsCount`
  - `lastServiceDate`
- Customer merge is covered by regression tests for contact/site reassignment and source archival.
- Contact primary behavior is covered by regression tests ensuring exactly one primary contact per customer.
- Site create now rejects archived customers.
- Site create validation now requires street, Swiss postal code, and city.
- Site deactivation now cascades active installations to decommissioned state and clears their maintenance status instead of leaving active maintenance under an inactive site.
- Installation create validation now requires manufacturer and model.
- Installation creation now applies default maintenance interval templates by installation type.
- Maintenance interval creation now uses the installation commissioning date when no last service date exists.
- Maintenance check job idempotency is covered: due/overdue transitions publish events once and repeat runs do not re-update the same intervals.
- CRM route permission guards are covered by regression tests against the shared seeded permission constants.
- Special note 24-hour edit immutability is covered by regression tests.
- Image max-50-per-entity enforcement is covered by regression tests.
- Spare-part CSV import is implemented with row validation, duplicate detection, optional upsert, audit logging, and regression coverage.
- Maintenance auto-marking now skips intervals already linked to service work, preventing duplicate due/overdue work creation.
- Maintenance auto-marking now has regression coverage for runtime configurable lookahead days.
- Maintenance due/overdue events now target active users whose role has `scheduling:read`.
- Maintenance overdue event dispatch is now covered end-to-end through the notification event handler.
- Website widget submissions now persist the validated public payload shape, enforce same-email/request duplicate blocking, use nested CAPTCHA config, create/link CRM customer/contact records, create a CRM service-request note, and cap public route rate limiting at 20/IP/hour.
- Widget admin list/detail/config controller methods now call the actual service API and pass a resolved widget ID.
- Website widget submission events now carry CRM linkage and dispatcher recipients for notification dispatch.
- Mobile sync now returns a compact offline CRM address book payload with customer, contact, site, installation, and tombstone deltas.
- Mobile Dexie storage now caches CRM customers, contacts, sites, and installations for offline field access.
- Mobile address book UI is available under the technician app with offline search, one-tap phone/email actions, and links into cached site installations.
- Mobile installation queries now read/write the shared offline CRM installation cache instead of returning empty offline results.
- Mobile installation capture now supports create/update through mobile routes, offline queueing, stale-update conflict detection, and barcode/QR serial-number scanning in the field form.
- Mobile installation capture now supports compressed nameplate photo capture/upload, offline nameplate blob retention, and sync-time upload to the installation image archive.
- Mobile photo compression now targets a 2 MB compressed size for field uploads, matching the CRM-006 default compression requirement.
- Mobile nameplate OCR now has a provider-ready server endpoint with local text fallback, structured extraction for manufacturer/model/serial/power/year/fuel, and low-confidence field reporting.
- Mobile installation capture now runs OCR opportunistically when online and pre-fills empty fields without overwriting technician-entered values.
- Installation-linked spare parts now support "needs ordering" flags with quantity, urgency, notes, audit logging, and mobile endpoints.
- Mobile technicians now have an installation spare-parts screen for catalog search, linking parts to an installation, and flagging linked parts for ordering.
- Spare-part order requests now publish explicit order-request/status events, appear in a procurement dashboard, support requested/ordered/received/cancelled status transitions, and increment catalog stock when received.
- The platform sidebar now exposes the CRM procurement dashboard for finance/procurement users with `crm:read`.
- Mobile sync now includes CRM warning/pinned notes for customer, site, and installation address-book context, including note tombstones.
- Mobile offline sync now accepts queued CRM note creates through both the full-sync contract and a dedicated mobile note endpoint.
- CRM note creation now rejects missing customer/site/installation targets before writing audit/events.
- Mobile Dexie storage now caches CRM notes with compound entity indexes and cascades note cleanup when parent CRM entities are tombstoned.
- Mobile installation context now surfaces site and installation warning notes offline and allows technicians to add site/installation notes that queue when offline.

### Verification

- `server`: `npx.cmd eslint src\modules\crm\customer.repository.js src\modules\crm\customer.service.js src\modules\crm\customer.validation.js src\modules\crm\site.service.js src\modules\crm\site.validation.js src\modules\crm\installation.service.js src\modules\crm\installation.validation.js src\modules\crm\maintenanceInterval.service.js src\jobs\maintenanceCheck.job.js tests\unit\crm.test.js`
  - Result: passed.
- `server`: `node --experimental-vm-modules node_modules\jest\bin\jest.js --passWithNoTests --runTestsByPath tests\unit\crm.test.js --runInBand`
  - Result: 1 suite passed, 29 tests passed.
- `server`: `npx.cmd eslint src\modules\integrations\widgetSubmission.service.js src\modules\integrations\widgetSubmission.repository.js src\modules\integrations\widgetSubmission.model.js src\modules\integrations\widgetConfig.model.js src\modules\integrations\widgetPublic.routes.js src\modules\integrations\widgetAdmin.controller.js src\modules\integrations\widgetAdmin.validation.js src\modules\notifications\notifications.events.js src\modules\crm\contact.model.js tests\unit\integrations.widgetSubmission.test.js`
  - Result: passed.
- `server`: `node --experimental-vm-modules node_modules\jest\bin\jest.js --passWithNoTests --runTestsByPath tests\unit\integrations.widgetSubmission.test.js --runInBand`
  - Result: 1 suite passed, 4 tests passed.
- `server`: `node --experimental-vm-modules node_modules\jest\bin\jest.js --passWithNoTests --runTestsByPath tests\unit\crm.test.js tests\unit\integrations.widgetSubmission.test.js --runInBand`
  - Result: 2 suites passed, 33 tests passed.
- `server`: `npx.cmd eslint src\modules\notifications\notifications.events.js tests\unit\notifications.maintenanceEvents.test.js`
  - Result: passed.
- `server`: `node --experimental-vm-modules node_modules\jest\bin\jest.js --passWithNoTests --runTestsByPath tests\unit\notifications.maintenanceEvents.test.js --runInBand`
  - Result: 1 suite passed, 2 tests passed.
- `server`: `npx.cmd eslint src\modules\mobile\crmAddressBook.service.js src\modules\mobile\sync.service.js src\modules\mobile\sync.validation.js tests\unit\mobile.crmAddressBook.test.js`
  - Result: passed.
- `server`: `node --experimental-vm-modules node_modules\jest\bin\jest.js --passWithNoTests --runTestsByPath tests\unit\mobile.crmAddressBook.test.js --runInBand`
  - Result: 1 suite passed, 3 tests passed.
- `client`: `npx.cmd eslint src/modules/mobile/db/mobile-db.js src/modules/mobile/lib/sync-engine.js src/modules/mobile/services/crm-address-book-service.js src/modules/mobile/hooks/use-crm-address-book.js src/modules/mobile/services/installation-service.js src/modules/mobile/hooks/use-installation-queries.js src/modules/mobile/components/bottom-nav.jsx "src/app/(mobile)/address-book/page.jsx"`
  - Result: passed.
- `server`: `npx.cmd eslint src\modules\mobile\installation.controller.js src\modules\mobile\installation.routes.js src\modules\mobile\installation.validation.js src\modules\mobile\sync.service.js src\modules\mobile\sync.validation.js tests\unit\mobile.crmAddressBook.test.js`
  - Result: passed.
- `server`: `node --experimental-vm-modules node_modules\jest\bin\jest.js --passWithNoTests --runTestsByPath tests\unit\mobile.crmAddressBook.test.js --runInBand`
  - Result: 1 suite passed, 5 tests passed.
- `server`: `node --experimental-vm-modules node_modules\jest\bin\jest.js --passWithNoTests --runTestsByPath tests\unit\mobile.crmAddressBook.test.js`
  - Result: 1 suite passed, 9 tests passed.
- `server`: `npx.cmd eslint src/modules/crm/entityNote.service.js src/modules/mobile/crmAddressBook.service.js src/modules/mobile/mobile.routes.js src/modules/mobile/note.routes.js src/modules/mobile/note.validation.js src/modules/mobile/sync.service.js src/modules/mobile/sync.validation.js`
  - Result: passed.
- `client`: `npm.cmd run lint -- 'src/app/(mobile)/installations/[siteId]/page.jsx' src/modules/mobile/hooks/use-crm-notes.js src/modules/mobile/services/crm-note-service.js src/modules/mobile/lib/sync-engine.js src/modules/mobile/db/mobile-db.js src/lib/api/endpoints.js src/modules/mobile/constants/mobile-constants.js`
  - Result: passed.
- `server`: `npx.cmd eslint src/modules/mobile/nameplateOcr.service.js src/modules/mobile/installation.controller.js src/modules/mobile/installation.routes.js tests/unit/mobile.crmAddressBook.test.js`
  - Result: passed.
- `client`: `npx.cmd eslint src/lib/api/endpoints.js src/modules/mobile/services/installation-service.js src/modules/mobile/hooks/use-nameplate-ocr.js "src/app/(mobile)/installations/[siteId]/capture/page.jsx"`
  - Result: passed.
- `server`: `node --experimental-vm-modules node_modules\jest\bin\jest.js --passWithNoTests --runTestsByPath tests\unit\mobile.crmAddressBook.test.js --runInBand`
  - Result: 1 suite passed, 6 tests passed.
- `server`: `npx.cmd eslint src/modules/crm/installationSparePart.model.js src/modules/crm/sparePart.repository.js src/modules/crm/sparePart.service.js src/modules/crm/sparePart.controller.js src/modules/crm/sparePart.routes.js src/modules/crm/sparePart.validation.js src/modules/mobile/sparePart.routes.js src/modules/mobile/mobile.routes.js tests/unit/crm.test.js`
  - Result: passed.
- `client`: `npx.cmd eslint src/lib/api/endpoints.js src/modules/mobile/services/spare-part-service.js src/modules/mobile/hooks/use-spare-parts.js "src/app/(mobile)/installations/[siteId]/spare-parts/page.jsx" "src/app/(mobile)/installations/[siteId]/page.jsx"`
  - Result: passed.
- `client`: `npx.cmd eslint "src/app/(mobile)/installations/[siteId]/spare-parts/page.jsx"`
  - Result: passed.
- `server`: `node --experimental-vm-modules node_modules\jest\bin\jest.js --passWithNoTests --runTestsByPath tests\unit\crm.test.js --runInBand`
  - Result: 1 suite passed, 31 tests passed.
- `server`: `npx.cmd eslint src/shared/events/eventTypes.js src/modules/crm/installationSparePart.model.js src/modules/crm/sparePart.repository.js src/modules/crm/sparePart.service.js src/modules/crm/sparePart.controller.js src/modules/crm/sparePart.routes.js src/modules/crm/sparePart.validation.js tests/unit/crm.test.js`
  - Result: passed.
- `client`: `npx.cmd eslint src/lib/api/endpoints.js src/lib/query/keys.js src/modules/crm/services/spare-part-service.js src/modules/crm/hooks/use-spare-part-mutations.js src/modules/crm/components/spare-part-procurement-dashboard.jsx "src/app/(platform)/crm/spare-parts/procurement/page.js"`
  - Result: passed.
- `server`: `node --experimental-vm-modules node_modules\jest\bin\jest.js --passWithNoTests --runTestsByPath tests\unit\crm.test.js --runInBand`
  - Result: 1 suite passed, 32 tests passed.
- `client`: `npx.cmd eslint src/layout/sidebar.jsx src/lib/i18n/translations.js src/modules/crm/components/spare-part-procurement-dashboard.jsx "src/app/(platform)/crm/spare-parts/procurement/page.js"`
  - Result: passed with one existing sidebar hydration warning (`react-hooks/set-state-in-effect`).
- `client`: `npx.cmd eslint src/modules/mobile/constants/mobile-constants.js src/modules/mobile/lib/sync-engine.js src/modules/mobile/services/installation-service.js src/modules/mobile/hooks/use-installation-mutations.js src/modules/mobile/validations/installation.js src/modules/mobile/hooks/use-installation-queries.js "src/app/(mobile)/installations/[siteId]/page.jsx" "src/app/(mobile)/installations/[siteId]/capture/page.jsx"`
  - Result: passed.
- `server`: `npx.cmd eslint src\modules\mobile\installation.controller.js src\modules\mobile\installation.routes.js src\modules\mobile\sync.service.js src\modules\mobile\sync.validation.js tests\unit\mobile.crmAddressBook.test.js`
  - Result: passed.
- `client`: `npx.cmd eslint src/lib/api/endpoints.js src/modules/mobile/constants/mobile-constants.js src/modules/mobile/lib/photo-utils.js src/modules/mobile/lib/nameplate-utils.js src/modules/mobile/lib/sync-engine.js src/modules/mobile/services/installation-service.js src/modules/mobile/hooks/use-installation-mutations.js "src/app/(mobile)/installations/[siteId]/capture/page.jsx"`
  - Result: passed.
- `server`: `node --experimental-vm-modules node_modules\jest\bin\jest.js --passWithNoTests --runTestsByPath tests\unit\mobile.crmAddressBook.test.js --runInBand`
  - Result: 1 suite passed, 5 tests passed.

## Requirement Coverage Snapshot

| Requirement | Status | Notes |
| --- | --- | --- |
| CRM-001 Customer master data | Partial | CRUD, archive, merge, sequential numbering, duplicate warning, filters, computed list fields, and route/seed permission guard coverage are implemented/covered. Remaining: client workflow validation. |
| CRM-002 Contact management | Partial | Contact CRUD exists, primary-contact invariant is covered, and contacts are exposed in the mobile offline address book. Remaining: delete-primary UX flow. |
| CRM-003 Mobile address book | Covered (local/client) | Mobile sync now caches customer/contact/site/installation deltas with tombstone cleanup; technician UI supports offline search and one-tap phone/email actions. Remaining: real-device usability validation. |
| CRM-004 Site/object management | Partial | Site CRUD, per-customer numbering, active-customer guard, required address validation, and deactivation cascade are implemented/covered. Remaining: geocoding/map validation and open-order warning integration. |
| CRM-005 Technical installation management | Partial | Installation CRUD, sequential numbering, decommissioning, required manufacturer/model validation, default maintenance template creation, mobile offline installation cache, mobile notes, and spare-parts client integration are implemented/covered. Remaining: catalog prefill, full detail aggregation, and image gallery validation. |
| CRM-006 Installation capture | Partial | Mobile installation routes, offline read cache, offline create/update queueing, stale-update conflict reporting, barcode/QR serial-number scanning, compressed nameplate photo capture, sync-time nameplate image upload, and provider-ready nameplate OCR extraction are implemented/covered locally. Remaining: external OCR accuracy benchmark and real-device validation. |
| CRM-007 Maintenance intervals | Partial | Maintenance CRUD exists; commissioning-date fallback and default template creation are covered. Remaining: template administration UI/API and service-completion reschedule integration. |
| CRM-008 Automatic maintenance marking | Covered (server) | Daily job exists, is scheduled, and now has regression coverage for due/overdue transitions, linked-service suppression, runtime configurable lookahead, scheduling-recipient targeting, idempotent repeat runs, and overdue notification dispatch. |
| CRM-009 History timeline | Partial | Customer/site/installation activity endpoints exist. Remaining: full aggregation across service orders, quotations, invoices, notes, images, and export validation. |
| CRM-010 Image storage | Partial | Entity image services/routes exist; max-50 enforcement is covered. Remaining: thumbnail generation validation, HEIF conversion, client/mobile gallery and offline upload coverage. |
| CRM-011 Special notes | Covered (local/client) | Entity note services/routes exist; 24-hour edit immutability is covered; mobile address-book sync includes note deltas/tombstones; technicians can view warning banners and create queued offline notes for sites/installations. Remaining: real-device offline/online sync validation. |
| CRM-012 Spare parts | Covered (local) | Spare part service/routes exist; CSV import validation/upsert, installation linking, mobile lookup/order flagging, procurement dashboard visibility, status transitions, and inventory receive increments are implemented/covered locally. Remaining: optional "part not in catalog" quick capture and external purchasing-system integration, if required. |
| CRM-013 Newsletter | Partial | Newsletter module exists. Remaining: opt-out compliance, delivery provider validation, scheduled send worker verification, WhatsApp provider/rate-limit validation. |
| CRM-014 Website plugin | Partial | Widget public submission persistence, duplicate blocking, nested CAPTCHA handling, CRM customer/contact linkage, service-request notes, dispatcher notification targeting, admin controller contract, and public 20/IP/hour limit are implemented/covered locally. Remaining: external CAPTCHA provider validation and embeddable client UX. |

## Remaining High-Risk Work

1. Validate nameplate OCR against the selected external provider with German/French/Italian invoice/nameplate samples and run real-device installation-capture validation.
2. Validate newsletter and widget flows against real external delivery/CAPTCHA providers.
