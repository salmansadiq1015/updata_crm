# Module 11: Accounting -- Requirements

---

## ACC-001: Accounts Receivable - Invoice Management

| Field | Value |
|-------|-------|
| **ID** | ACC-001 |
| **Title** | Accounts Receivable - Invoice Management |
| **Priority** | High |
| **Complexity** | High |
| **Dependencies** | Module 02 (Customer Management), Module 10 (Material Catalogs) |
| **Tags** | `accounting`, `AR`, `invoices`, `core` |

### Description
The system shall support creation, editing, sending, and lifecycle management of customer invoices. Invoices are generated from completed orders, accepted quotations, or created manually. Each invoice includes customer data, line items (from catalog or free-text), VAT calculation (Swiss rates), payment terms, and a unique invoice number. Invoices can be sent as PDF via email or printed.

### Actors
- **Finance staff** -- creates, edits, sends, and manages invoices.
- **System** -- generates invoice numbers, calculates totals and VAT, tracks status.
- **Customer** -- receives the invoice (external).

### Preconditions
1. User has `accounting:ar:manage` permission.
2. Customer record exists in the system.
3. Catalog articles are available for line-item selection (optional).

### Main Flow
1. Finance staff navigates to AR invoice management and clicks "Create Invoice."
2. System generates a sequential invoice number (format configurable, e.g., RE-2026-00001).
3. User selects a customer from the customer database.
4. System pre-fills customer address and payment terms from the customer record.
5. User adds line items: selects articles from the catalog or enters free text, specifies quantity and unit price.
6. System calculates line totals, subtotal, VAT per rate, and grand total.
7. User sets invoice date, due date, and optional reference (order number, project number).
8. User saves the invoice in "Draft" status.
9. User reviews the invoice preview (PDF).
10. User finalizes the invoice (status changes to "Sent") and sends via email or prints.

### Alternate Flows
- **AF-1: Invoice from order** -- User creates an invoice from an existing order; line items, customer, and references are pre-populated from the order.
- **AF-2: Credit note** -- User creates a credit note referencing an existing invoice; amounts are negative. Credit note follows the same workflow.
- **AF-3: Partial invoice** -- User invoices a subset of order line items; remaining items are available for subsequent invoices.
- **AF-4: Cancel invoice** -- A finalized invoice can be cancelled (status "Cancelled") only by issuing a credit note. Draft invoices can be deleted.

### Postconditions
- Invoice is persisted with all line items, totals, and status.
- Invoice PDF is generated and stored in the document archive.
- If sent, an email delivery record is created.
- Open receivable is created in the AR ledger (ACC-002).

### Acceptance Criteria
1. Invoice numbers are sequential and unique; gaps are tolerated but duplicates are impossible.
2. VAT is calculated correctly for standard (8.1%), reduced (2.6%), and exempt (0%) rates; each line item has an assignable VAT rate.
3. Invoice PDF matches the MB Boiler corporate template with logo, address, QR-bill payment slip (Swiss QR-bill standard).
4. A finalized invoice cannot be edited; only credit notes can adjust amounts.
5. Invoice creation from an order pre-populates all relevant fields; user can modify before saving.
6. Invoice totals are accurate to 2 decimal places (CHF rounding: 0.05 rounding for cash, 0.01 for electronic).

---

## ACC-002: Open Receivables Management

| Field | Value |
|-------|-------|
| **ID** | ACC-002 |
| **Title** | Open Receivables Management |
| **Priority** | High |
| **Complexity** | Medium |
| **Dependencies** | ACC-001 |
| **Tags** | `accounting`, `AR`, `receivables`, `reporting` |

### Description
The system shall maintain and display a list of all open (unpaid or partially paid) customer invoices. The view supports filtering by customer, date range, aging bucket, and amount. Aging analysis categorizes receivables into configurable buckets (e.g., current, 1-30 days, 31-60 days, 61-90 days, 90+ days overdue).

### Actors
- **Finance staff** -- reviews open receivables, initiates follow-up.
- **Management** -- reviews aging reports.

### Preconditions
1. At least one finalized invoice exists.

### Main Flow
1. User navigates to the open receivables view.
2. System displays all invoices with outstanding balances, showing: invoice number, customer, invoice date, due date, total amount, paid amount, outstanding amount, days overdue.
3. User applies filters (customer, date range, aging bucket, minimum amount).
4. User sorts by any column.
5. User selects an invoice to view details or navigate to payment recording (ACC-003).

### Alternate Flows
- **AF-1: Export** -- User exports the receivables list as CSV or PDF for external use.
- **AF-2: Dunning** -- User selects overdue invoices and triggers a dunning letter/email (configurable dunning levels: reminder, 1st warning, 2nd warning).
- **AF-3: Write-off** -- User marks an irrecoverable receivable as written off with a reason; the amount is cleared from open items.

### Postconditions
- Open receivables view reflects the current state of all AR items.

### Acceptance Criteria
1. Open receivables list loads within 3 seconds for up to 10,000 open invoices.
2. Aging buckets are correctly calculated based on due date vs. current date.
3. Partial payments reduce the outstanding amount accurately.
4. Export produces a well-formatted CSV with all displayed columns.
5. Dunning letters can be generated at 3 configurable dunning levels with customizable text templates.
6. Written-off amounts are excluded from open receivables but retained in the journal.

---

## ACC-003: Incoming Payment Recording & Allocation

| Field | Value |
|-------|-------|
| **ID** | ACC-003 |
| **Title** | Incoming Payment Recording & Allocation |
| **Priority** | High |
| **Complexity** | High |
| **Dependencies** | ACC-001, ACC-002, ACC-010 |
| **Tags** | `accounting`, `AR`, `payments`, `reconciliation` |

### Description
The system shall allow recording of incoming customer payments and allocating them to one or more open invoices. Payments can be entered manually or imported from bank statements (ACC-010). The system supports full payment, partial payment, overpayment, and payment on account (unallocated).

### Actors
- **Finance staff** -- records and allocates payments.
- **System** -- suggests allocation matches, updates invoice statuses.

### Preconditions
1. At least one open invoice exists.
2. Payment information is available (manual entry or bank import).

### Main Flow
1. User navigates to payment recording.
2. User enters payment details: date, amount, payer (customer), payment reference, bank account.
3. System suggests matching open invoices based on amount, reference number, and customer.
4. User confirms or adjusts the allocation (split across multiple invoices if needed).
5. System allocates the payment, updates invoice statuses (Paid, Partially Paid), and records the transaction.
6. System updates the open receivables list.

### Alternate Flows
- **AF-1: Overpayment** -- Payment exceeds invoice total. User can allocate the excess to another invoice or leave it as a credit balance on the customer account.
- **AF-2: Partial payment** -- Payment is less than the invoice total. Invoice status changes to "Partially Paid" with the remaining balance.
- **AF-3: Unallocated payment** -- User records a payment on account without allocating to a specific invoice. The payment appears as a customer credit.
- **AF-4: Bank import** -- Payments are imported from a bank statement file (camt.054); system auto-matches using QR reference numbers.

### Postconditions
- Payment is recorded in the accounting journal.
- Allocated invoices are updated with payment amounts and status changes.
- Open receivables reflect the new balances.

### Acceptance Criteria
1. Manual payment entry and allocation complete within 30 seconds per payment.
2. Auto-matching from bank import correctly allocates at least 80% of payments with QR references without manual intervention.
3. Partial payments update the outstanding balance accurately.
4. Overpayments create a visible credit balance on the customer account.
5. All payment allocations are recorded in the accounting journal with full traceability.
6. Payment recording supports CHF amounts with 2 decimal places.

---

## ACC-004: Accounts Payable - Supplier Invoice Recording

| Field | Value |
|-------|-------|
| **ID** | ACC-004 |
| **Title** | Accounts Payable - Supplier Invoice Recording |
| **Priority** | High |
| **Complexity** | Medium |
| **Dependencies** | ACC-008 |
| **Tags** | `accounting`, `AP`, `invoices`, `core` |

### Description
The system shall support recording of supplier invoices into the accounts payable ledger. Each supplier invoice includes supplier details, invoice number, date, due date, line items, VAT, total amount, and allocation to expense accounts or cost objects (projects/orders). Invoices can be entered manually or pre-filled via OCR (ACC-007).

### Actors
- **Finance staff** -- records and manages supplier invoices.
- **Project manager** -- reviews supplier invoices allocated to their projects.

### Preconditions
1. User has `accounting:ap:manage` permission.
2. Supplier exists in the system or can be created inline.

### Main Flow
1. User navigates to AP invoice recording.
2. User enters or selects the supplier.
3. User enters invoice details: supplier invoice number, invoice date, due date, payment terms.
4. User adds line items with description, quantity, unit price, VAT rate, and account allocation.
5. System calculates line totals, VAT, and grand total.
6. User optionally links the invoice to a project/order.
7. User attaches the scanned invoice document (or links an already-uploaded scan).
8. User saves the invoice (status: "Recorded").
9. User optionally approves the invoice for payment (status: "Approved").

### Alternate Flows
- **AF-1: OCR pre-fill** -- Invoice data is pre-filled from OCR results (ACC-007). User reviews and corrects extracted data before saving.
- **AF-2: Duplicate detection** -- System warns if a supplier invoice number already exists for the same supplier.
- **AF-3: Multi-approval** -- Invoices above a configurable threshold require a second approver before payment release.

### Postconditions
- Supplier invoice is recorded in the AP ledger with all line items and allocations.
- The invoice appears in open payables (ACC-005).
- Attached documents are stored in the document archive (ACC-009).

### Acceptance Criteria
1. A supplier invoice can be recorded with all required fields in under 2 minutes (manual entry).
2. Duplicate supplier invoice numbers for the same supplier trigger a warning before save.
3. Account allocation supports at least 20 line items per invoice.
4. VAT is calculated per line item with Swiss rates (8.1%, 2.6%, 0%).
5. Invoices can be linked to projects/orders for cost tracking.
6. Invoice approval status is tracked with timestamps and approver identity.

---

## ACC-005: Open Payables Management

| Field | Value |
|-------|-------|
| **ID** | ACC-005 |
| **Title** | Open Payables Management |
| **Priority** | High |
| **Complexity** | Medium |
| **Dependencies** | ACC-004 |
| **Tags** | `accounting`, `AP`, `payables`, `reporting` |

### Description
The system shall maintain and display a list of all open (unpaid or partially paid) supplier invoices. The view supports filtering by supplier, date range, aging, and amount. Users can select invoices for payment batch creation.

### Actors
- **Finance staff** -- reviews open payables, prepares payment runs.

### Preconditions
1. At least one recorded supplier invoice exists with outstanding balance.

### Main Flow
1. User navigates to the open payables view.
2. System displays all supplier invoices with outstanding balances: supplier name, invoice number, invoice date, due date, total, paid, outstanding, days until/past due.
3. User filters and sorts as needed.
4. User selects invoices for a payment batch.
5. System calculates the total payment batch amount.
6. User initiates the payment run (generates a pain.001 payment file or manual payment list).

### Alternate Flows
- **AF-1: Export** -- User exports payables list as CSV or PDF.
- **AF-2: Payment scheduling** -- User schedules payments for a future date, optimizing for due dates and cash flow.
- **AF-3: Dispute** -- User flags an invoice as disputed; it is excluded from payment runs until resolved.

### Postconditions
- Open payables list reflects current state.
- Payment batches are created and available for bank submission.

### Acceptance Criteria
1. Open payables list loads within 3 seconds for up to 5,000 open invoices.
2. Payment batch creation generates a valid ISO 20022 pain.001 file.
3. Disputed invoices are visually distinguished and excluded from payment batches.
4. Aging is calculated based on due date vs. current date.
5. Batch totals match the sum of selected invoice outstanding amounts exactly.

---

## ACC-006: Supplier Invoice Upload/Scan

| Field | Value |
|-------|-------|
| **ID** | ACC-006 |
| **Title** | Supplier Invoice Upload/Scan |
| **Priority** | High |
| **Complexity** | Medium |
| **Dependencies** | ACC-009 |
| **Tags** | `accounting`, `AP`, `document`, `upload`, `scan` |

### Description
The system shall allow users to upload supplier invoice documents (PDF, JPEG, PNG, TIFF) from desktop or scan them using a connected scanner. Uploaded documents are stored in the document archive and can be linked to supplier invoice records. Batch upload of multiple documents is supported.

### Actors
- **Finance staff** -- uploads or scans invoices from desktop.
- **Field technician** -- captures invoices via mobile camera (ACC-013).

### Preconditions
1. User has `accounting:ap:upload` permission.

### Main Flow
1. User navigates to the invoice upload area.
2. User selects one or more files from the file system or initiates a scan.
3. System uploads the files, validates file type and size (max 20 MB per file).
4. System stores documents in the archive with metadata (upload date, uploader, file name, size).
5. System queues documents for OCR processing (ACC-007).
6. User can immediately link the document to an existing or new supplier invoice record.

### Alternate Flows
- **AF-1: Batch upload** -- User uploads multiple files at once. Each file is processed individually.
- **AF-2: Invalid file type** -- System rejects the file with a clear error message listing supported formats.
- **AF-3: Scanner integration** -- User initiates a scan from a TWAIN/WIA-compatible scanner; the scanned image is uploaded automatically.

### Postconditions
- Document is stored in the archive with metadata.
- Document is queued for OCR processing.
- Document can be linked to a supplier invoice record.

### Acceptance Criteria
1. Supported file types: PDF, JPEG, PNG, TIFF.
2. Maximum file size: 20 MB per document.
3. Batch upload supports up to 50 documents in a single operation.
4. Uploaded documents are available in the archive within 5 seconds of upload completion.
5. Documents are automatically queued for OCR upon upload.
6. Upload progress is displayed for large files.

---

## ACC-007: OCR-Supported Invoice Data Recognition

| Field | Value |
|-------|-------|
| **ID** | ACC-007 |
| **Title** | OCR-Supported Invoice Data Recognition |
| **Priority** | High |
| **Complexity** | High |
| **Dependencies** | ACC-006 |
| **Tags** | `accounting`, `AP`, `OCR`, `automation` |

### Description
The system shall apply OCR (Optical Character Recognition) to uploaded supplier invoice documents to extract structured data: supplier name, supplier address, invoice number, invoice date, due date, line items (description, quantity, unit price, total), VAT amounts, and grand total. Extracted data is presented for human review and confirmation before being used to create or pre-fill a supplier invoice record.

### Actors
- **System (OCR engine)** -- processes documents and extracts data.
- **Finance staff** -- reviews, corrects, and confirms extracted data.

### Preconditions
1. A document has been uploaded and queued for OCR (ACC-006).
2. OCR engine/service is available and configured.

### Main Flow
1. System receives a queued document for OCR processing.
2. OCR engine analyzes the document image/PDF.
3. System extracts structured fields: supplier name, address, invoice number, date, due date, line items, VAT, total.
4. System attempts to match the supplier name/address against existing supplier records.
5. System presents the extracted data in a review form alongside the original document image.
6. Finance staff reviews, corrects any misrecognized fields, and confirms.
7. System uses the confirmed data to create or pre-fill a supplier invoice record (ACC-004).

### Alternate Flows
- **AF-1: Low-confidence extraction** -- Fields with low OCR confidence are highlighted in yellow; user pays special attention to these.
- **AF-2: Unrecognizable document** -- OCR fails to extract meaningful data. User is notified and must enter data manually.
- **AF-3: Supplier not matched** -- Extracted supplier does not match any existing record. User can create a new supplier inline or manually select one.
- **AF-4: Multi-page invoice** -- OCR processes all pages and consolidates data into a single extraction result.

### Postconditions
- Extracted and confirmed data is used to create/pre-fill a supplier invoice record.
- OCR confidence scores are logged for quality monitoring.

### Acceptance Criteria
1. OCR extracts supplier name, invoice number, date, and total amount with at least 85% accuracy on clearly printed invoices.
2. Extracted data is presented in a side-by-side review view (document image + extracted fields).
3. Low-confidence fields are visually highlighted for user attention.
4. OCR processing completes within 30 seconds per single-page document.
5. Multi-page documents (up to 10 pages) are processed as a single unit.
6. Confirmed OCR data pre-fills the supplier invoice form; user can edit all fields before saving.
7. OCR supports German, French, and Italian text (Swiss national languages).

---

## ACC-008: Supplier & Accounting Structure Allocation

| Field | Value |
|-------|-------|
| **ID** | ACC-008 |
| **Title** | Supplier & Accounting Structure Allocation |
| **Priority** | Medium |
| **Complexity** | Medium |
| **Dependencies** | ACC-004 |
| **Tags** | `accounting`, `AP`, `chart-of-accounts`, `allocation` |

### Description
The system shall support allocation of supplier invoice line items to accounting accounts (chart of accounts), cost centers, and projects/orders. A configurable chart of accounts (based on Swiss KMU Kontenrahmen or company-specific) is maintained. Default account mappings can be defined per supplier or article category to accelerate data entry.

### Actors
- **Finance staff** -- allocates invoice line items to accounts and cost centers.
- **Back-office administrator** -- maintains the chart of accounts and default mappings.

### Preconditions
1. Chart of accounts is configured in the system.
2. Supplier invoice exists (ACC-004).

### Main Flow
1. During supplier invoice entry, user selects an account for each line item.
2. System suggests a default account based on supplier or article category mappings.
3. User accepts or overrides the suggestion.
4. User optionally assigns a cost center or project/order reference.
5. System validates that allocations balance to the invoice total.
6. System saves the allocations.

### Alternate Flows
- **AF-1: Split allocation** -- A single line item is split across multiple accounts or cost centers.
- **AF-2: Missing account** -- User requests a new account; administrator adds it to the chart of accounts.
- **AF-3: Default mapping configuration** -- Administrator creates rules: "For supplier X, default to account Y."

### Postconditions
- Each invoice line item has an account allocation.
- Allocations are recorded in the accounting journal.

### Acceptance Criteria
1. The chart of accounts supports at least 500 accounts with hierarchical grouping.
2. Default account suggestions are applied automatically based on configured supplier/category mappings.
3. Split allocation allows a line item to be distributed across up to 10 accounts.
4. Account allocation is mandatory; invoices cannot be approved without complete allocation.
5. The chart of accounts is configurable by an administrator without developer intervention.

---

## ACC-009: Document Archive Storage

| Field | Value |
|-------|-------|
| **ID** | ACC-009 |
| **Title** | Document Archive Storage |
| **Priority** | Medium |
| **Complexity** | Medium |
| **Dependencies** | None (infrastructure) |
| **Tags** | `accounting`, `documents`, `archive`, `storage` |

### Description
The system shall provide a durable, searchable document archive for all accounting-related documents (supplier invoices, receipts, bank statements, payment confirmations). Documents are stored with metadata, linked to accounting records, and retained according to Swiss legal requirements (10 years for business documents per Swiss Code of Obligations Art. 958f).

### Actors
- **Finance staff** -- uploads, views, and searches documents.
- **System** -- stores documents, enforces retention policies.
- **Auditor** -- views archived documents (read-only).

### Preconditions
1. Storage infrastructure is configured and accessible.

### Main Flow
1. A document is uploaded or generated (invoice PDF, scan, bank statement).
2. System stores the document in the archive with metadata: document type, upload date, related record (invoice ID, payment ID), uploader, file hash.
3. System indexes the document for full-text search (if text-based or OCR-processed).
4. User searches the archive by metadata or full-text content.
5. User views or downloads the document.

### Alternate Flows
- **AF-1: Retention enforcement** -- System prevents deletion of documents within the retention period. After 10 years, documents are flagged for review/archival.
- **AF-2: Bulk download** -- User downloads a batch of documents as a ZIP file for audit purposes.
- **AF-3: Version control** -- If a document is replaced, the original version is retained as a prior version.

### Postconditions
- Document is durably stored with metadata and links to accounting records.
- Document is searchable.

### Acceptance Criteria
1. Documents are stored with 99.99% durability (redundant storage).
2. Documents cannot be deleted within the 10-year retention period.
3. Full-text search returns results within 3 seconds across up to 100,000 documents.
4. Each document is linked to at least one accounting record.
5. Bulk download supports up to 500 documents in a single ZIP archive.
6. File integrity is verifiable via stored hash (SHA-256).

---

## ACC-010: Bank Connection Interface

| Field | Value |
|-------|-------|
| **ID** | ACC-010 |
| **Title** | Bank Connection Interface |
| **Priority** | High |
| **Complexity** | High |
| **Dependencies** | None (external integration) |
| **Tags** | `accounting`, `banking`, `ISO-20022`, `integration` |

### Description
The system shall support bank connectivity using Swiss ISO 20022 standards for importing bank statements (camt.053 end-of-day, camt.054 intraday notifications) and exporting payment orders (pain.001 credit transfers, pain.002 status reports). The interface supports manual file upload/download or automated EBICS/SFTP connectivity where available.

### Actors
- **Finance staff** -- imports statements, exports payment orders.
- **System** -- parses ISO 20022 messages, matches transactions.
- **Bank** -- provides statements, processes payment orders (external).

### Preconditions
1. Bank account details are configured in the system.
2. ISO 20022 message formats are supported by the connected bank.

### Main Flow
1. Finance staff navigates to the bank connection interface.
2. User uploads a camt.053 or camt.054 file (or system retrieves it automatically via EBICS/SFTP).
3. System parses the XML file and extracts transactions: date, amount, reference, payer/payee, booking text.
4. System displays imported transactions for review.
5. User triggers reconciliation (ACC-011).
6. For outgoing payments, user generates a pain.001 file from approved payables.
7. User downloads the pain.001 file or system transmits it via EBICS/SFTP.

### Alternate Flows
- **AF-1: Automated retrieval** -- System polls the bank EBICS/SFTP endpoint on a schedule (e.g., daily at 06:00) and imports new statements automatically.
- **AF-2: Parse error** -- System detects an invalid or unsupported XML format; displays an error with details of the parsing failure.
- **AF-3: Multi-bank** -- System supports multiple bank accounts across different banks; each configured separately.

### Postconditions
- Bank transactions are imported and available for reconciliation.
- Payment orders are generated in valid ISO 20022 format.

### Acceptance Criteria
1. camt.053 and camt.054 files are parsed correctly according to Swiss ISO 20022 standards.
2. pain.001 files generated by the system are accepted by major Swiss banks (UBS, Credit Suisse/UBS, PostFinance, ZKB, Raiffeisen).
3. Automated retrieval via EBICS or SFTP is configurable per bank account.
4. Import of a statement with 1,000 transactions completes within 30 seconds.
5. Multi-bank support allows at least 5 configured bank connections.
6. Parse errors provide actionable details (line number, expected vs. actual element).

---

## ACC-011: Automatic/Semi-Automatic Payment Reconciliation

| Field | Value |
|-------|-------|
| **ID** | ACC-011 |
| **Title** | Automatic/Semi-Automatic Payment Reconciliation |
| **Priority** | High |
| **Complexity** | High |
| **Dependencies** | ACC-002, ACC-005, ACC-010 |
| **Tags** | `accounting`, `reconciliation`, `automation` |

### Description
The system shall automatically match imported bank transactions against open receivables and payables. Matching criteria include: QR reference number (ESR/QR-bill), amount, customer/supplier name, and booking text. Unmatched transactions are presented for manual reconciliation. The system learns from manual matches to improve future suggestions.

### Actors
- **System** -- performs automatic matching.
- **Finance staff** -- reviews matches, resolves unmatched transactions.

### Preconditions
1. Bank transactions have been imported (ACC-010).
2. Open receivables (ACC-002) and/or payables (ACC-005) exist.

### Main Flow
1. System receives newly imported bank transactions.
2. System runs the matching algorithm:
   a. Match by QR/ESR reference number (exact match).
   b. Match by amount + customer/supplier name (fuzzy match).
   c. Match by booking text keywords.
3. System categorizes each transaction: Auto-Matched (high confidence), Suggested Match (medium confidence), Unmatched.
4. Auto-matched transactions are tentatively allocated (user can review/override).
5. Suggested matches are presented with the candidate invoice(s) for user confirmation.
6. Unmatched transactions are listed for manual allocation or categorization.
7. User confirms all matches.
8. System records the allocations and updates AR/AP balances.

### Alternate Flows
- **AF-1: Multiple candidates** -- System presents all candidate matches ranked by confidence; user selects the correct one.
- **AF-2: Non-invoice transaction** -- Transaction is a bank fee, interest, or other non-invoice item. User allocates it directly to an expense account.
- **AF-3: Learning** -- When a user manually matches a transaction, the system records the pattern for future auto-matching.

### Postconditions
- All imported transactions are reconciled (matched or manually categorized).
- AR/AP balances are updated.
- Accounting journal entries are created for all allocations.

### Acceptance Criteria
1. QR/ESR reference matching achieves 95%+ accuracy for transactions with valid references.
2. Overall auto-match rate is at least 70% for a typical month's transactions.
3. Reconciliation of 500 transactions completes within 5 minutes (auto-matching phase).
4. Unmatched transactions are clearly listed with all available transaction details.
5. Manual matches are recorded and used to improve future matching suggestions.
6. Each reconciliation action creates an audit trail entry.

---

## ACC-012: Cash Management

| Field | Value |
|-------|-------|
| **ID** | ACC-012 |
| **Title** | Cash Management |
| **Priority** | Medium |
| **Complexity** | Medium |
| **Dependencies** | ACC-002, ACC-005, ACC-010 |
| **Tags** | `accounting`, `cash`, `liquidity`, `dashboard` |

### Description
The system shall provide a cash management dashboard showing current bank balances, expected incoming payments (from open receivables with due dates), expected outgoing payments (from open payables with due dates), and a projected cash flow timeline. This enables MB Boiler to monitor liquidity and plan payment scheduling.

### Actors
- **Finance staff** -- monitors cash position.
- **Management** -- reviews liquidity outlook.

### Preconditions
1. Bank balances are available (imported via ACC-010 or manually entered).
2. Open receivables and payables exist with due dates.

### Main Flow
1. User navigates to the cash management dashboard.
2. System displays: current bank balances per account, total liquid funds, receivables due in the next 7/14/30/60/90 days, payables due in the next 7/14/30/60/90 days, projected net cash position per period.
3. User views a timeline chart of projected cash flow.
4. User drills down into any period to see the underlying invoices.

### Alternate Flows
- **AF-1: Manual balance entry** -- User manually enters or adjusts a bank balance if automated import is not available.
- **AF-2: What-if scenario** -- User adjusts payment timing (e.g., delay a payable) to see the impact on projected cash flow.

### Postconditions
- Cash management view is displayed with current data.

### Acceptance Criteria
1. Dashboard loads within 5 seconds.
2. Bank balances reflect the latest imported statement or manual entry.
3. Cash flow projection covers at least 90 days forward.
4. Drill-down from any projection period shows the contributing invoices.
5. The timeline chart visualizes inflows, outflows, and net balance per week.

---

## ACC-013: Mobile Document Scanning

| Field | Value |
|-------|-------|
| **ID** | ACC-013 |
| **Title** | Mobile Document Scanning |
| **Priority** | Medium |
| **Complexity** | Medium |
| **Dependencies** | ACC-006, ACC-009 |
| **Tags** | `accounting`, `mobile`, `scanning`, `camera` |

### Description
The system shall allow users to capture documents (receipts, invoices, delivery notes) using the mobile device camera. The app provides edge detection, perspective correction, and image enhancement to produce high-quality scans. Captured images are uploaded to the document archive and can be linked to accounting records.

### Actors
- **Field technician** -- captures receipts and supplier invoices in the field.
- **Any mobile user** -- scans documents on the go.

### Preconditions
1. User is authenticated on the mobile app.
2. Device has a functioning camera.
3. Network connectivity is available (or offline queue is active).

### Main Flow
1. User opens the document scanner in the mobile app.
2. User positions the document within the camera viewfinder.
3. App detects document edges and provides visual guides for alignment.
4. User captures the image.
5. App applies perspective correction and image enhancement (contrast, brightness, de-skew).
6. User reviews the scan and can retake if unsatisfied.
7. User adds metadata: document type (receipt, invoice, delivery note), optional notes, optional project/order reference.
8. User submits the scan.
9. App uploads the image to the document archive (ACC-009).
10. Document is queued for OCR processing if it is an invoice (ACC-007).

### Alternate Flows
- **AF-1: Multi-page scan** -- User captures multiple pages in sequence; app combines them into a single multi-page document.
- **AF-2: Offline capture** -- User scans a document without network connectivity. The scan is stored locally and uploaded when connectivity is restored.
- **AF-3: Retake** -- User discards the capture and takes a new photo.

### Postconditions
- Scanned document is stored in the archive with metadata.
- If an invoice, it is queued for OCR.

### Acceptance Criteria
1. Edge detection accurately identifies document boundaries on a contrasting background.
2. Perspective correction produces a rectangular, de-skewed output image.
3. Scan-to-upload completes within 10 seconds on a 4G connection.
4. Offline scans are queued and uploaded automatically upon connectivity restoration.
5. Multi-page scanning supports up to 20 pages per document.
6. Output image resolution is sufficient for OCR processing (minimum 300 DPI equivalent).

---

## ACC-014: Document Allocation to Employees

| Field | Value |
|-------|-------|
| **ID** | ACC-014 |
| **Title** | Document Allocation to Employees |
| **Priority** | Medium |
| **Complexity** | Low |
| **Dependencies** | ACC-009, Module 01 (User Management) |
| **Tags** | `accounting`, `documents`, `workflow`, `assignment` |

### Description
The system shall allow uploaded/scanned documents to be allocated (assigned) to specific employees for review, processing, or approval. This supports the workflow where a field technician scans a receipt and it must be reviewed by the finance team, or a supplier invoice needs project manager approval.

### Actors
- **Finance staff** -- allocates documents to employees.
- **Any user** -- uploads a document and assigns it to a responsible person.
- **Assigned employee** -- receives notification and processes the document.

### Preconditions
1. Document exists in the archive.
2. Target employee has an active user account.

### Main Flow
1. User views an unallocated document in the archive or upload queue.
2. User selects "Assign to Employee."
3. User searches for and selects the target employee.
4. User optionally adds a note (e.g., "Please approve for Project X").
5. System records the allocation with timestamp.
6. System sends a notification to the assigned employee (push notification, in-app, email per preference).
7. Assigned employee opens the document, processes it, and marks it as "Processed."

### Alternate Flows
- **AF-1: Reassignment** -- Document is reassigned from one employee to another. Original assignee is notified of the reassignment.
- **AF-2: Bulk allocation** -- User selects multiple documents and assigns them all to the same employee.
- **AF-3: Auto-allocation rules** -- System automatically assigns documents based on rules (e.g., receipts from technician A always go to finance user B).

### Postconditions
- Document is allocated to the target employee.
- Notification is sent.
- Allocation is recorded with timestamp and actor.

### Acceptance Criteria
1. Documents can be assigned to any active employee.
2. Assigned employee receives a notification within 60 seconds.
3. Document allocation history (all assignments) is visible on the document detail view.
4. Bulk allocation supports up to 50 documents at once.
5. Auto-allocation rules can be configured by administrators.

---

## ACC-015: Accounting Journal

| Field | Value |
|-------|-------|
| **ID** | ACC-015 |
| **Title** | Accounting Journal |
| **Priority** | High |
| **Complexity** | Medium |
| **Dependencies** | ACC-001, ACC-003, ACC-004, ACC-008 |
| **Tags** | `accounting`, `journal`, `ledger`, `core` |

### Description
The system shall maintain a chronological accounting journal recording all financial transactions: invoice postings (AR/AP), payments, allocations, write-offs, and corrections. Each journal entry contains a sequential entry number, date, description, debit account, credit account, amount, reference (invoice/payment ID), and actor. The journal is append-only; corrections are made via reversal entries, not edits.

### Actors
- **System** -- automatically creates journal entries for financial transactions.
- **Finance staff** -- views journal, creates manual entries, creates correction entries.
- **Auditor** -- views journal (read-only).

### Preconditions
1. Chart of accounts is configured.
2. A financial transaction has occurred (invoice, payment, etc.).

### Main Flow
1. A financial transaction occurs (e.g., invoice finalized, payment recorded).
2. System automatically creates a journal entry with: sequential number, date, description, debit account, credit account, amount, reference, actor.
3. Journal entry is appended to the journal (immutable).
4. User navigates to the journal view and sees all entries in chronological order.
5. User filters by date range, account, reference, or actor.

### Alternate Flows
- **AF-1: Manual journal entry** -- Finance staff creates a manual entry (e.g., for adjustments, year-end postings). Same fields required.
- **AF-2: Correction/reversal** -- To correct an error, a reversal entry is created that negates the original entry. Both entries reference each other.
- **AF-3: Export** -- User exports the journal for a date range as CSV for import into external accounting software (e.g., Sage 50).

### Postconditions
- Journal entry is immutably recorded.
- Account balances are updated.

### Acceptance Criteria
1. Journal entries are sequentially numbered without gaps.
2. Journal entries are immutable; no edits or deletions are possible.
3. Corrections are made exclusively via reversal entries that reference the original.
4. The journal view supports filtering by date range, account, reference, and actor.
5. Export to CSV includes all fields and is formatted for Sage 50 import compatibility.
6. Journal loads within 3 seconds for up to 100,000 entries with applied filters.

---

## ACC-016: Account Overviews

| Field | Value |
|-------|-------|
| **ID** | ACC-016 |
| **Title** | Account Overviews |
| **Priority** | Medium |
| **Complexity** | Medium |
| **Dependencies** | ACC-015, ACC-008 |
| **Tags** | `accounting`, `reports`, `accounts`, `dashboard` |

### Description
The system shall provide per-account overview screens showing the account balance and all transactions posted to that account within a selected period. Accounts from the chart of accounts can be viewed individually or in hierarchical groups. The overview shows opening balance, transactions (debits and credits), and closing balance.

### Actors
- **Finance staff** -- views account balances and transaction details.
- **Management** -- reviews summary account balances.

### Preconditions
1. Chart of accounts is configured.
2. Journal entries exist for the selected period.

### Main Flow
1. User navigates to the account overview section.
2. User selects an account or account group from the chart of accounts tree.
3. User selects a date range (defaults to current month).
4. System displays: opening balance, list of transactions (date, description, debit/credit, running balance), closing balance.
5. User clicks a transaction to navigate to the source document (invoice, payment, journal entry).

### Alternate Flows
- **AF-1: Account group summary** -- User selects a parent account; system shows the combined balance of all child accounts.
- **AF-2: Period comparison** -- User compares balances across two periods (e.g., this month vs. last month).
- **AF-3: Export** -- User exports the account overview as PDF or CSV.

### Postconditions
- Account overview is displayed with accurate balances.

### Acceptance Criteria
1. Account overview loads within 3 seconds for accounts with up to 10,000 transactions in the selected period.
2. Opening and closing balances are mathematically correct (opening + debits - credits = closing for asset accounts).
3. Each transaction links to its source document.
4. Account group summary aggregates child account balances correctly.
5. Period comparison shows delta amounts and percentage changes.
6. Export produces well-formatted PDF with MB Boiler header or CSV with all columns.

---

## ACC-017: Open-Item Management

| Field | Value |
|-------|-------|
| **ID** | ACC-017 |
| **Title** | Open-Item Management |
| **Priority** | High |
| **Complexity** | Medium |
| **Dependencies** | ACC-002, ACC-005 |
| **Tags** | `accounting`, `open-items`, `AR`, `AP`, `reporting` |

### Description
The system shall provide a unified open-item management view combining both open receivables (AR) and open payables (AP). This view supports aged analysis, customer/supplier statements, and provides the basis for dunning (AR) and payment planning (AP). Open items are automatically cleared when fully paid.

### Actors
- **Finance staff** -- manages open items, generates statements, runs aging analysis.
- **Management** -- reviews open-item summary for financial oversight.

### Preconditions
1. Open receivables and/or payables exist in the system.

### Main Flow
1. User navigates to the open-item management view.
2. System displays a combined or filtered view (AR only, AP only, or both) of all open items.
3. User views aging analysis: current, 1-30 days overdue, 31-60 days, 61-90 days, 90+ days.
4. User selects a customer or supplier to generate a statement showing all open items for that entity.
5. User can trigger dunning for overdue AR items or schedule payments for due AP items.

### Alternate Flows
- **AF-1: Customer statement** -- User generates a PDF statement for a customer listing all open invoices, payments received, and current balance. Statement can be emailed to the customer.
- **AF-2: Automatic clearing** -- When a payment fully covers an invoice, the system automatically marks the item as cleared with the clearing date.
- **AF-3: Partial clearing** -- Partial payments reduce the open amount; the item remains open until fully cleared.
- **AF-4: Netting** -- For entities that are both customer and supplier, user can net AR and AP items against each other.

### Postconditions
- Open-item view reflects the current state of all AR and AP items.
- Statements and aging reports are generated on demand.

### Acceptance Criteria
1. Open-item view loads within 3 seconds with up to 15,000 combined AR/AP items.
2. Aging analysis correctly categorizes items based on due date vs. current date.
3. Customer/supplier statements are generated as PDF with all open items, payments, and running balance.
4. Automatic clearing occurs within seconds of payment allocation.
5. Netting can be performed between AR and AP items for the same entity.
6. The view provides summary totals: total AR open, total AP open, net position.
