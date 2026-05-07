# Module 09: Document Templates & Layout System — Design Spec

**Date:** 2026-05-07  
**Status:** Approved  
**Requirements:** `requirements/modules/09-document-templates/`  
**Covers:** DOC-001 through DOC-010

---

## 1. Scope

Full-stack implementation of the Document Templates & Layout System for MB Boiler & Heizung AG. The server module (`doctpl`) is structurally complete but has critical gaps in the PDF rendering engine and missing endpoints. The client module does not exist and must be built from scratch.

---

## 2. Decisions

| Decision | Choice | Reason |
|---|---|---|
| PDF rendering engine | PDFKit + swissqrbill | Already wired in codebase; no browser dependency; swissqrbill has native PDFKit integration for SIX Group QR slip |
| PDF renderer architecture | Section-pipeline (`DocumentRenderer`) | Maps 1:1 to existing `sections[]` DB schema; supports DOC-005 configurable layout without code changes |
| Client nav — template mgmt | `/admin/templates` | Consistent with existing `/admin/numbering`, `/admin/reminders` |
| Client nav — document browser | `/documents` | Back-office browsing of all generated PDFs; separate from admin |
| Quotes integration | Components injected into existing `quotes/[id]` | No new routes; re-uses existing QOP detail view |
| PDF in-app preview | `<iframe>` with presigned S3 URL | No third-party viewer library; works in all modern browsers |

---

## 3. Server Gaps to Fix

### 3a. Missing npm dependencies

Add to `server/package.json`:
- `pdfkit` — PDF generation (already imported in code, not installed)
- `swissqrbill` — SIX Group-compliant Swiss QR payment slip for PDFKit

### 3b. Template CREATE endpoint

Current `template.routes.js` only has GET + PUT. Missing:
- `POST /api/v1/doctpl/templates` → `templateController.create()`
- `templateService.create(data, userId, meta)` — creates template, sets `currentVersion: 1`, publishes `DOCTPL_TEMPLATE_CREATED` event
- Seed script entry for all 8 template types with default section layout

### 3c. CI font asset types

Add `font_regular`, `font_bold`, `font_light` to `CIAsset.assetType` enum to support Museo Sans upload. Renderers resolve font path from `CIAsset` records; fall back to Helvetica if not uploaded.

### 3d. Section-pipeline PDF engine

Replace `documentGeneration.service.js _generatePdf()` with `DocumentRenderer` class in a new file `documentRenderer.js`. Structure:

```
server/src/modules/doctpl/
└── renderer/
    ├── DocumentRenderer.js       — orchestrator: iterates sections[], delegates
    ├── PageManager.js            — Y-position tracking, page overflow, new-page trigger
    ├── renderers/
    │   ├── HeaderRenderer.js     — logo, company block, customer address (DIN 5008), doc meta
    │   ├── BodyRenderer.js       — introduction text (language-aware from textBlocks)
    │   ├── TableRenderer.js      — line items table, column widths from template, page breaks
    │   ├── TotalsRenderer.js     — subtotal, VAT breakdown, advance deductions, grand total
    │   ├── QrBillRenderer.js     — swissqrbill slip (conditional: invoices only)
    │   └── FooterRenderer.js     — injected via PDFKit `pageAdded` event on every page
    └── index.js                  — re-exports DocumentRenderer
```

**DocumentRenderer.render(template, ciConfig, data, language)**
1. Build PDFKit doc with A4 size and margins from `template.layout.margins` (converted mm→pt: × 2.835)
2. Register `pageAdded` event → `FooterRenderer.draw()` on every new page
3. Sort `template.sections` by `position` ascending
4. For each section: skip if `isConditional && !resolveCondition(section.conditionField, data)`
5. Call matching renderer; renderer receives `(doc, pageManager, ciConfig, data, language, sectionConfig)`
6. Return buffer from `doc.end()` promise

**PageManager**
- Tracks `currentY`, `pageHeight`, `margins`
- `checkSpace(requiredHeight)` → calls `doc.addPage()` if insufficient space remains
- `moveDown(pts)` → increments `currentY`

**HeaderRenderer**
- Logo: fetch `CIAsset` where `assetType: 'logo_rgb'`, stream from S3, embed via `doc.image()`
- Company block (top-right): name, address, VAT, phone, email — 8pt, CI blue
- Customer address window: positioned per DIN 5008 (top: 27mm, left: 20mm, height: 40mm) — name, addressLine1, zip+city, country
- Document meta block: type title (language-aware), document number, date, validity/due date, reference

**TableRenderer**
- Column widths from `template.tableColumns[].widthPercent` (must sum to 100)
- Column labels from `template.tableColumns[].label[language]`
- Header row repeats on each page (`PageManager.checkSpace` before each row)
- No row split: if `checkSpace(rowHeight)` triggers new page, full row renders on new page
- Optional/alternative items: italic font, "(optional)" label prefix
- Text-type rows (section headers): span full width, no price columns

**TotalsRenderer**
- Subtotal line
- VAT breakdown: one line per rate (e.g. "MwSt. 8.1%: CHF 42.00")
- Advance deductions section (conditional: `data.advanceDeductions?.length > 0`): header "Abzüglich Akonto" / "Déduction acompte" / etc., one line per advance invoice (number, date, amount)
- Net balance line after deductions
- Grand total: larger font, CI blue, bold

**QrBillRenderer**
- Conditional: only when `template.sections` includes a `qr_bill` section and `data.qrBill` is present
- Uses `swissqrbill` to append the QR slip to the last page or a new page
- Data: `data.qrBill.iban`, `data.qrBill.reference`, `data.qrBill.amount`, `data.qrBill.currency`, creditor from `ciConfig`
- Scissors/perforation line indicated per SIX Group spec

**FooterRenderer**
- Registered on `doc` `pageAdded` event — fires on every page including first
- Content: company name | VAT number | bank details | "Seite X von Y" (language-aware)
- Page X of Y: register `pageAdded` event to draw footer layout on each page; after `doc.end()`, iterate pages via `doc.switchToPage(i)` to stamp the final total page count into each footer's placeholder area

### 3e. Preview endpoint

`templateService.preview(templateId, sampleData, language)`:
1. Load template from DB
2. Load active CI config
3. Call `DocumentRenderer.render(template, ciConfig, sampleData, language)`
4. Upload buffer to S3 with `isPreview: true` metadata tag, TTL-keyed filename
5. Return presigned download URL (15 min expiry via `STORAGE_PRESIGN_EXPIRY`)

Preview does not create a `GeneratedDocument` record. Preview files are uploaded with a deterministic key (`doctpl/preview/{templateId}/{language}.pdf`) so each new preview overwrites the previous one — no accumulation of orphaned files.

---

## 4. Client Architecture

### 4a. Module structure

```
client/src/modules/doctpl/
├── services/
│   ├── TemplateService.js
│   ├── DocumentService.js
│   ├── CIService.js
│   └── EmailService.js
├── hooks/
│   ├── useTemplateQueries.js
│   ├── useTemplateMutations.js
│   ├── useDocumentQueries.js
│   ├── useDocumentMutations.js
│   ├── useCIQueries.js
│   ├── useCIMutations.js
│   └── useEmailMutations.js
└── components/
    ├── TemplateEditor/
    │   ├── index.jsx               — tabbed editor: Layout | Text Blocks | Columns | Sections
    │   ├── LayoutTab.jsx           — margin sliders (1mm increments), page size
    │   ├── TextBlocksTab.jsx       — lang tabs (de/fr/it/en), TipTap editor per block
    │   ├── ColumnsTab.jsx          — column width adjuster (must sum to 100%, validated)
    │   └── SectionsTab.jsx         — visibility toggles + drag-to-reorder (position)
    ├── TemplateVersionHistory/
    │   └── index.jsx               — table: version, date, changed by, description; revert button
    ├── CIConfigForm/
    │   └── index.jsx               — company details form + color preview swatches
    ├── CIAssetUploader/
    │   └── index.jsx               — drag-drop upload for logo (PNG/EPS), fonts (TTF/OTF)
    ├── DocumentsTable/
    │   └── index.jsx               — paginated table: type, doc number, customer, date, size, actions
    ├── DocumentPreviewDrawer/
    │   └── index.jsx               — Drawer with <iframe src={presignedUrl}> + Download button
    ├── EmailComposeModal/
    │   └── index.jsx               — Dialog: to/cc/bcc/subject/body fields + send button
    └── EmailStatusBadge/
        └── index.jsx               — chip: QUEUED/SENT/DELIVERED/BOUNCED/FAILED with colors
```

### 4b. Pages

**`/admin/templates`** (`page.jsx`)
- Lists all 8 template types as cards: name, type badge, active/inactive toggle, "Edit" link, last updated
- "CI Configuration" button → links to `/admin/templates/ci`
- Follows existing admin page layout (same header pattern as `/admin/numbering`)

**`/admin/templates/[id]`** (`page.jsx`)
- `TemplateEditor` tabbed component (Layout | Text Blocks | Columns | Sections)
- Live preview button → calls `POST /:id/preview`, opens `DocumentPreviewDrawer` with returned URL
- Save button → `PUT /templates/:id` with change description prompt
- Version history panel → `TemplateVersionHistory` component, collapsible sidebar

**`/admin/templates/ci`** (`page.jsx`)
- `CIConfigForm` for company details (name, address, VAT, IBAN, QR-IBAN, phone, email, bank name)
- `CIAssetUploader` sections for: Logo (RGB PNG), Logo (CMYK EPS), Font Regular (TTF), Font Bold (TTF), Font Light (TTF)
- Color swatch preview for CI blue + CI red (hex values displayed, readonly — managed by admin)

**`/documents`** (`page.jsx`)
- `DocumentsTable` with filters: document type, date range, customer name search
- Row actions: Preview (opens `DocumentPreviewDrawer`), Download, Delete
- Follows existing platform page layout

### 4c. Quotes integration (no new routes)

In the existing `quotes/[id]` detail view, add two sections below the line items:

**Generated Documents panel**
- Fetches `GET /documents/source/qop/:id` on mount
- Shows `DocumentsTable` (source-filtered variant, no type filter needed)
- "Generate PDF" button → `POST /documents/generate` → loading state → refresh table → auto-open `DocumentPreviewDrawer`

**Email panel**
- "Send by Email" button → calls `POST /emails/compose` pre-fill → opens `EmailComposeModal`
- Email history list below the button: last 5 sends with `EmailStatusBadge`

---

## 5. Data Flow: Document Generation

```
User clicks "Generate PDF" on quotes/[id]
  → POST /api/v1/doctpl/documents/generate
      { templateType, sourceModule: 'qop', sourceRecordId, data, language }
  → documentController.generate()
  → documentGenerationService.generate()
      → DocumentTemplate.findOne({ templateType, isActive })
      → CIConfiguration.findOne({ isActive })
      → DocumentRenderer.render(template, ciConfig, data, language)
          → PDFKit doc created (A4, margins from template)
          → FooterRenderer registered on pageAdded
          → sections iterated in position order
          → HeaderRenderer, BodyRenderer, TableRenderer, TotalsRenderer, [QrBillRenderer]
          → buffer returned
      → fileService.upload(buffer) → S3
      → generatedDocumentRepository.create(...)
      → eventBus.publish(DOCUMENT_TPL_GENERATED)
  → 201 { data: GeneratedDocument }
  → Client refreshes document list, opens preview drawer
```

---

## 6. Multi-language Label Map

All renderers receive `language` and resolve labels from a constant map (not from DB — static strings):

```js
// server/src/modules/doctpl/renderer/i18n.js
export const LABELS = {
  de: { subtotal: 'Zwischensumme', vat: 'MwSt.', grandTotal: 'Gesamtbetrag',
        advanceDeduction: 'Abzüglich Akonto', netBalance: 'Nettobetrag',
        page: 'Seite', of: 'von', position: 'Pos.', description: 'Beschreibung',
        quantity: 'Menge', unitPrice: 'Einzelpreis', discount: 'Rabatt', total: 'Total',
        optional: '(optional)', validUntil: 'Gültig bis', dueDate: 'Fällig am' },
  fr: { subtotal: 'Sous-total', vat: 'TVA', grandTotal: 'Total général',
        advanceDeduction: 'Déduction acompte', netBalance: 'Montant net',
        page: 'Page', of: 'sur', position: 'Pos.', description: 'Description',
        quantity: 'Quantité', unitPrice: 'Prix unitaire', discount: 'Remise', total: 'Total',
        optional: '(optionnel)', validUntil: 'Valable jusqu\'au', dueDate: 'Échéance' },
  it: { subtotal: 'Totale parziale', vat: 'IVA', grandTotal: 'Totale complessivo',
        advanceDeduction: 'Deduzione acconto', netBalance: 'Importo netto',
        page: 'Pagina', of: 'di', position: 'Pos.', description: 'Descrizione',
        quantity: 'Quantità', unitPrice: 'Prezzo unitario', discount: 'Sconto', total: 'Totale',
        optional: '(opzionale)', validUntil: 'Valido fino al', dueDate: 'Scadenza' },
  en: { subtotal: 'Subtotal', vat: 'VAT', grandTotal: 'Grand Total',
        advanceDeduction: 'Less advance payments', netBalance: 'Net balance',
        page: 'Page', of: 'of', position: 'Pos.', description: 'Description',
        quantity: 'Qty', unitPrice: 'Unit Price', discount: 'Discount', total: 'Total',
        optional: '(optional)', validUntil: 'Valid until', dueDate: 'Due date' },
};
```

---

## 7. Acceptance Criteria Mapping

| Req | Addressed by |
|---|---|
| DOC-001: A4 margins 25/20/20/15mm | `DocumentRenderer` converts mm→pt, passes to PDFKit |
| DOC-001: Window envelope address | `HeaderRenderer` DIN 5008 position |
| DOC-001: Page breaks no row split | `TableRenderer` + `PageManager.checkSpace()` |
| DOC-001: Footer every page | `FooterRenderer` on `pageAdded` event |
| DOC-001: CI fonts | PDFKit font registration from `CIAsset` TTF files |
| DOC-003: QR-bill | `QrBillRenderer` + swissqrbill |
| DOC-003: Final invoice deductions | `TotalsRenderer` advance deductions section |
| DOC-005: Configurable layout | `TemplateEditor` UI + `PUT /templates/:id` |
| DOC-005: Live preview | `templateService.preview()` + `DocumentPreviewDrawer` |
| DOC-005: Version on save | `templateService.update()` already creates version snapshot |
| DOC-006: Auto generation | `documentGenerationService.generate()` called by any module |
| DOC-007: PDF download | `GET /documents/:id/download` presigned URL |
| DOC-008: Email dispatch | `EmailService` + BullMQ worker + `EmailComposeModal` |
| DOC-009: CI compliance | CIAsset font loading; `ciConfiguration` colors/logo |
| DOC-010: Versioning | `templateVersionRepository` already implemented |

---

## 8. Out of Scope (this iteration)

- Batch document generation UI (API endpoint exists; no client UI needed yet)
- Webhook delivery for external systems (`webhook.routes.js` exists, not wired)
- PDF/A archival validation
- Email SPF/DKIM/DMARC setup (infrastructure concern, not app code)
- Museo Sans font files (MB Boiler AG must supply TTF files and upload via CI Assets; system falls back to Helvetica until uploaded)
