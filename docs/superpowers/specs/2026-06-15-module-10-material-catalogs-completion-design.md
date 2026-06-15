# Module 10 Material Catalogs Completion Design

Date: 2026-06-15
Status: Approved for implementation after spec review
Scope: `requirements/modules/10-material-catalogs`

## Problem Breakdown

Module 10 provides the authoritative catalog for materials, services, text blocks, units, pricing, IGH imports, and article selection in quotations, orders, project material planning, and mobile reports.

The repo already contains a partial implementation under `server/src/modules/catalog`, `server/src/jobs/*catalog*`, `client/src/modules/catalog`, and `client/src/app/(platform)/catalog`. The implementation is not complete enough for a green completion mark because several server/client contracts are mismatched and important acceptance criteria are missing.

Main constraints:

- Preserve existing feature-based architecture and the existing `/api/v1/catalog` route family.
- Do not destabilize the already dirty Module 09 worktree.
- Keep API contracts backward-compatible where possible, but normalize broken client payloads to backend schema.
- Optimize for catalogs of 100,000+ articles and 50,000+ picker rows with cursor pagination, indexed search, and virtualized client tables.
- Keep third-party IGH behavior explicit: the integration can be disabled if credentials/docs are unavailable, but local connector abstractions, preview, logs, retry, and validation must exist.

What can break:

- Existing catalog UI currently sends article fields that the backend does not accept.
- Existing QOP/mobile/PM line items store incomplete catalog references.
- Scheduled price jobs currently risk reporting success without applying prices.
- Category move can create invalid cycles if a category is moved under itself or a descendant.
- IGH imports can create articles with inconsistent unit codes.

## Audit Summary

### MAT-001 Internal Article Catalog Management

Current state: partial.

Findings:

- Category model, CRUD service, cache invalidation, and audit logging exist.
- `getTree()` exists in service but no route exposes it.
- Category listing does not include article counts.
- Client tree only supports local expansion/select; no create/edit/deactivate/move workflow.
- Move operation lacks self/descendant cycle prevention.
- Deactivated categories are not consistently filtered from create/edit dropdowns.

Required completion:

- Add `GET /catalog/categories/tree`.
- Add article counts and active-only selection support.
- Add cycle-safe move validation and ancestor recalculation tests.
- Complete client category management, including create/edit/deactivate and drag or command-based move.

### MAT-002 Material and Service CRUD

Current state: partial and contract-broken.

Findings:

- Article model, CRUD routes, image upload, soft-delete, and version snapshots exist.
- Client article form/table uses `buyPrice`, `sellPrice`, `unit`, and `supplierRef`; backend requires `basePrice`, `unitOfMeasure`, and `supplierReference`.
- Client updates do not pass required `version`.
- Article list search validates `q`, but service/repository expects `search`.
- Bulk import UI uploads only a file, but backend validation requires `format`.
- UI advertises Excel; server supports CSV/JSON only.
- Article images are linked to file metadata, but no thumbnail-specific response is exposed.

Required completion:

- Normalize article payload mapping and display `basePrice`.
- Enforce optimistic concurrency with `version`.
- Add import template/download route and format inference from filename/MIME.
- Support CSV robustly now; only advertise Excel if server parsing is available. If no Excel parser dependency is added, UI copy and accept list must be CSV/JSON only.
- Return image metadata suitable for thumbnails.

### MAT-003 Article Usage in Quotations, Orders, Reports

Current state: partial.

Findings:

- Article picker exists and emits a snapshot.
- QOP quotation lines only store `catalogItemId`; orders/invoices drop catalog link data.
- PM material items copy id/name/unit only, not price snapshot.
- Mobile uses legacy `CatalogItem` rather than the authoritative Article model.
- Price drift badge exists but is not connected to QOP/order/report line rendering.
- Picker use endpoint lacks permission and param validation.

Required completion:

- Define a shared catalog snapshot shape:
  - `catalogArticleId`
  - `articleNumber`
  - `articleName`
  - `articleDescription`
  - `unitOfMeasure`
  - `snapshotBasePrice`
  - `snapshotCurrency`
  - `catalogSource`
  - `snapshotTakenAt`
- Preserve snapshots in QOP quotations and carry them forward to orders/invoices.
- Preserve snapshots in PM material planning and mobile report material lines.
- Add price drift lookup helper for active catalog-linked lines.
- Add validated, permission-protected last-used endpoint.

### MAT-004 Text Blocks With Prices

Current state: partial.

Findings:

- Text block model, CRUD, picker, rich editor, optional price, and soft-delete exist.
- Main list search sends `q` while backend expects `search`.
- Repository helper supports text search, but main list only regexes title.
- Text blocks reuse catalog categories; no separate text-block category model exists.
- Rich HTML is stored without a clear backend sanitization boundary.

Required completion:

- Normalize `q` and `search` handling.
- Search title and body through indexed text search where available.
- Sanitize `bodyHtml` server-side before persistence.
- Keep category reuse unless requirements demand a separate taxonomy; document it as the selected simplification.
- Ensure picker returns independent copy data.

### MAT-005 IGH Industry Catalog Interface

Current state: partial.

Findings:

- IGH config, import job, queue worker, CSV/JSON parser, retry, logs, and disabled state exist.
- Worker comment still says outdated scaffold wording.
- No XML parser support.
- No durable preview approval workflow; preview returns counts but does not persist preview data for confirmation.
- Credentials are stored as plain nested fields.
- Row-level validation is weak and unit normalization can produce values inconsistent with seeded UOM codes.
- Scheduled sync uses configured schedule text but no dynamic registration path was verified.

Required completion:

- Add connector abstraction for CSV, JSON, and XML-style inputs where parser support exists.
- Persist import previews as `IghImportJob` with `PREVIEW` status and approve endpoint.
- Mask credentials in responses and avoid overwriting existing key on blank input.
- Store validation errors per row or per article in job preview/log.
- Normalize units to existing UOM codes.
- Keep disabled-state UI and backend behavior explicit.

### MAT-006 Catalog Search and Filtering

Current state: partial.

Findings:

- Article text index exists.
- Main list currently uses regex search and `q`/`search` mismatch.
- Picker uses unanchored regex and no supplier reference search.
- No typo-tolerance normalization helper.
- No search analytics or recent search storage.
- Cursor pagination exists but client tables flatten response data and do not expose pagination controls.

Required completion:

- Accept both `q` and `search`, normalize to one service field.
- Use Mongo `$text` for indexed relevance search, with normalized regex fallback for short terms/barcodes.
- Add accent-insensitive normalized search tokens for common typo tolerance.
- Add search analytics model with anonymized user/query metadata.
- Add recent search endpoint/query for the current user.
- Add server pagination controls and virtualized client result lists.

### MAT-007 Price Management and Updates

Current state: broken.

Findings:

- Price history and batch models exist.
- Client update payload does not match server schema.
- `/catalog/prices/batches` endpoint exists in client constants but not backend routes.
- Scheduled price update batches do not persist enough data to apply later.
- Scheduled worker marks due batches as `APPLIED` without changing prices or writing history.
- Rollback logic exists but depends on correct history.

Required completion:

- Add price preview endpoint.
- Add `GET /catalog/prices/batches`.
- Persist scheduled update payloads in `PriceUpdateBatch`.
- Rework scheduled worker to apply updates through the same ledger path as immediate updates.
- Align client payloads to backend schema.
- Test bulk, percentage, scheduled, and rollback behavior.

### MAT-008 Unit of Measure Management

Current state: partial.

Findings:

- UOM model, CRUD, standard seed, immutable code, and delete protection exist.
- List response does not include usage counts.
- Delete conflict message does not expose dependent article count.
- IGH import normalization emits mixed casing inconsistent with seeded units.

Required completion:

- Add usage count to unit list response.
- Return referenced article count in delete conflict details.
- Normalize unit codes consistently to seeded uppercase codes.
- Ensure client disables delete based on real usage counts.

## Architecture Decision

Use the existing catalog module and complete it in place.

Rejected alternatives:

- Full rewrite: too much risk with existing QOP, mobile, PM, and Module 09 work in the same worktree.
- UI-only patch: would leave broken scheduled pricing, import, and snapshot semantics.
- Backend-only patch: would leave the admin UX unable to exercise completed server workflows.

Selected architecture:

- Server remains feature-based under `server/src/modules/catalog`.
- Client remains feature-based under `client/src/modules/catalog`.
- Shared integration state flows through service/hooks, not direct API calls in UI components.
- Server state stays in TanStack Query.
- Heavy tables use cursor pagination plus virtualization.
- Catalog snapshots are copied into parent-domain line items; historical documents never dereference live catalog data for price/name correctness.

## Server Design

### Routes

Add or correct:

- `GET /catalog/categories/tree`
- `GET /catalog/categories/select-options`
- `GET /catalog/articles/import/template`
- `GET /catalog/search/recent`
- `GET /catalog/prices/batches`
- `POST /catalog/prices/preview`
- `POST /catalog/igh/import/preview`
- `POST /catalog/igh/import/:jobId/approve`
- `POST /catalog/picker/articles/:id/use` with param validation and `catalog:read`

Normalize existing:

- Article/text-block list accepts both `q` and `search`.
- Permission aliases map `catalog:manage` to write/admin behavior and `catalog:pricing` to `catalog:price`.

### Data Models

Add or extend:

- `CatalogSearchAnalytics`: anonymized query, filters hash, result count, source surface, user hash, timestamps.
- `CatalogRecentSearch`: user id, query, filters, last used, capped to 10 per user.
- `CatalogBarcodeReference`: article id, code, type, active state, unique active code index.
- `PriceUpdateBatch`: persist `updates`, `filter`, `effectiveDate`, `previewRows`, `rollbackUntil`.
- `IghImportJob`: persist preview rows, validation errors, source checksum, approvedBy, approvedAt.
- QOP/PM/mobile line schemas: add catalog snapshot object while keeping existing fields.

### Query and Index Strategy

Article indexes:

- Unique `articleNumber`.
- Partial unique `ighArticleNumber` for non-null values.
- `{ isDeleted, status, type, source, categoryId, basePrice, createdAt }` composites for filters.
- Text index on article number, name, description, supplier reference.
- Optional `searchTokens` field for normalized typo/accent fallback.

Category indexes:

- Unique `code`.
- `{ parentId, sortOrder }`.
- `{ ancestors, status }`.

Price indexes:

- `PriceHistory`: `{ articleId, effectiveDate }`, `{ batchId }`.
- `PriceUpdateBatch`: `{ status, scheduledDate }`, `{ createdAt }`.

Import indexes:

- `IghImportJob`: `{ status, createdAt }`, `{ type, createdAt }`.
- Barcode references: unique active code.

### Security

- All routes require authentication and explicit catalog permissions.
- HTML text blocks are sanitized server-side.
- Upload routes validate MIME, extension, and size.
- IGH credentials are never returned in full to clients.
- Import previews and approvals are audited.
- Search analytics stores no raw PII beyond user id or a stable user hash.

### Performance

- Cursor pagination for article/search tables.
- Limit picker to 50 rows.
- Use batch writes for imports and price updates.
- Scheduled price worker applies batches in chunks.
- Cache article lists/pickers with short TTL and invalidate on mutations/imports/pricing.

## Client Design

### Screens

Complete screens under `/catalog`:

- Catalog dashboard: counts, recent imports, pricing status, search activity.
- Article management: virtualized table, cursor pagination, filters, create/edit/delete, images, version panel.
- Article detail: metadata, images, price history, version history, usage snapshot.
- Category management: tree, counts, create/edit/deactivate/move.
- Bulk import center: template, upload, validation errors, queued job status.
- Search center: global catalog search, filters, recent searches, barcode lookup.
- Text block manager: rich editor, category filter, picker copy behavior.
- UOM management: usage counts and delete protection.
- Price management: selection, preview, schedule, batch history, rollback.
- IGH settings and sync monitoring: config, preview, approve, import status/logs.
- Audit/analytics view: catalog audit entries and search analytics summary.

### Component Boundaries

- UI components only render and emit events.
- Hooks own React Query calls.
- Services own API endpoints and response normalization.
- Shared helpers own article payload mapping and snapshot creation.
- No direct API calls inside picker/dialog components except through service hooks.

### UX

- Dense enterprise layout, not landing-page composition.
- Skeleton loading for tables and panels.
- Empty states for all lists.
- Inline validation and backend error mapping.
- Accessible buttons, labels, keyboard navigation, and focus handling.
- Virtualized lists for large article/search/picker result sets.

## Testing Plan

Server focused tests:

- Category tree, article counts, and cycle-safe move.
- Article create/update/delete/version with optimistic version mismatch.
- Article list search accepts `q` and `search`.
- Bulk import parsing, validation errors, per-row summaries.
- Text block sanitization and body search.
- Picker snapshot and last-used endpoint auth.
- UOM usage counts and delete conflict details.
- Price preview, immediate update, percentage update, scheduled apply, rollback window.
- IGH preview persistence, disabled behavior, approve workflow, row validation.
- QOP/PM/mobile snapshot persistence and carry-forward.

Client focused tests:

- Article form submits backend-correct payload with version.
- Article table renders `basePrice`, pagination, loading, empty, and error states.
- Price update dialog emits backend-correct payloads for fixed, percentage, schedule.
- Bulk import dialog sends format and handles errors.
- Category tree renders counts and move/deactivate commands.
- Picker returns snapshot and records use through service hook.
- Text block form sanitizes/display-copies behavior.
- UOM table disables delete based on usage count.
- IGH preview/approve flow.

Verification commands:

- `node --experimental-vm-modules server/node_modules/jest/bin/jest.js --config server/jest.config.js <catalog/qop/mobile focused tests> --runInBand`
- From `client/`: `node node_modules/vitest/vitest.mjs run --config vitest.config.ts <catalog focused tests>`
- From `client/`: `npm.cmd run build`
- `git -c safe.directory=D:/Animmza/Boiler diff --check`
- Conflict marker scan for touched server/client paths.
- Incomplete-marker and scaffold-word scan for Module 10 paths.
- Console/debugger scan for Module 10 paths.

## Completion Criteria

Module 10 can only be marked green when:

- MAT-001 through MAT-008 each have server and client evidence.
- No endpoint bypasses auth.
- Broken contracts found in this audit are fixed.
- Scheduled pricing mutates article prices and writes history.
- Article snapshots survive quotation/order/invoice/report flows.
- Search, picker, and import paths are paginated or batched.
- Focused tests and build pass with fresh output.
- External boundaries are called out: live IGH credentials/docs, production DNS/email, and licensed third-party data cannot be proven locally.

## Spec Self-Review

- Incomplete-marker scan: no unfinished sections remain.
- Consistency check: server route changes, client screens, and tests map directly to MAT-001 through MAT-008.
- Scope check: this is one cohesive implementation pass because the current gaps are mostly contract and workflow completion inside the existing catalog module.
- Ambiguity check: Excel import is only in scope if a parser exists or is added; otherwise UI must not advertise unsupported Excel upload.
