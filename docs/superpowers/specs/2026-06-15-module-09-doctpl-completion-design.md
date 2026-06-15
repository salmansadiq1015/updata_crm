# Module 09 DocTpl Completion Design

Date: 2026-06-15
Repo: `D:\Animmza\Boiler`
Module: `requirements/modules/09-document-templates/requirements.md`

## 1. Problem Breakdown

Module 09 must provide the central document template, layout, PDF export, CI compliance, versioning, and transactional email layer for quotations, orders, invoices, cover letters, service reports, and inspection certificates.

The current implementation is a strong partial implementation:

- Server routes exist under `/api/v1/doctpl` for templates, documents, CI, email, and email body templates.
- Mongoose entities exist for templates, template versions, generated documents, CI configuration/assets, email records, and email body templates.
- QOP quotation and order document generation already routes through the doctpl payload/generation path.
- The client has admin template pages, a CI page, generated document listing, document preview, source document panel, and email compose modal.
- Background queues and event handlers exist for batch document generation and email dispatch.

The module is not complete because several hard acceptance criteria are missing or split across old paths:

- Invoice PDFs still use `qop/invoicePdf.service.js` rather than the Module 09 template engine.
- Final invoice advance deductions do not carry the required net amount, VAT amount, and total split.
- Document access is permission-generic and lacks document-level source ownership checks.
- Email webhook accepts unauthenticated provider callbacks without signature verification.
- Batch generation queues work but there is no durable batch status endpoint.
- Mobile order documents call a missing file service method and do not expose generated doctpl PDFs consistently.
- The template editor only exposes DE/EN for several multilingual controls, while requirements demand DE/FR/IT/EN.
- Client document preview/download behavior is coupled inside a generic hook, causing preview to open a new tab.
- Client screens need stronger search, filtering, sorting, pagination, empty/error states, and unsaved-change protection.
- No client doctpl tests exist, and current server tests are narrow.

Constraints:

- Preserve existing server/client module boundaries.
- Do not rewrite the renderer or replace the storage system unless a requirement cannot be met otherwise.
- Keep current endpoint shape compatible where already consumed by QOP, AI, PM, and mobile.
- Treat official CI assets, font licenses, DNS deliverability records, and provider webhook secrets as deployment prerequisites.

What can break:

- QOP quotation/order/invoice workflows if payload contracts change.
- Existing generated document records if model fields are renamed.
- Mobile document screens if response normalization changes without client adapter support.
- Email dispatch if attachment resolution or queue job payloads change.
- Template version history if update/revert semantics are changed destructively.

## 2. Architecture Decision

Use the existing `doctpl` feature module as the owner for document rendering, generated-document metadata, CI configuration, template versioning, and transactional email records.

Do not introduce a second document engine. The invoice path should migrate into doctpl through `qop/documentPayload.service.js` and `doctpl/documentGeneration.service.js`, while retaining compatibility fields needed by QOP invoices.

### Backend Boundaries

- `server/src/modules/doctpl`
  - Owns document templates, versions, renderer, generated documents, CI assets/configuration, email composition, email dispatch records, webhook status ingestion, and batch status.
- `server/src/modules/qop`
  - Owns quotation/order/invoice lifecycle and source payload construction.
  - Calls doctpl for document generation and stores any source-specific generated document references.
- `server/src/modules/mobile`
  - Owns mobile BFF responses.
  - Returns normalized uploaded files plus generated doctpl PDFs for orders.
- `server/src/modules/files`
  - Owns object storage metadata and signed URL generation.

### Frontend Boundaries

- `client/src/modules/doctpl/services`
  - Only API calls and response normalization.
- `client/src/modules/doctpl/hooks`
  - React Query cache/mutation behavior only.
  - No `window.open` side effects in reusable hooks.
- `client/src/modules/doctpl/components`
  - Stateless or locally stateful UI components.
  - Forms keep validation, error display, and unsaved-change behavior close to the edit workflow.
- `client/src/app/(platform)/admin/templates*`
  - Admin template management shell.
- `client/src/app/(platform)/documents`
  - Generated document repository shell.
- `client/src/app/(mobile)/orders/[id]/documents`
  - Technician document viewer adapted to normalized mobile document records.

### Data Model Additions

Keep existing models and add only the missing pieces:

- `DocumentGenerationBatch`
  - `batchId`, `status`, `total`, `succeeded`, `failed`, `items[]`, `createdBy`, timestamps.
- Optional generated document fields if needed:
  - `accessScope`, `ownerUserId`, `sourceCustomerId`, `sourceProjectId`, `sourceDepartmentId`.
- Optional email webhook verification config:
  - environment-driven provider secret/key, not persisted in Mongo.

### ERD

```text
DocumentTemplate 1 -> many TemplateVersion
DocumentTemplate 1 -> many GeneratedDocument
GeneratedDocument many -> 1 FileMetadata
GeneratedDocument 1 -> many EmailRecord.attachments
CIConfiguration 1 -> many CIAsset
EmailBodyTemplate keyed by templateType + language
DocumentGenerationBatch 1 -> many batch item results
QOP source records 1 -> many GeneratedDocument through sourceModule/sourceRecordId
```

### Index Strategy

- Preserve existing template indexes by `templateType`, `isActive`, and `isDeleted`.
- Preserve generated document indexes by `sourceModule/sourceRecordId`, `documentType`, and `generatedAt`.
- Add batch index by `batchId` and `createdAt`.
- Add email record indexes by `sourceModule/sourceRecordId`, `status`, and `sentAt/createdAt`.
- Use cursor pagination for list screens and avoid offset pagination for growing document/email logs.

## 3. Implementation Plan

### Phase A: Server Correctness

1. Add batch generation persistence and `GET /api/v1/doctpl/documents/generate/batch/:batchId/status`.
2. Migrate QOP invoice `generatePdf`, `finalize`, and `send` to use doctpl generation.
3. Preserve invoice fields that QOP needs, such as `pdfDocumentId`, `pdfGeneratedAt`, `qrBillReference`, and accounting linkage if still required.
4. Expand `qop/documentPayload.service.js` final invoice deduction payloads to include invoice number, date, net amount, VAT amount, and total amount.
5. Fix mobile document listing to use supported file repository/service APIs and include generated doctpl records.
6. Add a document access policy service for generated-document metadata/download/delete.
7. Add webhook signature verification for `/api/v1/webhooks/email`, with a clear development fallback only when no secret is configured.

### Phase B: Validation And Security

1. Enforce template section minimums per template type.
2. Enforce DE/FR/IT/EN text block and table label completeness where a template is active.
3. Sanitize rich text consistently before save and before email send.
4. Validate margin bounds against printable area, not only numeric min/max.
5. Add optimistic version conflict support using `expectedVersion` on update/revert.
6. Tighten CI asset upload MIME/extension checks for logos and fonts.
7. Separate permission checks internally into policy helpers even if public RBAC strings remain `templates:*` for compatibility.

### Phase C: Renderer Completion

1. Make template type available to header/title rendering from the template, not only payload fallback.
2. Add renderer fixture tests for quotation, order confirmation, standard invoice, advance invoice, final invoice, service report, cover letter, and inspection certificate.
3. Test table page breaks for 50+ and 100+ line items.
4. Test footer page numbering and PDF metadata.
5. Keep QR-bill generation strict for invoices: fail generation when mandatory QR-bill data or renderer support is missing.

### Phase D: Client Completion

1. Move download/open behavior from `useDownloadDocument` into page/component handlers.
2. Add DE/FR/IT/EN controls for text blocks and column labels.
3. Add editor validation summaries and field-level errors.
4. Add unsaved-change guard on template detail page.
5. Add document repository search, type/status filters, sorting, cursor pagination, selection, and bulk actions where supported.
6. Add template list search/filter/sort and a duplicate action.
7. Improve loading, empty, and error states across template, CI, documents, source panel, email compose, and mobile documents screens.
8. Fix sidebar permission for `/documents` to match seeded permissions or seed the missing permission.
9. Keep table/list rendering scalable; use virtualization if a screen renders more than a cursor page locally.

### Phase E: Tests

Server tests:

- `doctpl.template.validation.test.js`
- `doctpl.template.versioning.test.js`
- `doctpl.document.routes.test.js`
- `doctpl.batchGeneration.test.js`
- `doctpl.email.security.test.js`
- `doctpl.renderer.fixtures.test.js`
- `qop.doctpl.invoiceIntegration.test.js`
- `mobile.generatedDocuments.test.js`

Client tests:

- `DocumentsTable.test.tsx`
- `TemplateEditor.test.tsx`
- `TemplateVersionHistory.test.tsx`
- `CIConfigForm.test.tsx`
- `EmailComposeModal.test.tsx`
- `SourceDocumentsPanel.test.tsx`
- `mobile order documents` page or component test where feasible.

Verification commands:

```powershell
node --experimental-vm-modules server/node_modules/jest/bin/jest.js --config server/jest.config.js <targeted server tests> --runInBand
```

```powershell
Set-Location client
node node_modules/vitest/vitest.mjs run --config vitest.config.ts <targeted client tests>
```

```powershell
npm.cmd run build
```

## 4. Traceability Matrix

| Requirement | Server Work | Client Work | Tests |
| --- | --- | --- | --- |
| DOC-001 Quotation | Renderer fixture, QOP payload, CI validation | Preview/download, template editor | renderer + qop integration |
| DOC-002 Order confirmation | QOP order payload, title/date/source quotation fields | Source panel + repository visibility | qop order integration |
| DOC-003 Invoice | Migrate invoice generation to doctpl, QR-bill strictness, final deductions | Invoice generated docs visible/downloadable | qop invoice integration + renderer |
| DOC-004 Additional templates | Service report, cover letter, certificate fixtures and validation | Editor handles generic template types | renderer fixtures |
| DOC-005 Custom layout | Strong validation, version conflicts | Four-language editor, unsaved guard, live preview | template validation + editor |
| DOC-006 Automatic generation | Single/batch generation, batch status, events | Generate flows and status feedback | document route + batch tests |
| DOC-007 PDF export | Access policy, signed URL, metadata | In-app preview/download without hook side effects | route + client table tests |
| DOC-008 Email dispatch | Compose/send/retry/webhook signing/history | Email modal validation and history states | email service/routes + modal |
| DOC-009 CI compliance | Asset validation, audit report, renderer font/color use | CI form/uploader/audit states | CI service + form tests |
| DOC-010 Versioning | Expected version conflicts, revert, diff | Version history compare/revert UX | versioning + history tests |

## 5. Validation

Edge cases:

- Missing required payload field fails before rendering.
- Missing optional payload field hides or blanks the section.
- 100+ line item payload renders with intact rows and repeated headers.
- Final invoice deductions display net, VAT, and total amounts.
- QR-bill generation fails invoices when mandatory QR data is missing.
- Generated document download is denied when the user cannot access the source record.
- Webhook status updates are rejected when signature verification fails.
- Template update with stale expected version returns conflict.
- Editor prevents active template save when required languages are incomplete.
- Mobile document screen works online and fails gracefully offline.

Performance:

- Cursor pagination for generated documents, templates, emails, and batch status.
- No unbounded client rendering of document histories.
- Batch generation records item-level status and does not block all items on one failure.
- Cache template/CI reads but invalidate after version or CI updates.

Security:

- Authenticate all doctpl management and document access routes.
- Use document access policy before signed URL issuance.
- Verify external email webhooks with provider signature/secret.
- Sanitize rich text for template blocks and email bodies.
- Validate upload MIME/extension and file size for CI assets.
- Audit template changes, CI changes, document generation, document delete, email send/retry, and webhook status changes.

## 6. External Prerequisites

These cannot be completed by repository code alone:

- Licensed Museo Sans 300/500/700 font files.
- Official logo assets, including print-ready and RGB/PNG variants.
- Confirmed MB Boiler CI color values if the approximations differ from brand guidelines.
- SMTP/API production credentials.
- Email webhook signing secret/provider settings.
- SPF, DKIM, and DMARC DNS records for the sending domain.
- Optional PDF/A validator/runtime if archival PDF/A is enabled.

The implementation will provide configuration, validation, fallback behavior where allowed, and audit visibility for these prerequisites.

## 7. Approval Status

Approved by user on 2026-06-15 for this direction:

- Complete the existing doctpl module rather than rewrite it.
- Harden server correctness, security, and integration first.
- Upgrade client workflows and design quality within the current design system.
- Add server and client tests before claiming completion.
