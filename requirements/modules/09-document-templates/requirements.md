# Module 09: Document Templates & Layout System -- Detailed Requirements

---
make audit in this module & verify everything completed in this module if not then write list of features that are missing & start development & complete both server & client 100% without missing anything & at the end  verify everything  with tests . First create plan & then start development & complete everything 100%     ,       verify again if anything missing related to this module complete 100% & also verify translation 100%
## DOC-001: Quotation Template Creation

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | DOC-001                                                                                        |
| **Title**         | Quotation Template Creation                                                                    |
| **Priority**      | High                                                                                           |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `template`, `quotation`, `layout`, `ci`, `pdf`                                                 |

### Description

The system shall provide a standardized quotation template that produces professional, CI-compliant quotation documents. The template includes a fixed header (logo, company details, customer address block), a dynamic body (introduction text, line item table, totals, VAT breakdown), and a fixed footer (legal text, bank details, page numbering). The template is designed for A4 print and digital PDF delivery.

### Actors

- Designer (initial setup)
- System Administrator (configuration)
- Back-Office Admin (usage)

### Preconditions

1. CI assets (logo, fonts) are uploaded to the system.
2. Template layout has been approved by the client.
3. Standard text blocks are provided in all required languages.

### Flow

1. During system setup, the designer creates the quotation template based on approved layout.
2. Template defines fixed zones:
   - Header: Logo (top-left), company info (top-right), customer address window (DIN 5008 position), document title, quotation number, date, validity, reference.
   - Body: Introduction text, line item table (position, description, unit, quantity, unit price, discount, total), optional items section, subtotal, VAT breakdown, grand total.
   - Footer: Page X of Y, legal info, bank details, contact.
3. Template placeholders are mapped to data fields from Module 08.
4. Template is stored with version number and activation status.
5. During quotation generation, Module 08 sends data payload to the template engine.
6. Template engine merges data with layout to produce a PDF.

### Postconditions

1. Quotation template is available for document generation.
2. Template renders correctly for varying data sizes (few items to 50+ items with page breaks).

### Acceptance Criteria

- [ ] Template produces A4 PDF documents with correct margins (top 25mm, bottom 20mm, left 20mm, right 15mm).
- [ ] Logo is positioned consistently in the header area.
- [ ] Customer address block is positioned for Swiss window envelopes (C5/6).
- [ ] Line item table handles 1 to 50+ items with automatic page breaks.
- [ ] Page breaks do not split a line item row across pages.
- [ ] Subtotal, VAT breakdown, and grand total are displayed correctly.
- [ ] Optional/alternative items are visually distinguished (e.g., italic, labeled).
- [ ] Footer appears on every page with page numbering.
- [ ] Fonts match CI specification: Museo Sans 300 (body), 500/700 (bold).
- [ ] Colors match CI specification: Blue C100/M85/Y2/K0, Red C10/M100/Y95/K2.
- [ ] Template supports all four languages (DE, FR, IT, EN) -- labels, headers, and standard text blocks switch by language.

### Dependencies

- DOC-009: CI Compliance
- DOC-006: Automatic Document Generation
- MOD-08: Quotations & Order Processing (data source)

---

## DOC-002: Order Confirmation Template

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | DOC-002                                                                                        |
| **Title**         | Order Confirmation Template                                                                    |
| **Priority**      | High                                                                                           |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `template`, `order`, `confirmation`, `layout`                                                  |

### Description

The system shall provide an order confirmation template with the same structural quality as the quotation template. The order confirmation includes the order number, reference to the source quotation (if applicable), confirmed line items, delivery/service schedule, and terms. The layout is consistent with the quotation template but uses a distinct document title.

### Actors

- Designer (initial setup)
- System Administrator
- Back-Office Admin

### Preconditions

1. Quotation template design is finalized (as layout reference).
2. Order confirmation-specific text blocks are provided.

### Flow

1. Designer creates the order confirmation template, inheriting the base layout from the quotation template.
2. Key differences from quotation template:
   - Document title: "Auftragsbestaetigung" / "Confirmation de commande" / etc.
   - Source quotation reference field.
   - Requested delivery/service date field.
   - No validity period (replaced with confirmation date).
   - Optional: assigned team/technician field.
3. Template is stored and versioned.

### Postconditions

1. Order confirmation template is available for document generation.

### Acceptance Criteria

- [ ] Template shares the same base layout (header, footer, margins) as the quotation template.
- [ ] Document title clearly reads "Auftragsbestaetigung" (or equivalent in the target language).
- [ ] Source quotation number is displayed (if the order was converted from a quotation).
- [ ] Line item table matches the quotation template structure.
- [ ] Requested delivery date is displayed prominently.
- [ ] All CI compliance requirements from DOC-009 are met.
- [ ] Template supports all four languages.

### Dependencies

- DOC-001: Quotation Template (base layout)
- DOC-009: CI Compliance
- MOD-08: Order data

---

## DOC-003: Invoice Template

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | DOC-003                                                                                        |
| **Title**         | Invoice Template                                                                               |
| **Priority**      | High                                                                                           |
| **Complexity**    | High                                                                                           |
| **Tags**          | `template`, `invoice`, `advance`, `final`, `deductions`, `qr-bill`                             |

### Description

The system shall provide invoice templates covering standard invoices, advance invoices (Akontorechnungen), and final invoices with advance deductions. The invoice template must comply with Swiss commercial requirements and include a QR-bill payment slip (Swiss QR Code) at the bottom of the last page or as a separate page.

### Actors

- Designer (initial setup)
- System Administrator
- Back-Office Admin

### Preconditions

1. Base template layout is established.
2. Swiss QR-bill specifications are available (SIX Group standard).
3. Company banking details (IBAN, QR-IBAN) are configured.

### Flow

1. Designer creates three invoice template variants:
   a. **Standard Invoice** -- Line items, totals, payment terms, QR-bill.
   b. **Advance Invoice** -- Milestone description, advance amount (% or fixed), VAT, QR-bill.
   c. **Final Invoice** -- Full project line items, advance deduction section, net balance, QR-bill.
2. Common elements:
   - Invoice number, date, due date, customer reference.
   - VAT number (MwSt-Nr. / TVA / IVA) of the company.
   - Line item table with VAT breakdown.
   - Payment terms and bank details.
   - Swiss QR-bill with structured reference (QR-IBAN + QR reference or SCOR reference).
3. Final invoice template includes:
   - A deduction section listing each advance invoice with number, date, and amount.
   - Net balance calculation.
4. Templates are stored and versioned.

### Postconditions

1. All three invoice template variants are available for document generation.
2. QR-bill payment slip is correctly formatted per SIX Group specifications.

### Acceptance Criteria

- [ ] Standard invoice template displays all required fields.
- [ ] Advance invoice template shows milestone description and percentage/amount.
- [ ] Final invoice template includes the advance deduction section.
- [ ] Advance deduction lines show: invoice number, date, net amount, VAT amount, total.
- [ ] Net balance (amount due) is prominently displayed after deductions.
- [ ] Swiss QR-bill is generated per SIX Group specification (valid QR code, correct format).
- [ ] QR-bill includes: QR-IBAN, amount, currency (CHF/EUR), creditor info, reference.
- [ ] QR-bill perforation line is indicated for print versions.
- [ ] Company VAT number (CHE-xxx.xxx.xxx MWST) is displayed.
- [ ] Payment due date is clearly displayed.
- [ ] All CI compliance requirements from DOC-009 are met.
- [ ] Templates support all four languages.

### Dependencies

- DOC-001: Quotation Template (base layout)
- DOC-009: CI Compliance
- MOD-08: Invoice data, advance deduction data
- External: SIX Group QR-bill specification

---

## DOC-004: Cover Letter & Additional Templates

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | DOC-004                                                                                        |
| **Title**         | Cover Letter & Additional Templates                                                            |
| **Priority**      | Medium                                                                                         |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `template`, `cover-letter`, `report`, `certificate`, `correspondence`                          |

### Description

The system shall provide templates for cover letters, service reports, inspection certificates, and other business correspondence. These templates share the same CI-compliant base layout (header, footer, fonts, colors) but have document-specific body structures.

### Actors

- Designer (initial setup)
- System Administrator
- Back-Office Admin
- Field Technician (report templates)

### Preconditions

1. Base template layout is established.
2. Document-specific content requirements are defined.

### Flow

1. Designer creates templates for each document type:
   a. **Cover Letter** -- Salutation, body text, signature block. Used to accompany quotations, reports, etc.
   b. **Service Report** -- Equipment details, findings, work performed, recommendations, technician signature.
   c. **Inspection Certificate** -- Inspection checklist results, pass/fail status, next inspection date.
   d. **Additional templates** as defined during project scope.
2. Each template defines its own data placeholders.
3. Templates are stored and versioned.

### Postconditions

1. Additional templates are available for document generation.

### Acceptance Criteria

- [ ] Cover letter template includes: date, recipient, salutation, body text, closing, signature block.
- [ ] Service report template includes: equipment info, serial number, findings, work performed, recommendations, materials used, time spent, technician name and date.
- [ ] Inspection certificate template includes: checklist items with pass/fail, overall result, inspector info, next inspection date.
- [ ] All templates use the same base layout (header, footer, margins).
- [ ] Templates are available in all four languages.
- [ ] At least 3 additional template types are supported at launch.
- [ ] New template types can be added without code changes (template engine is generic).

### Dependencies

- DOC-001: Base layout
- DOC-009: CI Compliance
- MOD-06: Mobile Technician App (service report data)
- MOD-07: AI Assistant (voice-dictated content for reports)

---

## DOC-005: Custom Layout Definition

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | DOC-005                                                                                        |
| **Title**         | Custom Layout Definition                                                                       |
| **Priority**      | Medium                                                                                         |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `template`, `layout`, `customization`, `configuration`                                         |

### Description

The system shall allow administrators to define and adjust layout parameters for document templates without requiring code changes. Configurable parameters include margins, column widths, section ordering, visibility of optional sections, and text block content. This enables fine-tuning of templates after initial deployment.

### Actors

- System Administrator
- Designer (advanced customization)

### Preconditions

1. Templates are deployed in the system.
2. User has template management permissions.

### Flow

1. Administrator navigates to the template management area.
2. Administrator selects a template to customize.
3. A layout configuration interface displays adjustable parameters:
   - Margins (top, bottom, left, right) in mm.
   - Column widths for the line item table (as percentages).
   - Section visibility toggles (e.g., show/hide introduction, show/hide terms).
   - Section ordering (drag-and-drop for movable sections).
   - Default text blocks (editable rich text per language).
4. Administrator modifies parameters and previews the result.
5. Changes are saved as a new template version (DOC-010).

### Postconditions

1. Template layout is updated with the new configuration.
2. Previous version is retained for rollback.
3. All future document generations use the updated layout.

### Acceptance Criteria

- [ ] Margins are adjustable in 1mm increments.
- [ ] Column widths are adjustable and must sum to 100%.
- [ ] At least 3 optional sections can be toggled on/off per template.
- [ ] Text blocks can be edited per language with rich text formatting (bold, italic, lists).
- [ ] Live preview is available before saving changes.
- [ ] Changes are saved as a new version; previous versions are retained.
- [ ] Layout changes do not require application restart or deployment.
- [ ] Invalid configurations (e.g., margins too large) are validated with error messages.

### Dependencies

- DOC-010: Template Versioning
- DOC-009: CI Compliance (constraints on customization)

---

## DOC-006: Automatic Document Generation from System Data

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | DOC-006                                                                                        |
| **Title**         | Automatic Document Generation from System Data                                                 |
| **Priority**      | High                                                                                           |
| **Complexity**    | High                                                                                           |
| **Tags**          | `automation`, `rendering`, `data-binding`, `pdf`, `template-engine`                            |

### Description

The system shall automatically populate document templates with data from ERP records (customers, quotations, orders, invoices, work orders) and render the completed document as a PDF. The process is triggered programmatically by other modules (e.g., Module 08 triggers invoice generation) or manually by users. The template engine handles data binding, conditional sections, repeating rows (line items), calculations, and multi-page layout.

### Actors

- System (automated trigger from other modules)
- Back-Office Admin (manual trigger)
- Field Technician (report generation trigger)

### Preconditions

1. Template exists and is active for the requested document type and language.
2. Source data is available and valid.
3. PDF rendering engine is operational.

### Flow

1. Calling module sends a document generation request with:
   - Template type and language
   - Data payload (structured JSON)
2. Template engine validates the data payload against the template's required fields.
3. Engine binds data to template placeholders:
   - Scalar fields: customer name, document number, date, etc.
   - Repeating sections: line items (dynamic row count).
   - Conditional sections: optional items, advance deduction section, etc.
   - Calculated fields: totals, VAT, rounding.
4. Engine renders the document:
   - Applies fonts, colors, and CI elements.
   - Handles page breaks (keeping table rows intact).
   - Generates QR-bill if applicable (invoices).
5. Rendered PDF is stored in the document storage.
6. File URL and metadata are returned to the calling module.

### Postconditions

1. PDF document is generated and stored.
2. Document metadata (URL, size, generation timestamp, template version) is recorded.
3. Calling module is notified of completion.

### Acceptance Criteria

- [ ] Templates are populated correctly with all provided data fields.
- [ ] Missing optional fields are handled gracefully (empty or section hidden).
- [ ] Missing required fields cause a validation error before rendering.
- [ ] Line item table renders correctly for 1 to 100+ items.
- [ ] Page breaks are handled cleanly (no row splitting, headers repeat on new pages).
- [ ] Conditional sections (advance deductions, optional items) appear only when data is present.
- [ ] Calculated fields (totals, VAT) match the source data exactly (no recalculation drift).
- [ ] PDF file size is optimized (< 500KB for typical documents, < 2MB for image-heavy reports).
- [ ] Generation completes within 5 seconds for standard documents.
- [ ] Batch generation (e.g., monthly invoice run) processes 100 documents in < 5 minutes.
- [ ] Generated PDF passes PDF/A validation for archival quality (if configured).

### Dependencies

- DOC-001, DOC-002, DOC-003, DOC-004: Templates
- DOC-009: CI Compliance
- PDF rendering engine (server-side)

---

## DOC-007: PDF Export

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | DOC-007                                                                                        |
| **Title**         | PDF Export                                                                                     |
| **Priority**      | High                                                                                           |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `pdf`, `export`, `download`, `storage`                                                         |

### Description

The system shall export all generated documents as high-quality PDF files. PDFs are stored in a document management system and made available for download, email attachment, and viewing. PDF files are optimized for both screen viewing and print quality.

### Actors

- All users with document access
- System (automated storage)

### Preconditions

1. Document has been generated by DOC-006.
2. User has permission to access the document.

### Flow

1. Document is generated and stored as PDF (DOC-006).
2. User navigates to the document record.
3. User clicks "Download PDF" or "View PDF."
4. For download: browser downloads the file.
5. For view: PDF is rendered in an in-app viewer or new browser tab.
6. Multiple versions of the same document are available (if regenerated).

### Postconditions

1. PDF is downloaded or displayed to the user.
2. Download/view action is logged.

### Acceptance Criteria

- [ ] PDF is downloadable with a meaningful filename (e.g., "OFF-2026-0042_Muster_AG.pdf").
- [ ] PDF renders correctly in all major PDF viewers (Adobe Reader, Preview, Chrome, Edge).
- [ ] PDF print quality is suitable for commercial correspondence (300 DPI equivalent).
- [ ] In-app PDF preview is available without requiring download.
- [ ] Previous document versions are accessible and downloadable.
- [ ] PDF metadata includes: title, author (company name), creation date, generator info.
- [ ] PDFs are stored with redundancy (backup) and accessible for the configured retention period.
- [ ] Access to PDFs respects document-level permissions.

### Dependencies

- DOC-006: Automatic Document Generation
- Document storage infrastructure

---

## DOC-008: Email Dispatch from System

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | DOC-008                                                                                        |
| **Title**         | Email Dispatch from System                                                                     |
| **Priority**      | High                                                                                           |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `email`, `dispatch`, `notification`, `attachment`, `smtp`                                      |

### Description

The system shall allow users to send generated documents (quotations, order confirmations, invoices) as email attachments directly from the platform. Email composition includes a configurable body template, recipient selection, CC/BCC, and subject line. The system tracks email delivery status.

### Actors

- Sales Staff
- Back-Office Admin
- System (automated dispatch for reminders)

### Preconditions

1. PDF document has been generated (DOC-006/DOC-007).
2. Customer email address is available from CRM.
3. Email service is configured (SMTP or API).

### Flow

1. User clicks "Send by Email" on a document record.
2. System pre-fills the email form:
   - To: Customer contact email (from CRM).
   - CC/BCC: Configurable defaults (e.g., internal copy to sales manager).
   - Subject: Auto-generated from document type and number (e.g., "Offerte OFF-2026-0042 - MB Boiler & Heizung AG").
   - Body: Loaded from the email body template for the document type and language.
   - Attachment: Generated PDF.
3. User reviews and optionally edits the email.
4. User clicks "Send."
5. System dispatches the email via the configured email service.
6. Delivery status is tracked and displayed on the document record.

### Postconditions

1. Email is sent with the document attached.
2. Email record is stored (recipient, subject, sent timestamp, delivery status).
3. Document status is updated (e.g., quotation moves from "Draft" to "Sent").

### Acceptance Criteria

- [ ] Email can be sent with one click after reviewing the pre-filled form.
- [ ] Customer email is auto-populated from CRM (editable).
- [ ] CC and BCC fields support multiple recipients.
- [ ] Email subject is auto-generated but editable.
- [ ] Email body template is loaded based on document type and customer language.
- [ ] PDF is attached to the email.
- [ ] Multiple PDFs can be attached (e.g., quotation + cover letter).
- [ ] Delivery tracking shows: queued, sent, delivered, bounced, failed.
- [ ] Failed emails are retried once and flagged for manual follow-up.
- [ ] Sender address is configurable (default: company email; per-department overrides possible).
- [ ] SPF, DKIM, and DMARC records are configured for the sending domain.
- [ ] Email history is visible on the document record.

### Dependencies

- DOC-006: Document Generation
- DOC-007: PDF Export
- MOD-03: CRM (customer email addresses)
- Email service infrastructure (SMTP / SendGrid / AWS SES)

---

## DOC-009: CI Compliance (Fonts, Colors, Logo)

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | DOC-009                                                                                        |
| **Title**         | CI Compliance (Fonts, Colors, Logo)                                                            |
| **Priority**      | High                                                                                           |
| **Complexity**    | Low                                                                                            |
| **Tags**          | `ci`, `branding`, `fonts`, `colors`, `logo`, `compliance`                                      |

### Description

All generated documents shall strictly adhere to the MB Boiler & Heizung AG corporate identity guidelines. This includes the specified font family, font sizes, color palette, and logo placement. CI compliance is enforced at the template engine level and cannot be overridden by individual users.

### Actors

- System (enforced)
- System Administrator (CI asset management)
- Designer (initial verification)

### Preconditions

1. CI assets are provided by the client.
2. Font licenses permit server-side PDF rendering.

### Flow

1. During system setup:
   a. Upload logo file (mb_boiler_heizung_ag_cmyk.eps + RGB/PNG variant).
   b. Install Museo Sans font family (300, 500, 700 weights).
   c. Configure color palette:
      - Primary Blue: C100/M85/Y2/K0 (RGB: #1B3F8B approximate, to be confirmed)
      - Primary Red: C10/M100/Y95/K2 (RGB: #D4002A approximate, to be confirmed)
   d. Set default font sizes: 10pt body, 12pt headings, 8pt footer.
2. Template engine enforces these settings for all templates.
3. CI assets are versioned; changes require admin approval.

### Postconditions

1. All generated documents use the correct fonts, colors, and logo.
2. CI settings are centrally managed and applied consistently.

### Acceptance Criteria

- [ ] All document text uses Museo Sans 300 for body text.
- [ ] Bold text uses Museo Sans 500 or 700 as appropriate.
- [ ] Default body font size is 10pt.
- [ ] Heading font size is 12pt.
- [ ] Footer/fine print font size is 8pt.
- [ ] Primary blue color is applied to headings, lines, and accents.
- [ ] Primary red color is applied to highlights and call-to-action elements.
- [ ] Logo is positioned consistently across all template types.
- [ ] Logo renders at sufficient resolution for print (300 DPI at printed size).
- [ ] CI settings are managed centrally (single configuration point).
- [ ] Users cannot override CI settings when generating documents.
- [ ] A CI audit report can be generated showing all templates and their compliance status.

### Dependencies

- Font license verification
- Client-provided CI assets

---

## DOC-010: Template Versioning

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | DOC-010                                                                                        |
| **Title**         | Template Versioning                                                                            |
| **Priority**      | Low                                                                                            |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `template`, `versioning`, `audit`, `rollback`                                                  |

### Description

The system shall maintain version history for all document templates. Each modification to a template creates a new version with a timestamp and change description. Administrators can view version history, compare versions, and revert to a previous version if needed. Documents reference the template version used for their generation.

### Actors

- System Administrator
- Designer

### Preconditions

1. Templates are deployed in the system.

### Flow

1. Administrator modifies a template (layout, text blocks, configuration).
2. System saves the changes as a new version (incrementing version number).
3. Administrator provides a change description.
4. Previous version is archived but retained.
5. All new document generations use the latest active version.
6. If needed, administrator can:
   a. View version history with change descriptions.
   b. Preview any historical version.
   c. Revert to a previous version (creates a new version that is a copy of the historical one).
7. Generated documents record which template version was used.

### Postconditions

1. New template version is active.
2. Previous version is retained in history.
3. Future document regeneration uses the latest version.
4. Existing documents retain their original template version reference.

### Acceptance Criteria

- [ ] Each template modification creates a new version with an auto-incremented version number.
- [ ] Version history shows: version number, date, changed by, change description.
- [ ] At least 20 versions are retained per template.
- [ ] Historical versions can be previewed with sample data.
- [ ] Revert to a previous version is supported (creates a new version, not destructive).
- [ ] Generated documents store the template version ID used.
- [ ] Regenerating a document uses the current (latest) template version.
- [ ] Version comparison (diff) highlights changes between two versions (text blocks, layout parameters).

### Dependencies

- DOC-005: Custom Layout Definition (source of version changes)
- Document storage infrastructure
