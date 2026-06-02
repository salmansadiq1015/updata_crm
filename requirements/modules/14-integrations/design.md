# Module 14: Integrations - Technical Design

## 1. Architecture Overview

The Integrations module follows an **Adapter Pattern** architecture. Each external system integration is encapsulated as an independent connector/adapter that implements a standardized internal interface. This allows business modules to interact with external services without knowledge of the underlying protocol, authentication, or data format.

```
+-------------------+     +-------------------+     +---------------------+
| Business Modules  |     | Integration       |     | External Systems    |
|                   |     | Service Layer     |     |                     |
| - CRM (03)        |---->| +---------------+ |---->| - IGH Catalog API   |
| - Orders (08)     |     | | Connector     | |     | - Swiss Bank (EBICS)|
| - Quotations (08) |     | | Registry      | |     | - WhatsApp Bus. API |
| - Finance (11)    |     | +---------------+ |     | - Email Provider    |
| - Notifications   |     | | Health Monitor| |     | - OCR Service       |
|   (13)            |     | +---------------+ |     | - Cloud Storage     |
|                   |     | | Circuit       | |     | - Google/Outlook    |
|                   |     | | Breaker       | |     |   Calendar          |
|                   |     | +---------------+ |     | - Website (Widget)  |
+-------------------+     +-------------------+     +---------------------+
```

### Design Principles

1. **Adapter Isolation:** Each connector is independently deployable and testable. A failure in one connector does not affect others.
2. **Circuit Breaker:** All outbound integrations use circuit breaker patterns to prevent cascading failures.
3. **Idempotency:** All integration operations are designed to be safely retried.
4. **Provider Abstraction:** Where feasible (email, storage), the connector abstracts the provider, allowing provider switches via configuration.
5. **Credential Security:** All credentials are stored in a secure vault (environment variables at minimum, HashiCorp Vault or cloud KMS in production).

---

## 2. Data Models

### 2.1 Integration Configuration

```
Table: integration_configurations
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| id                  | UUID (PK)                  | Configuration identifier             |
| integration_key     | VARCHAR(50) UNIQUE         | Unique key (e.g., igh_catalog,       |
|                     |                            | banking_camt, whatsapp, smtp,        |
|                     |                            | ocr, cloud_storage, calendar_google) |
| display_name        | VARCHAR(100)               | Human-readable name                  |
| provider            | VARCHAR(50)                | Provider identifier                  |
| is_enabled          | BOOLEAN DEFAULT false      | Whether integration is active        |
| config              | JSONB                      | Provider-specific configuration      |
|                     |                            | (non-sensitive: URLs, timeouts, etc.)|
| credentials_ref     | VARCHAR(255)               | Reference to secure credential store |
|                     |                            | (vault path or env var prefix)       |
| sync_schedule       | VARCHAR(50)                | Cron expression for scheduled sync   |
| last_sync_at        | TIMESTAMP WITH TZ          | Last successful sync/operation       |
| last_error_at       | TIMESTAMP WITH TZ          | Last error timestamp                 |
| last_error_message  | TEXT                       | Last error detail                    |
| created_at          | TIMESTAMP WITH TZ          | Record creation                      |
| updated_at          | TIMESTAMP WITH TZ          | Last update                          |
+---------------------+----------------------------+--------------------------------------+
```

### 2.2 Integration Health Check Log

```
Table: integration_health_checks
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| id                  | UUID (PK)                  | Record identifier                    |
| integration_key     | VARCHAR(50)                | Integration reference                |
| status              | VARCHAR(20)                | healthy, degraded, down, disabled    |
| response_time_ms    | INTEGER                    | Health check response time           |
| error_message       | TEXT                       | Error detail if unhealthy            |
| checked_at          | TIMESTAMP WITH TZ          | Check timestamp                      |
+---------------------+----------------------------+--------------------------------------+
Indexes: (integration_key, checked_at DESC)
Retention: 30 days
```

### 2.3 Integration Sync Log

```
Table: integration_sync_logs
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| id                  | UUID (PK)                  | Log entry identifier                 |
| integration_key     | VARCHAR(50)                | Integration reference                |
| sync_type           | VARCHAR(20)                | full, delta, manual                  |
| status              | VARCHAR(20)                | running, completed, failed           |
| started_at          | TIMESTAMP WITH TZ          | Sync start time                      |
| completed_at        | TIMESTAMP WITH TZ          | Sync end time                        |
| records_processed   | INTEGER                    | Total records processed              |
| records_created     | INTEGER                    | New records created                  |
| records_updated     | INTEGER                    | Records updated                      |
| records_skipped     | INTEGER                    | Records skipped (errors/unchanged)   |
| records_deleted     | INTEGER                    | Records deactivated/deleted          |
| error_count         | INTEGER                    | Number of record-level errors        |
| error_details       | JSONB                      | Array of error details               |
| summary             | TEXT                       | Human-readable summary               |
+---------------------+----------------------------+--------------------------------------+
Indexes: (integration_key, started_at DESC)
```

### 2.4 Website Widget Submission

```
Table: widget_submissions
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| id                  | UUID (PK)                  | Submission identifier                |
| widget_id           | VARCHAR(50)                | Widget instance identifier           |
| contact_name        | VARCHAR(255)               | Submitted contact name               |
| contact_email       | VARCHAR(255)               | Submitted email                      |
| contact_phone       | VARCHAR(50)                | Submitted phone                      |
| contact_address     | TEXT                       | Submitted address                    |
| request_type        | VARCHAR(50)                | Service request category             |
| description         | TEXT                       | Free-text description                |
| preferred_window    | VARCHAR(100)               | Preferred appointment window         |
| attachments         | JSONB                      | Array of uploaded file references    |
| captcha_score       | DECIMAL(3,2)               | reCAPTCHA score (0.0 - 1.0)         |
| ip_address          | INET                       | Submitter IP (for spam detection)    |
| user_agent          | TEXT                       | Browser user agent                   |
| processing_status   | VARCHAR(20)                | pending, processed, duplicate, spam  |
| crm_contact_id      | UUID                       | Linked CRM contact (after matching)  |
| order_id            | UUID                       | Created order/lead ID                |
| processed_at        | TIMESTAMP WITH TZ          | Processing timestamp                 |
| created_at          | TIMESTAMP WITH TZ          | Submission timestamp                 |
+---------------------+----------------------------+--------------------------------------+
Indexes: (processing_status, created_at), (contact_email)
```

### 2.5 Bank Transaction Import

```
Table: bank_transactions
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| id                  | UUID (PK)                  | Transaction identifier               |
| statement_id        | VARCHAR(100)               | Bank statement identifier            |
| transaction_ref     | VARCHAR(100)               | Bank transaction reference           |
| booking_date        | DATE                       | Booking date                         |
| value_date          | DATE                       | Value date                           |
| amount              | DECIMAL(12,2)              | Transaction amount (signed)          |
| currency            | VARCHAR(3) DEFAULT 'CHF'   | Currency code                        |
| direction           | VARCHAR(10)                | credit, debit                        |
| counterparty_name   | VARCHAR(255)               | Payer/payee name                     |
| counterparty_iban   | VARCHAR(34)                | Payer/payee IBAN                     |
| payment_reference   | VARCHAR(100)               | QR ref / ESR ref / structured ref    |
| remittance_info     | TEXT                       | Unstructured remittance info         |
| matched_invoice_id  | UUID (FK -> invoices)      | Matched invoice (if auto-matched)    |
| match_status        | VARCHAR(20)                | unmatched, auto_matched,             |
|                     |                            | manually_matched, partial            |
| match_confidence    | DECIMAL(3,2)               | Match confidence (0.0 - 1.0)        |
| imported_at         | TIMESTAMP WITH TZ          | Import timestamp                     |
| matched_at          | TIMESTAMP WITH TZ          | Match timestamp                      |
| matched_by          | UUID (FK -> users)         | User who manually matched (if any)   |
+---------------------+----------------------------+--------------------------------------+
Indexes: (statement_id), (payment_reference), (match_status, imported_at),
         (matched_invoice_id), (booking_date)
Unique: (statement_id, transaction_ref)
```

### 2.6 OCR Extraction Result

```
Table: ocr_extractions
+---------------------+----------------------------+--------------------------------------+
| Column              | Type                       | Description                          |
+---------------------+----------------------------+--------------------------------------+
| id                  | UUID (PK)                  | Extraction identifier                |
| document_storage_ref| VARCHAR(500)               | Reference to uploaded document       |
| document_type       | VARCHAR(30)                | supplier_invoice, delivery_note      |
| ocr_provider        | VARCHAR(50)                | OCR service used                     |
| raw_result          | JSONB                      | Full OCR provider response           |
| extracted_data      | JSONB                      | Normalized extracted fields:         |
|                     |                            | supplier_name, invoice_number,       |
|                     |                            | invoice_date, due_date, line_items,  |
|                     |                            | total_amount, vat_amount, vat_rate,  |
|                     |                            | payment_reference, iban             |
| confidence_scores   | JSONB                      | Per-field confidence scores          |
| status              | VARCHAR(20)                | processing, completed, failed,       |
|                     |                            | reviewed, confirmed                  |
| reviewed_by         | UUID (FK -> users)         | User who reviewed/confirmed          |
| reviewed_at         | TIMESTAMP WITH TZ          | Review timestamp                     |
| linked_invoice_id   | UUID                       | Created supplier invoice ID          |
| processing_time_ms  | INTEGER                    | OCR processing duration              |
| created_at          | TIMESTAMP WITH TZ          | Record creation                      |
+---------------------+----------------------------+--------------------------------------+
Indexes: (status, created_at), (linked_invoice_id)
```

---

## 3. REST API Endpoints

### 3.1 Website Widget Public API

```
POST /api/v1/public/widget/submissions
```
Public endpoint (rate-limited, CAPTCHA-protected) for widget form submissions.

**Request Body:**
```json
{
  "widget_id": "mb-boiler-main-site",
  "contact": {
    "name": "Hans Muster",
    "email": "hans@example.ch",
    "phone": "+41791234567",
    "address": {
      "street": "Bahnhofstrasse 1",
      "zip": "8001",
      "city": "Zurich"
    }
  },
  "request_type": "heizungsstoerung",
  "description": "Die Heizung macht laute Gerausche und heizt nicht mehr richtig.",
  "preferred_window": "Vormittag",
  "captcha_token": "recaptcha-response-token"
}
```

**Response (201 Created):**
```json
{
  "submission_id": "uuid",
  "message": "Ihre Anfrage wurde erfolgreich ubermittelt. Wir melden uns innerhalb von 24 Stunden.",
  "reference_number": "WEB-2026-001234"
}
```

**File Upload (multipart):**
```
POST /api/v1/public/widget/submissions/{submissionId}/attachments
Content-Type: multipart/form-data
```

**Rate Limiting:** 10 submissions per IP per hour. 3 file uploads per submission.

### 3.2 Widget Configuration (Admin)

```
GET    /api/v1/admin/widget/config
PUT    /api/v1/admin/widget/config
```

**Response (200):**
```json
{
  "widget_id": "mb-boiler-main-site",
  "branding": {
    "logo_url": "https://...",
    "primary_color": "#0056b3",
    "company_name": "MB Boiler & Heizung AG"
  },
  "fields": {
    "contact_name": { "visible": true, "required": true },
    "contact_email": { "visible": true, "required": true },
    "contact_phone": { "visible": true, "required": true },
    "contact_address": { "visible": true, "required": false },
    "preferred_window": { "visible": true, "required": false },
    "photo_upload": { "visible": true, "required": false, "max_files": 3, "max_size_mb": 10 }
  },
  "request_types": [
    { "key": "heizungsstoerung", "label_de": "Heizungsstorung", "label_fr": "Panne de chauffage" },
    { "key": "wartung", "label_de": "Wartung", "label_fr": "Entretien" },
    { "key": "neuinstallation", "label_de": "Neuinstallation", "label_fr": "Nouvelle installation" },
    { "key": "beratung", "label_de": "Beratung", "label_fr": "Conseil" }
  ],
  "captcha": { "provider": "recaptcha_v3", "site_key": "..." },
  "confirmation_message_de": "Ihre Anfrage wurde erfolgreich ubermittelt.",
  "languages": ["de", "fr"]
}
```

### 3.3 IGH Catalog Sync

```
POST /api/v1/admin/integrations/igh/sync
```
Trigger a manual catalog sync.

**Request Body:**
```json
{
  "sync_type": "delta"
}
```

**Response (202 Accepted):**
```json
{
  "sync_id": "uuid",
  "status": "running",
  "sync_type": "delta",
  "started_at": "2026-04-14T02:00:00Z"
}
```

```
GET /api/v1/admin/integrations/igh/sync/{syncId}
```
Get sync status and results.

```
GET /api/v1/admin/integrations/igh/sync?page=1&per_page=10
```
List recent sync operations.

### 3.4 Banking Interface

```
POST /api/v1/admin/integrations/banking/import
```
Trigger a manual bank statement import.

```
POST /api/v1/admin/integrations/banking/upload
Content-Type: multipart/form-data
```
Upload a camt.053/054 XML file manually.

```
GET /api/v1/finance/bank-transactions?match_status={status}&from={date}&to={date}&page={n}
```
List bank transactions with filtering.

```
POST /api/v1/finance/bank-transactions/{transactionId}/match
```
Manually match a bank transaction to an invoice.

**Request Body:**
```json
{
  "invoice_id": "uuid",
  "match_note": "Manually matched - customer used wrong reference"
}
```

```
GET /api/v1/finance/bank-reconciliation/report?from={date}&to={date}
```
Get reconciliation summary report.

**Response (200):**
```json
{
  "period": { "from": "2026-04-01", "to": "2026-04-14" },
  "summary": {
    "total_transactions": 156,
    "auto_matched": 142,
    "manually_matched": 8,
    "partial_matches": 3,
    "unmatched": 3,
    "total_amount_matched": 245678.50,
    "total_amount_unmatched": 1234.00
  }
}
```

### 3.5 OCR Service

```
POST /api/v1/finance/ocr/extract
Content-Type: multipart/form-data
```
Upload a document for OCR extraction.

**Response (202 Accepted):**
```json
{
  "extraction_id": "uuid",
  "status": "processing"
}
```

```
GET /api/v1/finance/ocr/extractions/{extractionId}
```
Get extraction result.

**Response (200):**
```json
{
  "id": "uuid",
  "status": "completed",
  "document_type": "supplier_invoice",
  "extracted_data": {
    "supplier_name": { "value": "Viessmann AG", "confidence": 0.98 },
    "invoice_number": { "value": "VIE-2026-4521", "confidence": 0.95 },
    "invoice_date": { "value": "2026-04-10", "confidence": 0.97 },
    "due_date": { "value": "2026-05-10", "confidence": 0.88 },
    "line_items": [
      {
        "description": { "value": "Vitodens 200-W, 19 kW", "confidence": 0.92 },
        "quantity": { "value": 1, "confidence": 0.99 },
        "unit_price": { "value": 4250.00, "confidence": 0.90 },
        "total": { "value": 4250.00, "confidence": 0.95 }
      }
    ],
    "total_amount": { "value": 4589.75, "confidence": 0.97 },
    "vat_amount": { "value": 339.75, "confidence": 0.94 },
    "vat_rate": { "value": 8.1, "confidence": 0.85 }
  },
  "processing_time_ms": 4200
}
```

```
POST /api/v1/finance/ocr/extractions/{extractionId}/confirm
```
Confirm the extraction and create a supplier invoice.

**Request Body:**
```json
{
  "corrected_data": {
    "due_date": "2026-05-10",
    "vat_rate": 8.1
  }
}
```

### 3.6 Cloud Storage

```
POST /api/v1/storage/upload
Content-Type: multipart/form-data
```
Upload a file to cloud storage.

**Response (201):**
```json
{
  "storage_ref": "documents/invoices/2026/04/uuid.pdf",
  "size_bytes": 245000,
  "content_type": "application/pdf",
  "uploaded_at": "2026-04-14T10:00:00Z"
}
```

```
GET /api/v1/storage/{storageRef}/download-url
```
Get a time-limited signed download URL.

**Response (200):**
```json
{
  "url": "https://storage.provider.ch/...?signature=...",
  "expires_at": "2026-04-14T10:15:00Z"
}
```

```
DELETE /api/v1/storage/{storageRef}
```
Permanently delete a file.

### 3.7 Integration Health & Admin

```
GET /api/v1/admin/integrations
```
List all integrations with current status.

**Response (200):**
```json
{
  "integrations": [
    {
      "key": "igh_catalog",
      "display_name": "IGH Industry Catalog",
      "is_enabled": true,
      "status": "healthy",
      "last_check_at": "2026-04-14T10:05:00Z",
      "last_sync_at": "2026-04-14T02:00:00Z",
      "response_time_ms": 230,
      "error_rate_24h": 0.01
    },
    {
      "key": "banking_camt",
      "display_name": "Banking Interface (ISO 20022)",
      "is_enabled": true,
      "status": "healthy",
      "last_check_at": "2026-04-14T10:05:00Z",
      "last_sync_at": "2026-04-14T07:00:00Z",
      "response_time_ms": 450,
      "error_rate_24h": 0.0
    }
  ]
}
```

```
POST /api/v1/admin/integrations/{key}/health-check
```
Trigger an immediate health check.

```
GET /api/v1/admin/integrations/{key}/health-history?period={24h|7d|30d}
```
Get health check history with trend data.

```
PUT /api/v1/admin/integrations/{key}/config
```
Update integration configuration (non-credential settings).

```
POST /api/v1/admin/integrations/{key}/enable
POST /api/v1/admin/integrations/{key}/disable
```
Enable or disable an integration.

### 3.8 Calendar Sync

```
POST /api/v1/users/me/calendar/connect
```
Initiate OAuth flow for calendar connection. Returns an OAuth authorization URL.

```
GET /api/v1/users/me/calendar/callback?code={auth_code}&state={state}
```
OAuth callback endpoint.

```
GET /api/v1/users/me/calendar/status
```
Get calendar sync status.

```
DELETE /api/v1/users/me/calendar/disconnect
```
Disconnect calendar integration.

---

## 4. Event Flows

### 4.1 Events Consumed

| Event | Source Module | Integration Action |
|---|---|---|
| `order.created` (from widget) | 08 - Quotations & Order Processing | Update widget submission status to `processed` |
| `appointment.created` | 08 - Quotations & Order Processing | Create external calendar event (if connected) |
| `appointment.updated` | 08 - Quotations & Order Processing | Update external calendar event |
| `appointment.cancelled` | 08 - Quotations & Order Processing | Delete external calendar event |
| `invoice.created` | 11 - Accounting | Register QR reference for bank matching |
| `notification.send_email` | 13 - Notifications | Dispatch via SMTP connector |
| `notification.send_whatsapp` | 13 - Notifications | Dispatch via WhatsApp connector |

### 4.2 Events Published

| Event | Description | Consumers |
|---|---|---|
| `widget.submission_received` | New website widget submission | CRM (03), Orders (08) |
| `igh.sync_completed` | IGH catalog sync finished | Articles (10) |
| `banking.transactions_imported` | Bank transactions imported | Finance (11) |
| `banking.payment_matched` | Payment auto-matched to invoice | Finance (11) |
| `ocr.extraction_completed` | OCR extraction finished | Finance (11) |
| `email.delivery_status` | Email delivery callback | Notifications (13) |
| `whatsapp.delivery_status` | WhatsApp delivery callback | Notifications (13) |
| `integration.status_changed` | Integration health status change | Admin alerting |

---

## 5. Integration Point Details

### 5.1 IGH Catalog API

- **Protocol:** HTTPS REST API (or SOAP, depending on IGH provider version)
- **Authentication:** API key or OAuth client credentials
- **Data Format:** JSON or XML
- **Sync Strategy:**
  - Full sync: Download complete catalog (initial load or recovery)
  - Delta sync: Request changes since last sync timestamp
- **Field Mapping:**

| IGH Field | Internal Field (Module 10) |
|---|---|
| `article_number` | `igh_article_number` |
| `description_de` | `name_de` |
| `description_fr` | `name_fr` |
| `category_code` | `category_id` (mapped) |
| `list_price_chf` | `igh_list_price` |
| `unit` | `unit_of_measure` |
| `ean_code` | `ean` |
| `manufacturer` | `manufacturer` |
| `specifications` | `specifications` (JSONB) |
| `is_active` | `is_active` |

### 5.2 Banking Interface (ISO 20022)

- **Protocol:** EBICS (Electronic Banking Internet Communication Standard) or SFTP file transfer
- **File Format:** ISO 20022 XML
  - `camt.053` - Bank-to-Customer Statement (end-of-day)
  - `camt.054` - Bank-to-Customer Debit/Credit Notification (near-real-time)
- **Payment Reference Matching:**
  ```
  Matching Priority:
  1. QR-Reference (26 digits, Creditor Reference) -> exact match on invoice QR ref
  2. ESR Reference (27 digits) -> exact match on invoice ESR ref
  3. Structured Creditor Reference (ISO 11649) -> exact match
  4. Amount + counterparty IBAN -> fuzzy match (flagged for manual review)
  5. Remittance information text -> keyword search (flagged for manual review)
  ```
- **XML Parsing:**
  ```
  camt.053 Structure:
  BkToCstmrStmt
    -> Stmt (Statement)
      -> Ntry (Entry / Transaction)
        -> NtryDtls (Entry Details)
          -> TxDtls (Transaction Details)
            -> RmtInf (Remittance Information)
              -> Strd (Structured)
                -> CdtrRefInf (Creditor Reference)
  ```

### 5.3 WhatsApp Business API

- **Provider Options:** Meta Cloud API (direct), Twilio, 360dialog, MessageBird
- **Protocol:** HTTPS REST API
- **Authentication:** Bearer token (permanent token or OAuth)
- **Message Types:**
  - Template messages (outside 24h window, pre-approved)
  - Session messages (within 24h of customer-initiated message)
- **Webhook Events:**
  - `messages` - Incoming messages
  - `statuses` - Delivery status updates (sent, delivered, read, failed)
- **Webhook Verification:** HMAC-SHA256 signature validation

### 5.4 OCR Service

- **Provider Options:** Google Document AI, Azure Form Recognizer, ABBYY, or specialized Swiss invoice OCR (e.g., Parashift)
- **Protocol:** HTTPS REST API
- **Processing Flow:**
  ```
  Upload Document (PDF/Image)
       |
       v
  OCR Engine Processing (async)
       |
       v
  Raw Text Extraction
       |
       v
  Field Extraction (Invoice-specific model)
       |
       v
  Structured JSON Response with confidence scores
  ```
- **Swiss Invoice Specifics:**
  - QR-bill recognition (Swiss QR code on invoices)
  - CHF amount formatting (1'234.56)
  - Swiss VAT rates (8.1% standard, 2.6% reduced)
  - Multi-language support (DE/FR/IT)

### 5.5 Cloud Storage

- **Provider Abstraction Layer:**
  ```
  Interface: StorageConnector
    - upload(key, stream, contentType, metadata) -> StorageRef
    - download(storageRef) -> Stream
    - getSignedUrl(storageRef, expiryMinutes) -> URL
    - delete(storageRef) -> void
    - exists(storageRef) -> boolean
    - listByPrefix(prefix) -> StorageRef[]
  ```
- **Implementations:**
  - `S3StorageConnector` (AWS S3 / S3-compatible)
  - `AzureBlobConnector` (Azure Blob Storage)
  - `ExoscaleConnector` (Swiss-hosted, S3-compatible)
- **Bucket Structure:**
  ```
  mb-boiler-documents/
    documents/
      invoices/2026/04/
      quotations/2026/04/
      reports/2026/04/
    photos/
      field-service/2026/04/
      widget-uploads/2026/04/
    ocr/
      originals/2026/04/
    exports/
      temp/
  ```
- **Security:**
  - All objects encrypted at rest (AES-256)
  - No public access; all reads via signed URLs
  - Signed URLs expire after 15 minutes (configurable)
  - Lifecycle rules: temp exports deleted after 7 days

---

## 6. Circuit Breaker Configuration

All external integration calls use a circuit breaker to prevent cascading failures.

| Integration | Failure Threshold | Reset Timeout | Half-Open Max Requests |
|---|---|---|---|
| IGH Catalog | 5 failures in 60s | 120s | 3 |
| Banking (EBICS) | 3 failures in 60s | 300s | 1 |
| WhatsApp API | 10 failures in 60s | 60s | 5 |
| Email/SMTP | 5 failures in 60s | 120s | 3 |
| OCR Service | 3 failures in 60s | 180s | 2 |
| Cloud Storage | 5 failures in 60s | 60s | 5 |
| Calendar API | 5 failures in 60s | 120s | 3 |

**States:**
- **Closed:** Normal operation. Failures are counted.
- **Open:** All requests fail immediately with a "service unavailable" error. No external calls are made.
- **Half-Open:** After reset timeout, a limited number of requests are allowed through. If they succeed, the circuit closes. If they fail, it opens again.

---

## 7. Website Widget Architecture

### 7.1 Embed Strategy

The widget is delivered as a lightweight JavaScript bundle that can be embedded on any website via a script tag:

```html
<!-- MB Boiler Service Widget -->
<div id="mb-boiler-widget"></div>
<script src="https://app.mb-boiler.ch/widget/v1/embed.js"
        data-widget-id="mb-boiler-main-site"
        data-language="de">
</script>
```

### 7.2 Technical Stack

- **Frontend:** Preact or vanilla JS (< 50 KB gzipped) for minimal page impact
- **Styling:** Shadow DOM to prevent CSS conflicts with host page
- **API Communication:** Fetch API with CORS headers
- **Authentication:** Widget API key (public, rate-limited, CAPTCHA-protected)
- **CORS Policy:** Only allow requests from configured origin domains

### 7.3 Security

- reCAPTCHA v3 (invisible) with score threshold (reject < 0.3)
- Honeypot hidden field for bot detection
- Rate limiting: 10 submissions per IP per hour
- Input sanitization: All submitted data is sanitized server-side
- File upload: Type validation (JPEG, PNG only), size limit (10 MB), virus scanning

---

## 8. Security Considerations

1. **Credential Management:** All integration credentials stored in environment variables or secure vault. Never in database or code.
2. **Webhook Verification:** All inbound webhooks verified via provider-specific signature validation (HMAC, JWT, etc.).
3. **API Key Rotation:** Integration API keys support rotation without downtime (dual-key support during transition).
4. **Data Minimization:** Only required data is sent to external services. No unnecessary PII in API calls.
5. **Audit Logging:** All integration API calls are logged with sanitized request/response data (credentials and PII redacted).
6. **Network Security:** All external connections use TLS 1.2+ with certificate validation.
7. **Widget Security:** Widget API is isolated from internal APIs. Separate rate limits, separate authentication, separate CORS policy.

---

## 9. Monitoring & Alerting

| Metric | Threshold | Alert |
|---|---|---|
| Integration health check failure | 2 consecutive failures | Warning |
| Integration health check failure | 5 consecutive failures | Critical |
| IGH sync failure | Any sync failure | Warning |
| Bank import failure | Any import failure | Critical |
| WhatsApp API error rate | > 10% in 15 min | Warning |
| SMTP connection failure | Any failure | Warning |
| OCR extraction failure rate | > 20% in 1 hour | Warning |
| Cloud storage error rate | > 5% in 15 min | Critical |
| Widget submission spike | > 50 submissions/hour | Warning (potential attack) |
| Circuit breaker opened | Any circuit opened | Warning |
