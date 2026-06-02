# Module 09: Document Templates & Layout System -- Technical Design

---

## 1. Architecture Overview

The Document Templates & Layout System follows a server-side rendering architecture. Templates are stored as structured definitions (not WYSIWYG HTML), and a rendering engine combines templates with data payloads to produce PDF output.

```
[Requesting Module (MOD-08, MOD-07, MOD-06)]
            |
    [Document API]
            |
    [Template Engine]
      /          \
[Template Store]  [CI Asset Store]
      |                 |
[Data Binding]    [Font/Color/Logo]
      |
[PDF Renderer]
      |
[Document Storage]  -->  [Email Dispatch]
```

### Component Responsibilities

| Component          | Responsibility                                                           |
|--------------------|--------------------------------------------------------------------------|
| Document API       | Receives generation requests, validates input, returns document URLs     |
| Template Store     | Stores template definitions, versions, layout configurations             |
| CI Asset Store     | Manages fonts, colors, logo files -- centralized CI enforcement          |
| Template Engine    | Merges data with templates: data binding, conditional sections, loops    |
| PDF Renderer       | Converts the composed document to PDF (server-side headless rendering)   |
| Document Storage   | Stores generated PDFs with metadata, versioning, and access control      |
| Email Dispatcher   | Sends documents as email attachments via SMTP/API                        |

---

## 2. Data Models

### 2.1 DocumentTemplate

```json
{
  "id": "uuid",
  "templateType": "quotation | order_confirmation | invoice_standard | invoice_advance | invoice_final | cover_letter | service_report | inspection_certificate",
  "name": "string",
  "description": "string",
  "currentVersion": "integer",
  "isActive": "boolean",
  "layout": {
    "pageSize": "A4",
    "orientation": "portrait | landscape",
    "margins": {
      "top": 25,
      "bottom": 20,
      "left": 20,
      "right": 15
    },
    "headerHeight": 45,
    "footerHeight": 25
  },
  "sections": [
    {
      "id": "string",
      "name": "string",
      "type": "header | body | table | totals | deductions | qr_bill | footer | custom",
      "position": "integer",
      "isVisible": "boolean",
      "isConditional": "boolean",
      "conditionField": "string | null",
      "config": {}
    }
  ],
  "textBlocks": {
    "de": {
      "introduction": "string",
      "terms": "string",
      "footer": "string",
      "emailSubject": "string",
      "emailBody": "string"
    },
    "fr": { "...same structure..." },
    "it": { "...same structure..." },
    "en": { "...same structure..." }
  },
  "tableColumns": [
    {
      "field": "string",
      "label": { "de": "string", "fr": "string", "it": "string", "en": "string" },
      "widthPercent": "number",
      "alignment": "left | center | right",
      "format": "text | number | currency | percent"
    }
  ],
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "createdBy": "uuid"
}
```

### 2.2 TemplateVersion

```json
{
  "id": "uuid",
  "templateId": "uuid",
  "version": "integer",
  "changeDescription": "string",
  "templateSnapshot": "JSON (full template definition at this version)",
  "createdAt": "ISO8601",
  "createdBy": "uuid"
}
```

### 2.3 CIConfiguration

```json
{
  "id": "uuid",
  "companyName": "MB Boiler & Heizung AG",
  "logo": {
    "cmykFile": "mb_boiler_heizung_ag_cmyk.eps",
    "rgbFile": "mb_boiler_heizung_ag_rgb.png",
    "width": 50,
    "height": "auto",
    "position": "top-left"
  },
  "fonts": {
    "body": { "family": "Museo Sans", "weight": 300, "size": 10 },
    "semiBold": { "family": "Museo Sans", "weight": 500, "size": 10 },
    "bold": { "family": "Museo Sans", "weight": 700, "size": 10 },
    "heading": { "family": "Museo Sans", "weight": 700, "size": 12 },
    "footer": { "family": "Museo Sans", "weight": 300, "size": 8 },
    "tableHeader": { "family": "Museo Sans", "weight": 500, "size": 9 }
  },
  "colors": {
    "primaryBlue": { "cmyk": [100, 85, 2, 0], "rgb": "#1B3F8B", "hex": "#1B3F8B" },
    "primaryRed": { "cmyk": [10, 100, 95, 2], "rgb": "#D4002A", "hex": "#D4002A" },
    "textBlack": { "rgb": "#1A1A1A" },
    "textGray": { "rgb": "#666666" },
    "lineGray": { "rgb": "#CCCCCC" },
    "backgroundLight": { "rgb": "#F5F5F5" }
  },
  "companyDetails": {
    "address": ["MB Boiler & Heizung AG", "Musterstrasse 1", "8000 Zuerich"],
    "phone": "+41 44 123 45 67",
    "email": "info@mb-boiler.ch",
    "website": "www.mb-boiler.ch",
    "vatNumber": "CHE-123.456.789 MWST",
    "bankDetails": {
      "iban": "CH00 0000 0000 0000 0000 0",
      "qrIban": "CH00 0000 0000 0000 0000 0",
      "bank": "Zuercher Kantonalbank",
      "bic": "ZKBKCHZZ80A"
    }
  },
  "isActive": "boolean",
  "version": "integer",
  "updatedAt": "ISO8601"
}
```

### 2.4 GeneratedDocument

```json
{
  "id": "uuid",
  "templateId": "uuid",
  "templateVersion": "integer",
  "documentType": "string",
  "sourceModule": "string",
  "sourceRecordId": "uuid",
  "language": "de | fr | it | en",
  "fileName": "string",
  "fileUrl": "string",
  "fileSizeBytes": "integer",
  "mimeType": "application/pdf",
  "generatedAt": "ISO8601",
  "generatedBy": "uuid",
  "metadata": {
    "pageCount": "integer",
    "documentNumber": "string",
    "customerName": "string"
  }
}
```

### 2.5 EmailRecord

```json
{
  "id": "uuid",
  "documentId": "uuid",
  "sourceModule": "string",
  "sourceRecordId": "uuid",
  "to": ["string"],
  "cc": ["string"],
  "bcc": ["string"],
  "subject": "string",
  "bodyHtml": "string",
  "bodyText": "string",
  "attachments": [
    {
      "documentId": "uuid",
      "fileName": "string",
      "fileUrl": "string"
    }
  ],
  "senderAddress": "string",
  "senderName": "string",
  "status": "queued | sent | delivered | bounced | failed",
  "sentAt": "ISO8601 | null",
  "deliveredAt": "ISO8601 | null",
  "bouncedAt": "ISO8601 | null",
  "errorMessage": "string | null",
  "retryCount": "integer",
  "externalId": "string | null (provider message ID)",
  "createdAt": "ISO8601",
  "createdBy": "uuid"
}
```

---

## 3. Database Schema

```sql
-- Document Templates
CREATE TABLE document_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_type   VARCHAR(50) NOT NULL,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    current_version INTEGER NOT NULL DEFAULT 1,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    layout          JSONB NOT NULL,
    sections        JSONB NOT NULL DEFAULT '[]',
    text_blocks     JSONB NOT NULL DEFAULT '{}',
    table_columns   JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by      UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_templates_type ON document_templates(template_type);
CREATE INDEX idx_templates_active ON document_templates(is_active);

-- Template Versions
CREATE TABLE template_versions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id         UUID NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
    version             INTEGER NOT NULL,
    change_description  TEXT,
    template_snapshot   JSONB NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by          UUID NOT NULL REFERENCES users(id),
    UNIQUE(template_id, version)
);

CREATE INDEX idx_template_versions ON template_versions(template_id, version);

-- CI Configuration
CREATE TABLE ci_configuration (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name    VARCHAR(255) NOT NULL,
    logo_config     JSONB NOT NULL,
    fonts_config    JSONB NOT NULL,
    colors_config   JSONB NOT NULL,
    company_details JSONB NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    version         INTEGER NOT NULL DEFAULT 1,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by      UUID NOT NULL REFERENCES users(id)
);

-- CI Asset Files
CREATE TABLE ci_assets (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_type    VARCHAR(30) NOT NULL,
    file_name     VARCHAR(255) NOT NULL,
    file_url      TEXT NOT NULL,
    mime_type     VARCHAR(100) NOT NULL,
    file_size     BIGINT,
    metadata      JSONB DEFAULT '{}',
    uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    uploaded_by   UUID NOT NULL REFERENCES users(id)
);

-- Generated Documents
CREATE TABLE generated_documents (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id       UUID NOT NULL REFERENCES document_templates(id),
    template_version  INTEGER NOT NULL,
    document_type     VARCHAR(50) NOT NULL,
    source_module     VARCHAR(50) NOT NULL,
    source_record_id  UUID NOT NULL,
    language          VARCHAR(5) NOT NULL DEFAULT 'de',
    file_name         VARCHAR(255) NOT NULL,
    file_url          TEXT NOT NULL,
    file_size_bytes   BIGINT,
    mime_type         VARCHAR(50) NOT NULL DEFAULT 'application/pdf',
    page_count        INTEGER,
    metadata          JSONB DEFAULT '{}',
    generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by      UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_gen_docs_source ON generated_documents(source_module, source_record_id);
CREATE INDEX idx_gen_docs_type ON generated_documents(document_type);
CREATE INDEX idx_gen_docs_generated ON generated_documents(generated_at);

-- Email Records
CREATE TABLE email_records (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id       UUID REFERENCES generated_documents(id),
    source_module     VARCHAR(50),
    source_record_id  UUID,
    recipients_to     JSONB NOT NULL DEFAULT '[]',
    recipients_cc     JSONB DEFAULT '[]',
    recipients_bcc    JSONB DEFAULT '[]',
    subject           VARCHAR(500) NOT NULL,
    body_html         TEXT,
    body_text         TEXT,
    attachments       JSONB DEFAULT '[]',
    sender_address    VARCHAR(255) NOT NULL,
    sender_name       VARCHAR(255),
    status            VARCHAR(20) NOT NULL DEFAULT 'queued',
    sent_at           TIMESTAMPTZ,
    delivered_at      TIMESTAMPTZ,
    bounced_at        TIMESTAMPTZ,
    error_message     TEXT,
    retry_count       INTEGER NOT NULL DEFAULT 0,
    external_id       VARCHAR(255),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by        UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_email_status ON email_records(status);
CREATE INDEX idx_email_source ON email_records(source_module, source_record_id);
CREATE INDEX idx_email_sent ON email_records(sent_at);

-- Email Templates (for email body)
CREATE TABLE email_body_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_type   VARCHAR(50) NOT NULL,
    language        VARCHAR(5) NOT NULL,
    subject_template VARCHAR(500) NOT NULL,
    body_html       TEXT NOT NULL,
    body_text       TEXT NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(template_type, language)
);
```

---

## 4. REST API Endpoints

### 4.1 Document Generation

#### Generate a Document

```
POST /api/v1/documents/generate
```

**Request Body:**
```json
{
  "templateType": "quotation",
  "language": "de",
  "sourceModule": "quotations",
  "sourceRecordId": "uuid",
  "data": {
    "documentNumber": "OFF-2026-0042",
    "documentDate": "2026-03-29",
    "validUntil": "2026-04-28",
    "customer": {
      "name": "Muster AG",
      "addressLine1": "Industriestrasse 10",
      "addressLine2": "",
      "plz": "8005",
      "city": "Zuerich",
      "country": "Schweiz",
      "contactPerson": "Herr Max Muster",
      "email": "m.muster@muster-ag.ch"
    },
    "reference": "Ihre Anfrage vom 20.03.2026",
    "introduction": "Gerne unterbreiten wir Ihnen folgende Offerte fuer die Heizungssanierung:",
    "lineItems": [
      {
        "position": 1,
        "type": "service",
        "description": "Demontage bestehende Heizungsanlage inkl. Entsorgung",
        "unit": "Pau",
        "quantity": 1,
        "unitPrice": 2500.00,
        "discount": 0,
        "vatRate": 0.081,
        "total": 2500.00
      }
    ],
    "subtotal": 2500.00,
    "vatBreakdown": [
      { "rate": 0.081, "label": "8.1% MwSt.", "base": 2500.00, "amount": 202.50 }
    ],
    "grandTotal": 2702.50,
    "roundingAmount": -0.00,
    "grandTotalRounded": 2702.50,
    "paymentTerms": "Zahlbar innert 30 Tagen netto",
    "notes": "Preise inkl. Anfahrt, exkl. MwSt.",
    "termsAndConditions": "Es gelten unsere allgemeinen Geschaeftsbedingungen."
  },
  "outputFormat": "pdf"
}
```

**Response (201):**
```json
{
  "documentId": "uuid",
  "fileName": "OFF-2026-0042_Muster_AG.pdf",
  "fileUrl": "/api/v1/documents/uuid/download",
  "fileSizeBytes": 145320,
  "pageCount": 2,
  "templateVersion": 3,
  "generatedAt": "2026-03-29T10:30:00Z"
}
```

#### Batch Generate Documents

```
POST /api/v1/documents/generate/batch
```

**Request Body:**
```json
{
  "requests": [
    { "templateType": "invoice_standard", "language": "de", "sourceModule": "invoices", "sourceRecordId": "uuid1", "data": {} },
    { "templateType": "invoice_standard", "language": "fr", "sourceModule": "invoices", "sourceRecordId": "uuid2", "data": {} }
  ]
}
```

**Response (202):**
```json
{
  "batchId": "uuid",
  "totalRequests": 2,
  "status": "processing",
  "statusUrl": "/api/v1/documents/generate/batch/uuid/status"
}
```

### 4.2 Document Access

```
GET    /api/v1/documents/{id}                      -- Get document metadata
GET    /api/v1/documents/{id}/download              -- Download PDF file
GET    /api/v1/documents/{id}/preview               -- Get preview URL (for in-app viewer)
GET    /api/v1/documents?sourceModule=invoices&sourceRecordId=uuid  -- List documents for a record
DELETE /api/v1/documents/{id}                       -- Delete a generated document
```

### 4.3 Template Management

```
GET    /api/v1/templates                            -- List all templates
GET    /api/v1/templates/{id}                       -- Get template details
PUT    /api/v1/templates/{id}                       -- Update template (creates new version)
GET    /api/v1/templates/{id}/versions               -- List template versions
GET    /api/v1/templates/{id}/versions/{version}     -- Get specific version
POST   /api/v1/templates/{id}/versions/{version}/revert -- Revert to a version
POST   /api/v1/templates/{id}/preview                -- Preview template with sample data
```

#### Update Template -- Request Body

```json
{
  "changeDescription": "Adjusted footer text for new bank details",
  "layout": { "...optional partial update..." },
  "sections": [ "...optional..." ],
  "textBlocks": {
    "de": {
      "footer": "MB Boiler & Heizung AG | IBAN CH00 0000 0000 0000 0000 0 | CHE-123.456.789 MWST"
    }
  }
}
```

### 4.4 CI Configuration

```
GET    /api/v1/ci                                   -- Get current CI configuration
PUT    /api/v1/ci                                   -- Update CI configuration
POST   /api/v1/ci/assets                            -- Upload CI asset (logo, font file)
GET    /api/v1/ci/assets                            -- List CI assets
DELETE /api/v1/ci/assets/{id}                       -- Delete CI asset
GET    /api/v1/ci/audit                             -- CI compliance audit report
```

### 4.5 Email Dispatch

```
POST   /api/v1/emails/send                          -- Send document via email
GET    /api/v1/emails/{id}                          -- Get email record
GET    /api/v1/emails?sourceModule=quotations&sourceRecordId=uuid  -- Email history for a record
POST   /api/v1/emails/{id}/retry                    -- Retry failed email
```

#### Send Email -- Request Body

```json
{
  "documentIds": ["uuid"],
  "to": ["m.muster@muster-ag.ch"],
  "cc": ["sales@mb-boiler.ch"],
  "bcc": [],
  "subject": "Offerte OFF-2026-0042 - MB Boiler & Heizung AG",
  "bodyHtml": "<p>Sehr geehrter Herr Muster,</p><p>Anbei erhalten Sie unsere Offerte...</p>",
  "bodyText": "Sehr geehrter Herr Muster,\n\nAnbei erhalten Sie unsere Offerte...",
  "senderAddress": "offerten@mb-boiler.ch",
  "senderName": "MB Boiler & Heizung AG"
}
```

#### Send Email Shortcut (auto-compose)

```
POST /api/v1/emails/compose
```

**Request Body:**
```json
{
  "documentId": "uuid",
  "sourceModule": "quotations",
  "sourceRecordId": "uuid"
}
```

**Response (200):** Pre-filled email form data (to, subject, body loaded from templates).

### 4.6 Email Body Templates

```
GET    /api/v1/email-templates                      -- List email body templates
GET    /api/v1/email-templates/{id}                 -- Get email body template
PUT    /api/v1/email-templates/{id}                 -- Update email body template
```

---

## 5. Event Flows

### 5.1 Domain Events (Published)

| Event Name                     | Trigger                                   | Key Payload                                 |
|--------------------------------|-------------------------------------------|---------------------------------------------|
| `document.generated`           | PDF generation completed                  | documentId, templateType, sourceRecordId    |
| `document.generation_failed`   | PDF generation failed                     | templateType, sourceRecordId, error         |
| `document.deleted`             | Document removed                          | documentId, sourceRecordId                  |
| `email.queued`                 | Email dispatched to queue                 | emailId, documentId, recipients             |
| `email.sent`                   | Email successfully sent                   | emailId, documentId, sentAt                 |
| `email.delivered`              | Email delivery confirmed                  | emailId, deliveredAt                        |
| `email.bounced`                | Email bounced                             | emailId, errorMessage                       |
| `email.failed`                 | Email delivery failed                     | emailId, errorMessage, retryCount           |
| `template.updated`            | Template version created                  | templateId, version, changeDescription      |
| `template.reverted`           | Template reverted to older version        | templateId, fromVersion, toVersion          |
| `ci.updated`                  | CI configuration changed                  | ciVersion, changedFields                    |

### 5.2 Consumed Events

| Event                           | Source Module | Action                                              |
|---------------------------------|---------------|-----------------------------------------------------|
| `quotation.sent`                | MOD-08        | Trigger quotation PDF generation + email dispatch   |
| `order.confirmed`              | MOD-08        | Trigger order confirmation PDF generation           |
| `invoice.finalized`            | MOD-08        | Trigger invoice PDF generation                      |
| `invoice.sent`                 | MOD-08        | Trigger invoice email dispatch                      |
| `ai.document.generate_requested`| MOD-07       | Generate document from voice-assistant data         |

---

## 6. Template Engine Design

### 6.1 Rendering Pipeline

```
1. Receive Generation Request
   ├── Validate request payload
   ├── Load template definition (latest active version)
   └── Load CI configuration

2. Data Binding
   ├── Map data fields to template placeholders
   ├── Evaluate conditional sections (show/hide)
   ├── Expand repeating sections (line items)
   └── Apply number/date/currency formatting

3. HTML Composition
   ├── Compose HTML document from template sections
   ├── Apply CSS (fonts, colors, margins from CI config)
   ├── Inject logo image
   └── Handle page breaks (CSS @page, page-break-inside: avoid)

4. QR-Bill Generation (invoices only)
   ├── Generate Swiss QR Code per SIX specification
   ├── Compose payment slip layout
   └── Append to document (last page or separate page)

5. PDF Rendering
   ├── Render HTML to PDF via headless browser (Puppeteer) or PDF library
   ├── Embed fonts (Museo Sans subsets)
   ├── Set PDF metadata (title, author, creation date)
   └── Optimize file size

6. Storage & Response
   ├── Store PDF in object storage (S3-compatible)
   ├── Record metadata in database
   └── Return document URL to caller
```

### 6.2 Placeholder Syntax

```
Simple field:       {{documentNumber}}
Nested field:       {{customer.name}}
Conditional block:  {{#if advanceDeductions}}...{{/if}}
Loop:               {{#each lineItems}}...{{/each}}
Formatting:         {{formatCurrency grandTotal "CHF"}}
                    {{formatDate documentDate "DD.MM.YYYY"}}
                    {{formatNumber quantity 2}}
Translation:        {{t "quotation.title"}}
Fallback:           {{customer.phone | "-"}}
```

### 6.3 CSS Structure

```css
@font-face {
  font-family: 'Museo Sans';
  src: url('/fonts/MuseoSans-300.woff2') format('woff2');
  font-weight: 300;
}
/* ... 500, 700 variants ... */

@page {
  size: A4;
  margin: 25mm 15mm 20mm 20mm;

  @top-left { content: element(header); }
  @bottom-center { content: element(footer); }
}

:root {
  --ci-blue: #1B3F8B;
  --ci-red: #D4002A;
  --text-primary: #1A1A1A;
  --text-secondary: #666666;
  --line-color: #CCCCCC;
}

body {
  font-family: 'Museo Sans', sans-serif;
  font-weight: 300;
  font-size: 10pt;
  color: var(--text-primary);
}

h1, h2, h3 {
  font-weight: 700;
  font-size: 12pt;
  color: var(--ci-blue);
}

.line-item-table th {
  font-weight: 500;
  font-size: 9pt;
  background-color: var(--ci-blue);
  color: white;
}

.total-row {
  font-weight: 700;
}

.page-break-avoid {
  page-break-inside: avoid;
}
```

---

## 7. Swiss QR-Bill Integration

### 7.1 QR-Bill Structure

Per SIX Group "Swiss Payment Standards" specification:

```json
{
  "qrType": "SPC",
  "version": "0200",
  "codingType": 1,
  "iban": "CH00 0000 0000 0000 0000 0",
  "creditor": {
    "addressType": "S",
    "name": "MB Boiler & Heizung AG",
    "street": "Musterstrasse",
    "houseNumber": "1",
    "postalCode": "8000",
    "city": "Zuerich",
    "country": "CH"
  },
  "amount": 2702.50,
  "currency": "CHF",
  "debtor": {
    "addressType": "S",
    "name": "Muster AG",
    "street": "Industriestrasse",
    "houseNumber": "10",
    "postalCode": "8005",
    "city": "Zuerich",
    "country": "CH"
  },
  "reference": {
    "type": "QRR",
    "reference": "000000000000000000000000001"
  },
  "additionalInfo": "RE-2026-0105"
}
```

### 7.2 QR-Bill Layout

- Payment part on the right (148mm x 105mm)
- Receipt part on the left (62mm x 105mm)
- Swiss cross in center of QR code
- Perforation line between receipt and payment part
- Positioned at the bottom of the last page or as a separate page

### 7.3 Implementation

- Use a Swiss QR-bill library (e.g., `swissqrbill` for Node.js)
- Generate QR code as SVG for vector quality in PDF
- Validate against SIX Group test cases

---

## 8. Integration Points

### 8.1 Module 08 Integration (Quotations & Order Processing)

- **Inbound:** Receives document generation requests via REST API or events.
- **Data contract:** Module 08 provides a complete data payload matching the template's placeholder requirements.
- **Callback:** Publishes `document.generated` event with document URL.

### 8.2 Module 07 Integration (AI Assistant)

- **Inbound:** Receives voice-dictated content as part of a generation request.
- **Data merging:** Voice content is treated as additional data fields (findings, recommendations, description).

### 8.3 Module 03 Integration (CRM)

- **Inbound:** Customer data (name, address, contact) included in generation request data payload.
- **Language preference:** Determines which template language variant to use.

### 8.4 Email Service Integration

**Option A: SMTP**
```typescript
interface SMTPConfig {
  host: string;          // e.g., smtp.office365.com
  port: number;          // 587
  secure: boolean;       // true (STARTTLS)
  auth: {
    user: string;
    pass: string;
  };
  defaultFrom: string;   // noreply@mb-boiler.ch
}
```

**Option B: Transactional Email API (e.g., SendGrid)**
```typescript
interface SendGridConfig {
  apiKey: string;
  defaultFromEmail: string;
  defaultFromName: string;
  webhookUrl: string;     // for delivery status callbacks
}
```

**Webhook for delivery status:**
```
POST /api/v1/webhooks/email
```
Processes delivery notifications (sent, delivered, bounced, failed) and updates email records.

### 8.5 Object Storage Integration

- PDF files are stored in S3-compatible object storage (e.g., MinIO, AWS S3, Azure Blob).
- Files are organized by: `/{year}/{month}/{document_type}/{document_id}.pdf`
- Signed URLs with expiration are used for secure download links.
- Retention policy: configurable (default: indefinite for business documents).

---

## 9. Performance Requirements

| Metric                                       | Target                          |
|-----------------------------------------------|---------------------------------|
| Single document PDF generation                | < 5 seconds                    |
| Batch generation (100 documents)              | < 5 minutes                    |
| Template loading                              | < 200ms                        |
| PDF file size (standard 2-page document)      | < 500 KB                       |
| PDF file size (10-page document with images)  | < 2 MB                         |
| Email dispatch (single)                       | < 3 seconds (queued)           |
| Email batch dispatch (100 emails)             | < 2 minutes                    |
| Concurrent document generation requests       | 20 simultaneous                |
| Document storage retrieval (download)          | < 1 second                    |

---

## 10. Security & Access Control

| Permission                    | Roles                                    |
|-------------------------------|------------------------------------------|
| template.view                 | All authenticated users                  |
| template.edit                 | System Administrator, Designer           |
| template.version.revert       | System Administrator                     |
| ci.view                      | All authenticated users                  |
| ci.edit                      | System Administrator                     |
| document.generate             | Sales, Admin, Dispatcher, Technician     |
| document.download             | Document owner, Admin, Sales (same dept) |
| document.delete               | System Administrator                     |
| email.send                   | Sales, Admin, Dispatcher                 |
| email.view_history            | Sales (own), Admin                       |

---

## 11. Error Handling

| Error Scenario                     | Handling                                                        |
|------------------------------------|-----------------------------------------------------------------|
| Missing required data field        | Return 400 with field-level validation errors                   |
| Template not found                 | Return 404 with template type and language info                 |
| Font file missing                  | Fall back to system sans-serif; log critical alert              |
| PDF rendering timeout              | Retry once; if fails, return 503 with retry-after header        |
| Object storage unavailable         | Queue document for retry; notify admin                          |
| Email service unavailable          | Queue email for retry (up to 3 attempts over 1 hour)            |
| QR-bill generation error           | Generate invoice without QR-bill; flag for manual review        |
| Template version conflict          | Optimistic locking; return 409 with current version info        |
| File size exceeds limit            | Compress images; if still over limit, split into parts          |

---

## 12. Localization Details

### 12.1 Document Labels by Language

| Field              | DE                    | FR                      | IT                     | EN                    |
|--------------------|-----------------------|-------------------------|------------------------|-----------------------|
| Quotation title    | Offerte               | Devis                   | Offerta                | Quotation             |
| Order confirmation | Auftragsbestaetigung  | Confirmation de commande| Conferma d'ordine      | Order Confirmation    |
| Invoice            | Rechnung              | Facture                 | Fattura                | Invoice               |
| Advance invoice    | Akontorechnung        | Facture d'acompte       | Fattura d'acconto      | Advance Invoice       |
| Position           | Pos.                  | Pos.                    | Pos.                   | Pos.                  |
| Description        | Beschreibung          | Description             | Descrizione            | Description           |
| Quantity           | Menge                 | Quantite                | Quantita               | Quantity              |
| Unit price         | Einheitspreis         | Prix unitaire           | Prezzo unitario        | Unit Price            |
| Total              | Total                 | Total                   | Totale                 | Total                 |
| Subtotal           | Zwischensumme         | Sous-total              | Subtotale              | Subtotal              |
| VAT                | MwSt.                 | TVA                     | IVA                    | VAT                   |
| Grand total        | Gesamtbetrag          | Montant total           | Importo totale         | Grand Total           |
| Payment terms      | Zahlungsbedingungen   | Conditions de paiement  | Condizioni di pagamento| Payment Terms         |
| Valid until        | Gueltig bis           | Valable jusqu'au        | Valido fino al         | Valid Until           |
| Date               | Datum                 | Date                    | Data                   | Date                  |
| Page               | Seite                 | Page                    | Pagina                 | Page                  |

### 12.2 Number and Date Formatting

| Locale | Number        | Currency       | Date         |
|--------|---------------|----------------|--------------|
| de-CH  | 1'234.50      | CHF 1'234.50   | 29.03.2026   |
| fr-CH  | 1'234.50      | CHF 1'234.50   | 29.03.2026   |
| it-CH  | 1'234.50      | CHF 1'234.50   | 29.03.2026   |
| en     | 1,234.50      | CHF 1,234.50   | 29/03/2026   |

Note: Swiss number formatting uses apostrophe (') as thousands separator and period (.) as decimal separator across DE, FR, and IT locales.
