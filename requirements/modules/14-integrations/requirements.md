# Module 14: Integrations - Detailed Requirements

---

## INT-001: Website Plugin/Widget for Customer Orders

**ID:** INT-001
**Title:** Website Plugin/Widget for Customer Orders
**Priority:** High
**Complexity:** High
**Module:** 14 - Integrations

### Description

Provide an embeddable web widget (JavaScript snippet or iframe) that can be placed on the MB Boiler & Heizung AG website. The widget allows end-consumers (homeowners, property managers) to submit service requests, heating system inquiries, or maintenance bookings. Submissions flow directly into the ERP system as new leads or orders, eliminating manual data entry from website contact forms.

### Actors

- **Website Visitor / Customer** (submitting a request via the widget)
- **Back-Office User / Dispatcher** (receiving and processing incoming submissions)
- **Admin** (configuring the widget appearance and fields)

### Preconditions

1. The MB Boiler & Heizung AG website is accessible and the widget embed code is installed.
2. The widget backend API endpoint is reachable from the public internet.
3. Widget configuration (fields, branding, categories) has been set up by an admin.

### Flow

**Main Flow:**
1. A website visitor navigates to the MB Boiler & Heizung AG website and sees the embedded widget (e.g., a "Service anfragen" button or inline form).
2. The visitor fills in the request form:
   - Contact information (name, email, phone, address)
   - Request type (e.g., Heizungsstorung, Wartung, Neuinstallation, Beratung)
   - Description of the issue or request (free text)
   - Preferred appointment window (optional)
   - Photo upload (optional, e.g., photo of the heating system or issue)
3. The visitor submits the form.
4. The widget validates input fields client-side and submits the data to the platform API.
5. The platform creates a new CRM contact (or matches an existing one by email/phone) and creates an inbound order/lead.
6. A confirmation message is displayed to the visitor ("Ihre Anfrage wurde erfolgreich ubermittelt. Wir melden uns innerhalb von 24 Stunden.").
7. A confirmation email is sent to the visitor (via Module 13).
8. A notification is sent to the dispatcher/back-office team (via Module 13) for processing.

**Alternate Flows:**
- **A1 - Spam Protection:** The widget includes a CAPTCHA (e.g., reCAPTCHA v3) or honeypot fields to prevent spam submissions.
- **A2 - Duplicate Detection:** If a submission matches an existing open request from the same email/phone within 24 hours, the system flags it as a potential duplicate for manual review instead of creating a new record.
- **A3 - File Upload Failure:** If photo upload fails (network issue, file too large), the form submission proceeds without the photo. The visitor is informed that the photo could not be uploaded.
- **A4 - API Unavailable:** If the backend API is unreachable, the widget displays a user-friendly error message and suggests calling the office phone number.
- **A5 - Widget Configuration:** An admin can configure which fields are visible, required, or optional. Request type categories are configurable.

### Postconditions

1. A new lead/order is created in the ERP system with all submitted data.
2. The website visitor receives a confirmation (on-screen and via email).
3. The back-office team is notified of the new submission.

### Acceptance Criteria

- [ ] AC-1: The widget loads on the MB Boiler website within 2 seconds and does not block page rendering.
- [ ] AC-2: A submitted request creates a new CRM contact and order/lead in the ERP within 10 seconds.
- [ ] AC-3: The visitor receives an on-screen confirmation and a confirmation email within 60 seconds.
- [ ] AC-4: Photo uploads up to 10 MB (JPEG, PNG) are accepted and attached to the order.
- [ ] AC-5: Spam submissions are blocked by CAPTCHA/honeypot with a false positive rate below 1%.
- [ ] AC-6: The widget is responsive and usable on mobile devices.
- [ ] AC-7: The widget supports German (DE) as the primary language; French (FR) and Italian (IT) are optional.
- [ ] AC-8: An admin can configure visible fields, request type categories, and branding (logo, colors) without code changes.

### Dependencies

- Module 01 (Core Platform): API authentication (API key for widget)
- Module 02 (CRM): Contact creation/matching
- Module 03 (Order Management): Order/lead creation
- Module 13 (Notifications): Confirmation email, dispatcher notification

### Tags

`website`, `widget`, `embed`, `customer-facing`, `lead-capture`, `public-api`

---

## INT-002: IGH Industry Catalog API Integration

**ID:** INT-002
**Title:** IGH Industry Catalog API Integration
**Priority:** High
**Complexity:** Medium
**Module:** 14 - Integrations

### Description

Integrate with the IGH (Interessengemeinschaft Haustechnik) catalog system to retrieve and synchronize standardized HVAC industry product data. This includes article numbers, product descriptions, specifications, pricing (list prices), and product categories. The catalog data is used in quotations, orders, and inventory management to ensure standardized product references across the Swiss HVAC industry.

### Actors

- **System** (automated catalog synchronization)
- **Back-Office User** (searching IGH catalog during quotation creation)
- **Admin** (configuring sync schedule and mapping rules)

### Preconditions

1. MB Boiler & Heizung AG has an active IGH membership and API access credentials.
2. IGH provides API documentation and a test/sandbox environment.
3. Article master data schema in Module 08 supports IGH catalog fields.

### Flow

**Main Flow:**
1. On a configurable schedule (e.g., nightly at 02:00 CET), the integration connector initiates a catalog sync.
2. The connector authenticates with the IGH API using stored credentials.
3. The connector requests a delta update (changes since last sync) or, for initial import, a full catalog download.
4. For each catalog item received:
   a. The connector maps IGH fields to the internal article data model.
   b. If the article already exists (matched by IGH article number), it is updated.
   c. If the article is new, it is created in the article master (Module 08).
   d. Discontinued articles are flagged as inactive.
5. The sync result (new, updated, deactivated, errors) is logged and reported.
6. During quotation creation (Module 07), users can search the synced IGH catalog to add line items.

**Alternate Flows:**
- **A1 - API Unavailable:** If the IGH API is unreachable during scheduled sync, the sync is retried up to 3 times over 1 hour. If all retries fail, the sync is skipped and an alert is raised.
- **A2 - Data Mapping Error:** If an IGH catalog item has unexpected data format, the item is skipped, logged as an error, and included in the sync report.
- **A3 - Manual Sync:** An admin can trigger a manual full or delta sync from the admin UI.
- **A4 - Price Override:** Internal pricing (margins, customer-specific pricing) in Module 08 takes precedence over IGH list prices. The IGH list price is stored as a reference.

### Postconditions

1. The internal article catalog reflects the latest IGH catalog data.
2. A sync report is available for admin review.

### Acceptance Criteria

- [ ] AC-1: Scheduled nightly sync completes within 30 minutes for a full catalog of up to 100,000 articles.
- [ ] AC-2: Delta syncs process only changed articles, reducing sync time to under 5 minutes for typical daily changes.
- [ ] AC-3: New IGH articles are created in the internal article master with all mapped fields populated.
- [ ] AC-4: Updated IGH articles reflect the latest descriptions, specifications, and list prices.
- [ ] AC-5: Discontinued articles are flagged as inactive and no longer appear in new quotation searches.
- [ ] AC-6: The sync report includes counts of new, updated, deactivated, and errored articles.
- [ ] AC-7: An admin can trigger a manual sync and view the result.
- [ ] AC-8: IGH catalog search during quotation creation returns results within 2 seconds.

### Dependencies

- Module 08 (Articles & Inventory): Article data model, article creation/update API
- Module 07 (Quotations): Catalog search during quotation line item entry
- Module 01 (Core Platform): Background job scheduling, configuration management

### Tags

`igh`, `catalog`, `hvac`, `articles`, `sync`, `industry-standard`

---

## INT-003: Banking Interface

**ID:** INT-003
**Title:** Banking Interface
**Priority:** High
**Complexity:** High
**Module:** 14 - Integrations

### Description

Integrate with Swiss banking systems to automate payment reconciliation. Import electronic bank statements in ISO 20022 format (camt.053 for end-of-day statements, camt.054 for detailed transaction notifications) and automatically match incoming payments against open invoices in the finance module (Module 10). This eliminates manual payment matching and reduces errors in accounts receivable.

### Actors

- **System** (automated bank statement import and matching)
- **Finance User** (reviewing unmatched payments, manual reconciliation)
- **Admin** (configuring bank connection parameters)

### Preconditions

1. MB Boiler & Heizung AG has an e-banking contract with their bank that supports electronic statement delivery.
2. Bank provides ISO 20022 camt.053/054 files via EBICS, SFTP, or API.
3. The finance module (Module 10) has open invoices with QR-IBAN reference numbers.

### Flow

**Main Flow:**
1. On a configurable schedule (e.g., daily at 07:00 CET), the banking connector retrieves new bank statement files.
2. The connector parses the ISO 20022 XML file and extracts individual transaction entries (credit/debit).
3. For each incoming credit transaction:
   a. The connector extracts the payment reference (QR reference number / ESR reference / structured reference).
   b. The connector searches for a matching open invoice in Module 10 by reference number.
   c. If a match is found and the amount matches exactly, the invoice is automatically marked as paid.
   d. If a match is found but the amount differs (partial payment or overpayment), the payment is linked to the invoice and flagged for manual review.
   e. If no match is found, the payment is recorded as an unmatched incoming payment for manual assignment.
4. A reconciliation report is generated showing: auto-matched, partially matched, and unmatched transactions.
5. The finance user reviews unmatched and partially matched items via the back-office UI and assigns them manually.

**Alternate Flows:**
- **A1 - Multiple Invoices:** A single payment may reference multiple invoices (batch payment). The connector attempts to split and match against each referenced invoice.
- **A2 - Duplicate Import Prevention:** The connector tracks imported statement IDs. Re-importing the same statement file is detected and rejected.
- **A3 - Bank Connection Failure:** If the bank file retrieval fails, the import is retried. An alert is raised after 3 failed attempts.
- **A4 - Currency Handling:** All transactions are expected in CHF. Non-CHF transactions are flagged for manual review.
- **A5 - Outgoing Payments:** Outgoing payments (debits) are recorded for cash flow tracking but are not auto-matched against supplier invoices in this phase.

### Postconditions

1. Bank transactions are imported and persisted in the finance module.
2. Matched invoices are updated with payment status.
3. Unmatched payments are queued for manual reconciliation.

### Acceptance Criteria

- [ ] AC-1: ISO 20022 camt.053 files are parsed correctly, extracting all credit and debit entries.
- [ ] AC-2: Payments with a valid QR reference are auto-matched to the corresponding invoice with 99%+ accuracy.
- [ ] AC-3: Partial payments are linked to the invoice and flagged for manual review (not auto-closed).
- [ ] AC-4: Duplicate bank statement imports are detected and rejected.
- [ ] AC-5: The reconciliation report shows auto-matched (count, total), partially matched, and unmatched transactions.
- [ ] AC-6: A finance user can manually assign unmatched payments to invoices via the UI.
- [ ] AC-7: Bank statement import completes within 5 minutes for files containing up to 1,000 transactions.

### Dependencies

- Module 10 (Finance): Invoice data, payment recording, QR reference numbers
- Module 01 (Core Platform): Background job scheduling, secure credential storage

### Tags

`banking`, `iso20022`, `camt`, `payment-reconciliation`, `qr-invoice`, `swiss-banking`

---

## INT-004: WhatsApp Business API Connector

**ID:** INT-004
**Title:** WhatsApp Business API Connector
**Priority:** High
**Complexity:** Medium
**Module:** 14 - Integrations

### Description

Technical adapter for the WhatsApp Business API that handles authentication, message submission, template registration, and webhook processing for delivery status callbacks. This connector is consumed by Module 13 (Notifications) for dispatching WhatsApp messages. The connector encapsulates all WhatsApp-specific protocol handling and exposes a clean internal interface.

### Actors

- **System / Module 13** (submitting messages via the connector)
- **Admin** (managing WhatsApp Business account configuration and templates)

### Preconditions

1. MB Boiler & Heizung AG has a verified WhatsApp Business account with an approved phone number.
2. A Business Solution Provider (BSP) account is active (e.g., Twilio, 360dialog, or direct Meta API access).
3. API credentials (API key, phone number ID, business account ID) are configured.
4. At least one message template is approved by WhatsApp/Meta.

### Flow

**Main Flow:**
1. Module 13 (Notifications) calls the WhatsApp connector's internal API with a message request (recipient phone number, template name, language, template parameters).
2. The connector validates the request (phone number format, template existence).
3. The connector submits the message to the WhatsApp Business API.
4. The API returns a message ID and initial status.
5. The connector returns the message ID and status to the calling module.
6. WhatsApp delivery status webhooks (sent, delivered, read, failed) are received at the connector's webhook endpoint.
7. The connector normalizes the webhook payload and forwards it to Module 13 via internal event.

**Alternate Flows:**
- **A1 - Rate Limit Reached:** If the WhatsApp API returns a rate limit error (HTTP 429), the connector queues the message for retry after the specified cooldown period.
- **A2 - Invalid Phone Number:** If the API returns an error indicating the phone number is not on WhatsApp, the connector returns a structured error to Module 13.
- **A3 - Template Not Found:** If the specified template name does not exist in the WhatsApp Business account, the connector returns an error. Module 13 handles fallback logic.
- **A4 - API Token Refresh:** If the API token expires, the connector automatically refreshes it using stored credentials.

### Postconditions

1. The WhatsApp message is submitted to the API and a message ID is returned.
2. Delivery status updates are forwarded to Module 13.

### Acceptance Criteria

- [ ] AC-1: A template message is successfully submitted to the WhatsApp Business API and a message ID is returned.
- [ ] AC-2: Delivery status webhooks (sent, delivered, read, failed) are received and forwarded to Module 13 within 5 seconds.
- [ ] AC-3: Phone number validation catches invalid formats before API submission.
- [ ] AC-4: Rate limit responses are handled gracefully with automatic retry.
- [ ] AC-5: API token refresh happens automatically without manual intervention.
- [ ] AC-6: The connector logs all API interactions (excluding message content) for debugging.

### Dependencies

- Module 13 (Notifications): Primary consumer of the connector
- Module 01 (Core Platform): Secure credential storage, webhook endpoint registration

### Tags

`whatsapp`, `business-api`, `connector`, `adapter`, `webhook`

---

## INT-005: SMTP/Email Service Integration

**ID:** INT-005
**Title:** SMTP/Email Service Integration
**Priority:** High
**Complexity:** Low
**Module:** 14 - Integrations

### Description

Connector for email dispatch via SMTP relay or transactional email service provider API. Handles connection management, email submission, and delivery status webhook processing. Consumed by Module 13 (Notifications) for all outbound email.

### Actors

- **System / Module 13** (submitting emails via the connector)
- **Admin** (configuring SMTP/provider settings)

### Preconditions

1. SMTP credentials or email service provider API key is configured.
2. Sending domain (e.g., mb-boiler.ch) has proper DNS records (SPF, DKIM, DMARC).

### Flow

**Main Flow:**
1. Module 13 calls the email connector with a structured email request (from, to, cc, bcc, subject, body HTML, body text, attachments, reply-to, headers).
2. The connector establishes or reuses an SMTP connection (connection pooling) or calls the provider API.
3. The email is submitted and a message ID is returned.
4. Delivery webhooks from the email provider (delivered, bounced, opened, clicked, complained) are received at the connector's webhook endpoint.
5. The connector normalizes webhook payloads and forwards them to Module 13 via internal event.

**Alternate Flows:**
- **A1 - SMTP Connection Failure:** If the SMTP connection fails, the connector retries with exponential backoff (3 retries). On persistent failure, an alert is raised.
- **A2 - Attachment Handling:** Attachments are streamed from cloud storage (INT-007) rather than loaded entirely into memory.
- **A3 - Sending Rate Control:** The connector enforces a configurable sending rate limit to avoid provider throttling.

### Postconditions

1. The email is submitted to the SMTP relay or provider API.
2. Delivery status events are forwarded to Module 13.

### Acceptance Criteria

- [ ] AC-1: An email with HTML body, plain text fallback, and PDF attachment is delivered successfully via SMTP.
- [ ] AC-2: Connection pooling is used; establishing a new SMTP connection happens no more than once per 5 minutes under normal load.
- [ ] AC-3: Delivery webhooks (delivered, bounced) are processed and forwarded to Module 13 within 10 seconds.
- [ ] AC-4: The connector handles attachments up to 10 MB without excessive memory usage.
- [ ] AC-5: SPF/DKIM/DMARC alignment is verified during initial setup and reported in the health check.

### Dependencies

- Module 13 (Notifications): Primary consumer
- INT-007 (Cloud Storage): Attachment retrieval
- Module 01 (Core Platform): Secure credential storage

### Tags

`email`, `smtp`, `connector`, `transactional-email`, `delivery-webhooks`

---

## INT-006: OCR Service Integration

**ID:** INT-006
**Title:** OCR Service Integration
**Priority:** High
**Complexity:** High
**Module:** 14 - Integrations

### Description

Integrate with an OCR (Optical Character Recognition) service to automate data extraction from scanned documents, primarily supplier invoices and delivery notes. The OCR service extracts structured data (supplier name, invoice number, date, line items, amounts, VAT) from uploaded document images or PDFs, reducing manual data entry in the finance module (Module 10).

### Actors

- **Finance User** (uploading documents for OCR processing)
- **System** (automated processing of incoming scanned documents)
- **Admin** (configuring OCR service and extraction rules)

### Preconditions

1. OCR service account is active and API credentials are configured.
2. The OCR service supports German-language document processing and Swiss invoice formats.

### Flow

**Main Flow:**
1. A finance user uploads a scanned supplier invoice (PDF or image) via the back-office UI, or the document arrives via email and is auto-forwarded.
2. The system sends the document to the OCR service API.
3. The OCR service processes the document and returns structured extraction results:
   - Supplier name and address
   - Invoice number, date, due date
   - Line items (description, quantity, unit price, total)
   - Total amount, VAT amount, VAT rate
   - Bank account / payment reference
4. The connector maps the extracted data to the internal supplier invoice schema.
5. The extracted data is presented to the finance user for review and correction in a side-by-side view (original document + extracted fields).
6. The user confirms or corrects the data and saves the supplier invoice in Module 10.

**Alternate Flows:**
- **A1 - Low Confidence Extraction:** Fields with low confidence scores (< 80%) are highlighted in yellow for the user to verify.
- **A2 - Unrecognized Format:** If the OCR service cannot parse the document, the user is prompted to enter data manually.
- **A3 - Multi-Page Documents:** Multi-page invoices are processed as a single document. The OCR service handles page concatenation.
- **A4 - Duplicate Detection:** Before creating a new supplier invoice, the system checks for duplicate invoice numbers from the same supplier.

### Postconditions

1. Structured invoice data is extracted and available for review.
2. Confirmed data is saved as a supplier invoice in Module 10.

### Acceptance Criteria

- [ ] AC-1: OCR extraction achieves 90%+ accuracy on standard Swiss supplier invoices (structured layout, printed text).
- [ ] AC-2: Extraction results are returned within 30 seconds for a single-page document.
- [ ] AC-3: Low-confidence fields (< 80%) are visually highlighted for user review.
- [ ] AC-4: The side-by-side review UI displays the original document and extracted fields on the same screen.
- [ ] AC-5: Duplicate invoice detection prevents creation of invoices with the same number from the same supplier.
- [ ] AC-6: The system supports PDF, JPEG, and PNG document formats.

### Dependencies

- Module 10 (Finance): Supplier invoice data model, invoice creation API
- INT-007 (Cloud Storage): Document storage
- Module 01 (Core Platform): File upload infrastructure

### Tags

`ocr`, `document-scanning`, `supplier-invoice`, `data-extraction`, `automation`

---

## INT-007: Cloud Storage Integration

**ID:** INT-007
**Title:** Cloud Storage Integration
**Priority:** Medium
**Complexity:** Low
**Module:** 14 - Integrations

### Description

Connector for cloud storage services used for document storage, photo uploads, backup, and retrieval across all modules. Provides a unified storage API abstracting the underlying provider (AWS S3, Azure Blob Storage, or Swiss-hosted alternatives such as Exoscale or Infomaniak).

### Actors

- **System** (storing and retrieving files)
- **All Users** (indirect - uploading and downloading documents via other modules)
- **Admin** (configuring storage provider and retention policies)

### Preconditions

1. Cloud storage account and bucket/container are provisioned.
2. API credentials are configured with appropriate permissions (read, write, delete).

### Flow

**Main Flow:**
1. A module requests file storage via the storage connector API (file content/stream, metadata, target path/key).
2. The connector uploads the file to the cloud storage provider.
3. The connector returns a storage reference (key/URL) that is persisted by the calling module.
4. When a file is needed, the calling module requests a time-limited signed URL or direct download via the connector.
5. The connector generates a signed URL (valid for a configurable duration, default 15 minutes) and returns it.

**Alternate Flows:**
- **A1 - Upload Failure:** If the upload fails, the connector retries up to 3 times. On persistent failure, an error is returned to the calling module.
- **A2 - File Deletion:** When a file is no longer needed (e.g., GDPR deletion), the connector permanently deletes the file from storage.
- **A3 - Storage Quota:** The connector monitors storage usage and alerts admins when approaching quota limits.

### Postconditions

1. Files are stored securely in cloud storage.
2. Files are retrievable via signed URLs.

### Acceptance Criteria

- [ ] AC-1: Files up to 100 MB can be uploaded within 30 seconds on a standard business internet connection.
- [ ] AC-2: Signed download URLs expire after the configured duration.
- [ ] AC-3: File deletion permanently removes the file from storage (no soft-delete retention beyond 30 days).
- [ ] AC-4: All stored files are encrypted at rest using provider-managed keys.
- [ ] AC-5: The storage connector is provider-agnostic; switching providers requires only configuration changes, not code changes.

### Dependencies

- Module 01 (Core Platform): Secure credential storage
- All modules that store or retrieve files

### Tags

`storage`, `cloud`, `s3`, `blob`, `documents`, `photos`

---

## INT-008: Calendar Sync

**ID:** INT-008
**Title:** Calendar Sync
**Priority:** Medium
**Complexity:** Medium
**Module:** 14 - Integrations

### Description

Optional integration with external calendar systems (Google Calendar, Microsoft Outlook/Exchange) to synchronize technician schedules and appointments. Technicians and dispatchers can see ERP appointments reflected in their personal calendars and, optionally, have external calendar events visible in the ERP scheduling view.

### Actors

- **Technician** (linking personal calendar)
- **Dispatcher** (viewing synchronized schedules)
- **Admin** (enabling/configuring calendar sync)

### Preconditions

1. The technician has authorized the platform to access their calendar (OAuth 2.0 consent).
2. The calendar provider API (Google Calendar API, Microsoft Graph API) is accessible.

### Flow

**Main Flow:**
1. A technician navigates to Settings > Calendar Integration and connects their Google or Outlook calendar via OAuth 2.0.
2. The system creates a dedicated calendar (e.g., "MB Boiler Termine") in the technician's external calendar.
3. When an appointment is created or updated in the ERP (Module 03/04), the system creates/updates a corresponding calendar event in the external calendar.
4. The calendar event includes: appointment title, customer name, address, time, and a link back to the ERP.
5. Changes in the ERP are reflected in the external calendar within 5 minutes (via polling or push).

**Alternate Flows:**
- **A1 - Two-Way Sync (Optional):** If enabled, the system also reads the technician's personal calendar events and displays them as "blocked" slots in the ERP scheduling view (no details, just availability).
- **A2 - OAuth Token Expired:** If the OAuth token expires, the system notifies the technician to re-authorize. Sync is paused until re-authorization.
- **A3 - Calendar Disconnected:** The technician can disconnect the calendar integration at any time. Existing calendar events created by the system are optionally removed.

### Postconditions

1. ERP appointments are visible in the technician's external calendar.
2. Calendar sync status is visible to the technician and admin.

### Acceptance Criteria

- [ ] AC-1: ERP appointments appear in the connected Google/Outlook calendar within 5 minutes of creation.
- [ ] AC-2: Updated appointments (time change, cancellation) are reflected in the external calendar.
- [ ] AC-3: Calendar events include customer name, address, time, and a deep link to the ERP order.
- [ ] AC-4: OAuth re-authorization is prompted when the token expires, and sync resumes after re-auth.
- [ ] AC-5: Disconnecting the calendar removes the sync without affecting ERP data.

### Dependencies

- Module 03 (Order Management): Appointment data
- Module 04 (Task Management): Task scheduling data
- Module 01 (Core Platform): OAuth 2.0 infrastructure, user settings

### Tags

`calendar`, `google-calendar`, `outlook`, `sync`, `oauth`, `optional`

---

## INT-009: Integration Health Monitoring

**ID:** INT-009
**Title:** Integration Health Monitoring
**Priority:** Medium
**Complexity:** Medium
**Module:** 14 - Integrations

### Description

Centralized monitoring dashboard showing the operational status, error rates, latency, and last-successful-sync time of all active integrations. Provides real-time health checks and alerting for integration failures, enabling proactive incident response.

### Actors

- **Admin** (monitoring integration health)
- **System** (performing health checks and recording metrics)

### Preconditions

1. At least one integration connector is configured and active.

### Flow

**Main Flow:**
1. The system performs periodic health checks on all active integrations (configurable interval, default every 5 minutes):
   - IGH API: Ping endpoint, check authentication validity
   - Banking: Check file retrieval endpoint accessibility
   - WhatsApp: Verify API token validity, check webhook endpoint
   - Email/SMTP: Verify SMTP connection, send test handshake
   - OCR Service: Check API availability
   - Cloud Storage: Verify bucket access, write/read/delete test object
   - Calendar: Verify OAuth token validity
2. Health check results are recorded with timestamp, response time, and status (healthy, degraded, down).
3. The admin dashboard displays:
   - Integration name, status (green/yellow/red), last check time, average response time
   - Error rate over the last 24 hours
   - Last successful sync/operation time
   - Recent error log entries
4. If an integration transitions from healthy to degraded or down, an alert notification is sent to configured admin users (via Module 13).

**Alternate Flows:**
- **A1 - Manual Health Check:** An admin can trigger an immediate health check for a specific integration from the dashboard.
- **A2 - Integration Disabled:** Disabled integrations are shown as "disabled" (grey) and are not health-checked.
- **A3 - Flapping Detection:** If an integration alternates between healthy and down rapidly (flapping), the system consolidates alerts to avoid notification spam.

### Postconditions

1. Integration health status is continuously monitored and visible on the dashboard.
2. Alerts are raised for status transitions to degraded or down.

### Acceptance Criteria

- [ ] AC-1: The health monitoring dashboard displays real-time status for all configured integrations.
- [ ] AC-2: Health checks run every 5 minutes and results are stored for at least 30 days.
- [ ] AC-3: A status change from healthy to down triggers an alert notification within 2 minutes.
- [ ] AC-4: The dashboard shows error rate, average latency, and last successful operation per integration.
- [ ] AC-5: An admin can trigger a manual health check and see results immediately.
- [ ] AC-6: Flapping detection prevents more than 3 alert notifications per integration per hour.

### Dependencies

- Module 01 (Core Platform): Background job scheduling, metrics storage
- Module 13 (Notifications): Alert notifications
- All integration connectors (INT-001 through INT-008)

### Tags

`monitoring`, `health-check`, `dashboard`, `alerting`, `ops`
