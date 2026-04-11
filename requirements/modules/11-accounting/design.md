# Module 11: Accounting -- Design

---

## 1. REST API Design

### 1.1 Accounts Receivable -- Invoices

```
GET    /api/v1/accounting/ar/invoices                    # List AR invoices (paginated, filterable)
GET    /api/v1/accounting/ar/invoices/{id}               # Get invoice by ID
POST   /api/v1/accounting/ar/invoices                    # Create draft invoice
PUT    /api/v1/accounting/ar/invoices/{id}               # Update draft invoice
POST   /api/v1/accounting/ar/invoices/{id}/finalize      # Finalize invoice (Draft -> Sent)
POST   /api/v1/accounting/ar/invoices/{id}/cancel        # Cancel invoice (creates credit note)
POST   /api/v1/accounting/ar/invoices/{id}/send          # Send invoice via email
GET    /api/v1/accounting/ar/invoices/{id}/pdf           # Download invoice PDF
POST   /api/v1/accounting/ar/invoices/from-order/{orderId}  # Create invoice from order
POST   /api/v1/accounting/ar/credit-notes                # Create credit note
```

**Query parameters for GET /api/v1/accounting/ar/invoices:**
```
?customerId=<id>           # Filter by customer
&status=DRAFT|SENT|PAID|PARTIALLY_PAID|CANCELLED
&dateFrom=<date>           # Invoice date range
&dateTo=<date>
&dueDateFrom=<date>        # Due date range
&dueDateTo=<date>
&amountMin=<amount>        # Amount range
&amountMax=<amount>
&overdue=true|false        # Only overdue invoices
&page=1&size=50
&sort=invoiceNumber|date|dueDate|amount&order=asc|desc
```

**POST /api/v1/accounting/ar/invoices** -- Request Body:
```json
{
  "customerId": "cust-001",
  "invoiceDate": "2026-03-29",
  "dueDate": "2026-04-28",
  "paymentTermsDays": 30,
  "orderReference": "ORD-2026-0042",
  "projectReference": "PRJ-2026-0015",
  "lineItems": [
    {
      "position": 1,
      "articleId": "art-042",
      "description": "Brennwertkessel BW-200",
      "quantity": 1,
      "unit": "STK",
      "unitPrice": 12500.00,
      "vatRate": 8.1
    },
    {
      "position": 2,
      "description": "Installation und Inbetriebnahme",
      "quantity": 8,
      "unit": "h",
      "unitPrice": 135.00,
      "vatRate": 8.1
    }
  ],
  "notes": "Zahlbar innert 30 Tagen netto."
}
```

### 1.2 Open Receivables

```
GET    /api/v1/accounting/ar/receivables                 # List open receivables
GET    /api/v1/accounting/ar/receivables/aging            # Aging analysis
GET    /api/v1/accounting/ar/receivables/summary          # Summary totals
POST   /api/v1/accounting/ar/receivables/export           # Export as CSV/PDF
POST   /api/v1/accounting/ar/receivables/{id}/write-off  # Write off a receivable
```

### 1.3 Incoming Payments

```
GET    /api/v1/accounting/ar/payments                    # List payments
POST   /api/v1/accounting/ar/payments                    # Record manual payment
POST   /api/v1/accounting/ar/payments/{id}/allocate      # Allocate payment to invoice(s)
POST   /api/v1/accounting/ar/payments/import              # Import from bank statement
GET    /api/v1/accounting/ar/payments/{id}               # Get payment details
```

**POST /api/v1/accounting/ar/payments** -- Request Body:
```json
{
  "paymentDate": "2026-03-28",
  "amount": 13580.00,
  "currency": "CHF",
  "customerId": "cust-001",
  "paymentReference": "000000000000000000000012345",
  "bankAccountId": "bank-001",
  "allocations": [
    {
      "invoiceId": "inv-001",
      "amount": 13580.00
    }
  ]
}
```

### 1.4 Dunning

```
GET    /api/v1/accounting/ar/dunning/overdue             # List overdue invoices for dunning
POST   /api/v1/accounting/ar/dunning/generate            # Generate dunning letters
GET    /api/v1/accounting/ar/dunning/templates           # List dunning templates
PUT    /api/v1/accounting/ar/dunning/templates/{level}   # Update dunning template text
```

### 1.5 Accounts Payable -- Supplier Invoices

```
GET    /api/v1/accounting/ap/invoices                    # List AP invoices
GET    /api/v1/accounting/ap/invoices/{id}               # Get supplier invoice
POST   /api/v1/accounting/ap/invoices                    # Record supplier invoice
PUT    /api/v1/accounting/ap/invoices/{id}               # Update supplier invoice
POST   /api/v1/accounting/ap/invoices/{id}/approve       # Approve for payment
POST   /api/v1/accounting/ap/invoices/{id}/dispute       # Mark as disputed
GET    /api/v1/accounting/ap/invoices/{id}/document      # Download attached document
```

### 1.6 Open Payables

```
GET    /api/v1/accounting/ap/payables                    # List open payables
GET    /api/v1/accounting/ap/payables/aging              # Aging analysis
GET    /api/v1/accounting/ap/payables/summary            # Summary totals
POST   /api/v1/accounting/ap/payables/payment-batch      # Create payment batch (pain.001)
GET    /api/v1/accounting/ap/payables/payment-batch/{id} # Get batch details
GET    /api/v1/accounting/ap/payables/payment-batch/{id}/download  # Download pain.001 file
```

### 1.7 Document Upload & OCR

```
POST   /api/v1/accounting/documents/upload               # Upload document(s)
GET    /api/v1/accounting/documents/{id}                  # Get document metadata
GET    /api/v1/accounting/documents/{id}/download         # Download document file
GET    /api/v1/accounting/documents                       # List/search documents
POST   /api/v1/accounting/documents/{id}/ocr              # Trigger OCR processing
GET    /api/v1/accounting/documents/{id}/ocr/result       # Get OCR extraction result
POST   /api/v1/accounting/documents/{id}/ocr/confirm      # Confirm OCR data
POST   /api/v1/accounting/documents/{id}/assign           # Assign to employee
POST   /api/v1/accounting/documents/bulk-assign           # Bulk assign documents
```

**POST /api/v1/accounting/documents/upload** -- Multipart form data:
```
files: [binary file(s)]
documentType: SUPPLIER_INVOICE | RECEIPT | BANK_STATEMENT | OTHER
notes: "Invoice from Viessmann for project PRJ-2026-0015"
projectReference: "PRJ-2026-0015" (optional)
```

### 1.8 Bank Connection

```
GET    /api/v1/accounting/bank/accounts                  # List configured bank accounts
POST   /api/v1/accounting/bank/accounts                  # Add bank account
PUT    /api/v1/accounting/bank/accounts/{id}             # Update bank account config
POST   /api/v1/accounting/bank/import                    # Import bank statement (camt.053/054)
GET    /api/v1/accounting/bank/transactions               # List imported transactions
GET    /api/v1/accounting/bank/transactions/{id}         # Get transaction details
POST   /api/v1/accounting/bank/retrieve                  # Trigger automated retrieval (EBICS/SFTP)
```

### 1.9 Reconciliation

```
POST   /api/v1/accounting/reconciliation/run              # Run auto-matching on unreconciled transactions
GET    /api/v1/accounting/reconciliation/unmatched        # List unmatched transactions
GET    /api/v1/accounting/reconciliation/suggestions/{txId}  # Get match suggestions for a transaction
POST   /api/v1/accounting/reconciliation/match            # Confirm a match
POST   /api/v1/accounting/reconciliation/categorize       # Categorize a non-invoice transaction
```

### 1.10 Cash Management

```
GET    /api/v1/accounting/cash/balances                  # Current bank balances
GET    /api/v1/accounting/cash/forecast                  # Cash flow forecast (receivables + payables)
POST   /api/v1/accounting/cash/balances/manual           # Manually set/adjust a balance
```

### 1.11 Journal & Account Overviews

```
GET    /api/v1/accounting/journal                        # List journal entries (paginated, filterable)
GET    /api/v1/accounting/journal/{id}                   # Get journal entry details
POST   /api/v1/accounting/journal                        # Create manual journal entry
POST   /api/v1/accounting/journal/{id}/reverse           # Create reversal entry
POST   /api/v1/accounting/journal/export                 # Export journal (CSV for Sage 50)
GET    /api/v1/accounting/accounts                       # List chart of accounts
GET    /api/v1/accounting/accounts/{id}                  # Get account details with transactions
GET    /api/v1/accounting/accounts/{id}/balance           # Get account balance for period
POST   /api/v1/accounting/accounts                       # Create account
PUT    /api/v1/accounting/accounts/{id}                  # Update account
```

### 1.12 Open-Item Management

```
GET    /api/v1/accounting/open-items                     # Combined AR/AP open items
GET    /api/v1/accounting/open-items/aging               # Combined aging analysis
POST   /api/v1/accounting/open-items/statement/{entityId}  # Generate customer/supplier statement
GET    /api/v1/accounting/open-items/statement/{entityId}/pdf  # Download statement PDF
POST   /api/v1/accounting/open-items/net/{entityId}     # Perform netting for an entity
```

### 1.13 Chart of Accounts Configuration

```
GET    /api/v1/accounting/chart-of-accounts              # Full chart of accounts tree
POST   /api/v1/accounting/chart-of-accounts              # Create account
PUT    /api/v1/accounting/chart-of-accounts/{id}         # Update account
GET    /api/v1/accounting/chart-of-accounts/defaults     # Get default account mappings
PUT    /api/v1/accounting/chart-of-accounts/defaults     # Update default account mappings
```

---

## 2. Data Models

### 2.1 Entity Relationship Overview

```
Customer (1) ──── (N) ArInvoice
ArInvoice (1) ──── (N) ArInvoiceLineItem
ArInvoice (1) ──── (N) ArPaymentAllocation
ArPayment (1) ──── (N) ArPaymentAllocation
Supplier (1) ──── (N) ApInvoice
ApInvoice (1) ──── (N) ApInvoiceLineItem
ApInvoice (N) ──── (1) Document
ApInvoice (1) ──── (N) AccountAllocation
BankAccount (1) ──── (N) BankTransaction
BankTransaction (1) ──── (N) ReconciliationMatch
JournalEntry (N) ──── (1) Account
Account (N) ──── (1) AccountGroup (parent)
Document (N) ──── (1) User (assignee)
OcrResult (1) ──── (1) Document
```

### 2.2 ArInvoice

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| invoice_number | VARCHAR(30) | UNIQUE, NOT NULL | Sequential invoice number |
| customer_id | UUID | FK -> Customer.id, NOT NULL | Customer |
| invoice_date | DATE | NOT NULL | Invoice date |
| due_date | DATE | NOT NULL | Payment due date |
| payment_terms_days | INTEGER | NOT NULL | Payment term in days |
| subtotal | DECIMAL(12,2) | NOT NULL | Net subtotal |
| vat_amount | DECIMAL(12,2) | NOT NULL | Total VAT |
| total_amount | DECIMAL(12,2) | NOT NULL | Gross total |
| paid_amount | DECIMAL(12,2) | NOT NULL, DEFAULT 0 | Amount paid so far |
| outstanding_amount | DECIMAL(12,2) | NOT NULL | Remaining balance (computed) |
| currency | CHAR(3) | NOT NULL, DEFAULT 'CHF' | |
| status | ENUM('DRAFT','SENT','PARTIALLY_PAID','PAID','CANCELLED','WRITTEN_OFF') | NOT NULL | |
| type | ENUM('INVOICE','CREDIT_NOTE') | NOT NULL, DEFAULT 'INVOICE' | |
| related_invoice_id | UUID | FK -> ArInvoice.id, NULLABLE | For credit notes: the original invoice |
| order_reference | VARCHAR(50) | | Linked order number |
| project_reference | VARCHAR(50) | | Linked project number |
| notes | TEXT | | Internal notes |
| pdf_document_id | UUID | FK -> Document.id, NULLABLE | Generated PDF |
| qr_reference | VARCHAR(27) | UNIQUE | Swiss QR-bill reference number |
| dunning_level | INTEGER | NOT NULL, DEFAULT 0 | Current dunning level (0 = none) |
| last_dunning_date | DATE | NULLABLE | |
| created_at | TIMESTAMP | NOT NULL | |
| created_by | UUID | FK -> User.id, NOT NULL | |
| finalized_at | TIMESTAMP | NULLABLE | |
| finalized_by | UUID | FK -> User.id, NULLABLE | |

**Indexes:** `idx_ar_invoice_customer (customer_id)`, `idx_ar_invoice_status (status)`, `idx_ar_invoice_due_date (due_date)`, `idx_ar_invoice_qr_ref (qr_reference)`

### 2.3 ArInvoiceLineItem

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| invoice_id | UUID | FK -> ArInvoice.id, NOT NULL | |
| position | INTEGER | NOT NULL | Line position |
| article_id | UUID | NULLABLE | Source catalog article |
| description | VARCHAR(1000) | NOT NULL | Line description |
| quantity | DECIMAL(12,3) | NOT NULL | |
| unit | VARCHAR(10) | NOT NULL | |
| unit_price | DECIMAL(12,2) | NOT NULL | |
| line_total | DECIMAL(12,2) | NOT NULL | quantity * unit_price |
| vat_rate | DECIMAL(5,2) | NOT NULL | VAT rate percentage |
| vat_amount | DECIMAL(12,2) | NOT NULL | VAT for this line |

### 2.4 ArPayment

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| payment_date | DATE | NOT NULL | |
| amount | DECIMAL(12,2) | NOT NULL | |
| currency | CHAR(3) | NOT NULL, DEFAULT 'CHF' | |
| customer_id | UUID | FK -> Customer.id, NOT NULL | |
| payment_reference | VARCHAR(50) | | QR/ESR reference |
| bank_account_id | UUID | FK -> BankAccount.id | |
| bank_transaction_id | UUID | FK -> BankTransaction.id, NULLABLE | Link to imported transaction |
| source | ENUM('MANUAL','BANK_IMPORT') | NOT NULL | |
| allocated_amount | DECIMAL(12,2) | NOT NULL, DEFAULT 0 | Total allocated |
| unallocated_amount | DECIMAL(12,2) | NOT NULL | Remaining unallocated |
| created_at | TIMESTAMP | NOT NULL | |
| created_by | UUID | FK -> User.id, NOT NULL | |

### 2.5 ArPaymentAllocation

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| payment_id | UUID | FK -> ArPayment.id, NOT NULL | |
| invoice_id | UUID | FK -> ArInvoice.id, NOT NULL | |
| amount | DECIMAL(12,2) | NOT NULL | Amount allocated to this invoice |
| allocated_at | TIMESTAMP | NOT NULL | |
| allocated_by | UUID | FK -> User.id, NOT NULL | |

### 2.6 ApInvoice

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| supplier_id | UUID | FK -> Supplier.id, NOT NULL | |
| supplier_invoice_number | VARCHAR(50) | NOT NULL | Supplier's invoice number |
| invoice_date | DATE | NOT NULL | |
| due_date | DATE | NOT NULL | |
| payment_terms_days | INTEGER | | |
| subtotal | DECIMAL(12,2) | NOT NULL | |
| vat_amount | DECIMAL(12,2) | NOT NULL | |
| total_amount | DECIMAL(12,2) | NOT NULL | |
| paid_amount | DECIMAL(12,2) | NOT NULL, DEFAULT 0 | |
| outstanding_amount | DECIMAL(12,2) | NOT NULL | |
| currency | CHAR(3) | NOT NULL, DEFAULT 'CHF' | |
| status | ENUM('RECORDED','APPROVED','PAID','PARTIALLY_PAID','DISPUTED','CANCELLED') | NOT NULL | |
| document_id | UUID | FK -> Document.id, NULLABLE | Scanned/uploaded invoice |
| project_reference | VARCHAR(50) | | Linked project |
| order_reference | VARCHAR(50) | | Linked order |
| approved_by | UUID | FK -> User.id, NULLABLE | |
| approved_at | TIMESTAMP | NULLABLE | |
| second_approver_id | UUID | FK -> User.id, NULLABLE | For amounts above threshold |
| second_approved_at | TIMESTAMP | NULLABLE | |
| created_at | TIMESTAMP | NOT NULL | |
| created_by | UUID | FK -> User.id, NOT NULL | |

**Unique constraint:** `UNIQUE(supplier_id, supplier_invoice_number)` -- prevents duplicate recording.

### 2.7 ApInvoiceLineItem

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| invoice_id | UUID | FK -> ApInvoice.id, NOT NULL | |
| position | INTEGER | NOT NULL | |
| description | VARCHAR(1000) | NOT NULL | |
| quantity | DECIMAL(12,3) | NOT NULL | |
| unit | VARCHAR(10) | | |
| unit_price | DECIMAL(12,2) | NOT NULL | |
| line_total | DECIMAL(12,2) | NOT NULL | |
| vat_rate | DECIMAL(5,2) | NOT NULL | |
| account_id | UUID | FK -> Account.id, NOT NULL | Expense account allocation |
| cost_center | VARCHAR(50) | | Optional cost center |

### 2.8 Document

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| file_path | VARCHAR(500) | NOT NULL | Storage path |
| file_name | VARCHAR(200) | NOT NULL | Original file name |
| file_size | INTEGER | NOT NULL | Size in bytes |
| mime_type | VARCHAR(50) | NOT NULL | |
| file_hash | CHAR(64) | NOT NULL | SHA-256 hash |
| document_type | ENUM('SUPPLIER_INVOICE','RECEIPT','BANK_STATEMENT','AR_INVOICE_PDF','PAYMENT_CONFIRMATION','OTHER') | NOT NULL | |
| ocr_status | ENUM('PENDING','PROCESSING','COMPLETED','FAILED','NOT_APPLICABLE') | NOT NULL, DEFAULT 'PENDING' | |
| assigned_to | UUID | FK -> User.id, NULLABLE | Employee assignment |
| assigned_at | TIMESTAMP | NULLABLE | |
| assigned_by | UUID | FK -> User.id, NULLABLE | |
| processing_status | ENUM('UNPROCESSED','IN_REVIEW','PROCESSED') | NOT NULL, DEFAULT 'UNPROCESSED' | |
| notes | TEXT | | |
| project_reference | VARCHAR(50) | | |
| retention_until | DATE | NOT NULL | Minimum retention date (10 years) |
| created_at | TIMESTAMP | NOT NULL | |
| created_by | UUID | FK -> User.id, NOT NULL | |

### 2.9 OcrResult

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| document_id | UUID | FK -> Document.id, UNIQUE, NOT NULL | |
| extracted_supplier_name | VARCHAR(200) | | |
| extracted_supplier_address | TEXT | | |
| extracted_invoice_number | VARCHAR(50) | | |
| extracted_invoice_date | DATE | | |
| extracted_due_date | DATE | | |
| extracted_total | DECIMAL(12,2) | | |
| extracted_vat | DECIMAL(12,2) | | |
| extracted_line_items | JSONB | | Array of extracted line items |
| matched_supplier_id | UUID | FK -> Supplier.id, NULLABLE | Auto-matched supplier |
| confidence_scores | JSONB | NOT NULL | Per-field confidence (0-1) |
| status | ENUM('EXTRACTED','CONFIRMED','REJECTED') | NOT NULL | |
| confirmed_by | UUID | FK -> User.id, NULLABLE | |
| confirmed_at | TIMESTAMP | NULLABLE | |
| processing_time_ms | INTEGER | | OCR processing duration |
| created_at | TIMESTAMP | NOT NULL | |

### 2.10 BankAccount

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| name | VARCHAR(100) | NOT NULL | Display name |
| iban | VARCHAR(34) | NOT NULL | IBAN |
| bic | VARCHAR(11) | | BIC/SWIFT code |
| bank_name | VARCHAR(200) | | |
| currency | CHAR(3) | NOT NULL, DEFAULT 'CHF' | |
| current_balance | DECIMAL(14,2) | | Last known balance |
| balance_date | DATE | | Date of last known balance |
| connection_type | ENUM('MANUAL','EBICS','SFTP') | NOT NULL, DEFAULT 'MANUAL' | |
| connection_config | JSONB | | Encrypted connection parameters |
| auto_retrieve_enabled | BOOLEAN | NOT NULL, DEFAULT FALSE | |
| auto_retrieve_schedule | VARCHAR(50) | | Cron expression |
| status | ENUM('ACTIVE','INACTIVE') | NOT NULL, DEFAULT 'ACTIVE' | |
| created_at | TIMESTAMP | NOT NULL | |

### 2.11 BankTransaction

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| bank_account_id | UUID | FK -> BankAccount.id, NOT NULL | |
| transaction_date | DATE | NOT NULL | Booking date |
| value_date | DATE | NOT NULL | Value date |
| amount | DECIMAL(12,2) | NOT NULL | Positive = credit, negative = debit |
| currency | CHAR(3) | NOT NULL | |
| reference | VARCHAR(100) | | Payment reference (QR/ESR) |
| payer_payee_name | VARCHAR(200) | | |
| payer_payee_iban | VARCHAR(34) | | |
| booking_text | TEXT | | Bank booking description |
| statement_id | VARCHAR(50) | | Source statement identifier |
| reconciliation_status | ENUM('UNMATCHED','AUTO_MATCHED','MANUALLY_MATCHED','CATEGORIZED') | NOT NULL, DEFAULT 'UNMATCHED' | |
| matched_invoice_id | UUID | NULLABLE | Matched AR/AP invoice |
| matched_account_id | UUID | FK -> Account.id, NULLABLE | For non-invoice categorization |
| imported_at | TIMESTAMP | NOT NULL | |

### 2.12 JournalEntry

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| entry_number | BIGINT | UNIQUE, NOT NULL, AUTO_INCREMENT | Sequential number |
| entry_date | DATE | NOT NULL | Posting date |
| description | VARCHAR(500) | NOT NULL | Posting description |
| debit_account_id | UUID | FK -> Account.id, NOT NULL | Debit account |
| credit_account_id | UUID | FK -> Account.id, NOT NULL | Credit account |
| amount | DECIMAL(12,2) | NOT NULL, CHECK > 0 | Posting amount |
| currency | CHAR(3) | NOT NULL, DEFAULT 'CHF' | |
| reference_type | ENUM('AR_INVOICE','AR_PAYMENT','AP_INVOICE','AP_PAYMENT','BANK_FEE','MANUAL','REVERSAL','WRITE_OFF') | NOT NULL | |
| reference_id | UUID | NULLABLE | ID of source document |
| reversal_of | UUID | FK -> JournalEntry.id, NULLABLE | Original entry being reversed |
| reversed_by | UUID | FK -> JournalEntry.id, NULLABLE | Reversal entry for this entry |
| created_at | TIMESTAMP | NOT NULL | |
| created_by | UUID | FK -> User.id, NOT NULL | |

**Constraint:** Journal entries are INSERT-only; no UPDATE or DELETE operations are permitted.

### 2.13 Account

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | |
| account_number | VARCHAR(10) | UNIQUE, NOT NULL | Account number |
| name | VARCHAR(200) | NOT NULL | Account name |
| type | ENUM('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE') | NOT NULL | |
| parent_id | UUID | FK -> Account.id, NULLABLE | Parent account for grouping |
| is_group | BOOLEAN | NOT NULL, DEFAULT FALSE | True if this is a group header |
| is_active | BOOLEAN | NOT NULL, DEFAULT TRUE | |
| default_vat_rate | DECIMAL(5,2) | NULLABLE | Default VAT rate for this account |
| created_at | TIMESTAMP | NOT NULL | |

---

## 3. Event Flows

### 3.1 Domain Events

| Event | Trigger | Payload | Consumers |
|-------|---------|---------|-----------|
| `accounting.ar.invoice.created` | Draft invoice created | Invoice ID, customer ID | Audit |
| `accounting.ar.invoice.finalized` | Invoice finalized | Invoice ID, amount, customer ID | Open items, journal, PDF generator |
| `accounting.ar.invoice.paid` | Invoice fully paid | Invoice ID | Open items, customer account |
| `accounting.ar.invoice.cancelled` | Invoice cancelled | Invoice ID, credit note ID | Open items, journal |
| `accounting.ar.payment.recorded` | Payment recorded | Payment ID, amount, customer ID | Open items, journal, reconciliation |
| `accounting.ar.payment.allocated` | Payment allocated to invoice | Payment ID, invoice ID, amount | Open items, journal |
| `accounting.ar.dunning.generated` | Dunning letter created | Invoice ID, dunning level | Notification, email |
| `accounting.ap.invoice.recorded` | Supplier invoice recorded | Invoice ID, supplier ID, amount | Open items, journal |
| `accounting.ap.invoice.approved` | Supplier invoice approved | Invoice ID, approver ID | Payment batch eligibility |
| `accounting.ap.payment_batch.created` | Payment batch generated | Batch ID, total amount, pain.001 | Bank connection |
| `accounting.document.uploaded` | Document uploaded | Document ID, type | OCR queue |
| `accounting.document.assigned` | Document assigned to employee | Document ID, assignee ID | Notification |
| `accounting.ocr.completed` | OCR extraction done | Document ID, confidence | Notification (finance staff) |
| `accounting.bank.statement.imported` | Bank statement imported | Statement ID, transaction count | Reconciliation trigger |
| `accounting.reconciliation.completed` | Reconciliation run done | Matched count, unmatched count | Notification |
| `accounting.journal.entry.created` | Journal entry posted | Entry ID, accounts, amount | Account balances |

### 3.2 Invoice Lifecycle Flow

```
                    ┌──────────┐
                    │  DRAFT   │
                    └────┬─────┘
                         │ finalize
                    ┌────▼─────┐        ┌─────────────────┐
                    │   SENT   │───────►│ PARTIALLY_PAID   │
                    └────┬─────┘        └────────┬─────────┘
                         │                       │
                         │ full payment          │ remaining payment
                         │                       │
                    ┌────▼─────┐                 │
                    │   PAID   │◄────────────────┘
                    └──────────┘

        SENT/PARTIALLY_PAID ──cancel──► CANCELLED (+ credit note)
        SENT/PARTIALLY_PAID ──write-off──► WRITTEN_OFF
```

### 3.3 OCR Processing Flow

```
Document uploaded (ACC-006)
  │
  ▼
Event: accounting.document.uploaded
  │
  ▼
OCR Worker picks up document from queue
  │
  ▼
OCR engine processes document:
  ├── Extract text layers (PDF) or perform image OCR
  ├── Identify key fields (supplier, invoice number, date, amounts)
  ├── Calculate confidence scores per field
  └── Attempt supplier matching against existing supplier records
  │
  ▼
OcrResult record created
  │
  ▼
Event: accounting.ocr.completed
  │
  ▼
Finance staff reviews extraction:
  ├── Correct misrecognized fields
  ├── Select/create supplier if not auto-matched
  └── Confirm data
  │
  ▼
Confirmed data pre-fills ApInvoice creation form (ACC-004)
  │
  ▼
ApInvoice created with document linked
```

### 3.4 Payment Reconciliation Flow

```
Bank statement imported (camt.053/054)
  │
  ▼
Event: accounting.bank.statement.imported
  │
  ▼
Reconciliation engine processes each transaction:
  │
  ├── Step 1: QR/ESR reference match
  │   └── Exact match on qr_reference → AUTO_MATCHED (high confidence)
  │
  ├── Step 2: Amount + customer/supplier match
  │   └── Amount matches open invoice + payer matches customer → SUGGESTED
  │
  ├── Step 3: Booking text keyword match
  │   └── Invoice number found in booking text → SUGGESTED
  │
  └── No match → UNMATCHED
  │
  ▼
Finance staff reviews:
  ├── Confirm auto-matches
  ├── Select from suggested matches
  ├── Manually match unmatched transactions
  └── Categorize non-invoice transactions (fees, interest)
  │
  ▼
System records allocations:
  ├── Update ArInvoice/ApInvoice paid amounts and statuses
  ├── Create JournalEntry for each allocation
  └── Store match pattern for learning
  │
  ▼
Event: accounting.reconciliation.completed
```

### 3.5 Payment Batch (AP) Flow

```
Finance selects approved AP invoices for payment
  │
  ▼
POST /api/v1/accounting/ap/payables/payment-batch
  │
  ▼
System validates:
  ├── All invoices are in APPROVED status
  ├── Supplier bank details (IBAN) are available
  └── Total batch amount is calculated
  │
  ▼
System generates pain.001 XML:
  ├── PaymentInformation per supplier
  ├── CreditTransferTransaction per invoice
  ├── Debtor = MB Boiler bank account
  └── File is stored and available for download
  │
  ▼
Finance downloads pain.001 and uploads to bank portal
  (or system transmits via EBICS/SFTP if configured)
  │
  ▼
Bank processes payments and returns pain.002 status
  │
  ▼
System processes pain.002:
  ├── ACCEPTED: mark invoices as PAID, create journal entries
  └── REJECTED: flag invoices, notify finance
```

---

## 4. Integration Points

### 4.1 Module 02 -- Customer Management
- AR invoices reference customers from the customer database.
- Customer address, payment terms, and contact details are used in invoice generation.
- Customer credit balances are tracked on the customer account.

### 4.2 Module 03 -- Quotation Management
- Accepted quotations can trigger invoice creation via `POST /api/v1/accounting/ar/invoices/from-quotation/{quotationId}`.
- Quotation line items are carried into invoice line items.

### 4.3 Module 04 -- Order/Project Management
- Orders trigger invoice creation upon completion.
- Supplier invoices are linked to projects/orders for cost tracking.
- Project cost reports aggregate AP invoices allocated to the project.

### 4.4 Module 07 -- Field-Service Reports
- Completed service reports can generate customer invoices.
- Materials consumed in reports become invoice line items.

### 4.5 Module 10 -- Material Catalogs
- Invoice line items can reference catalog articles.
- Catalog prices are used as default unit prices in invoice creation.

### 4.6 External: Swiss Banking (ISO 20022)
- **Inbound:**
  - `camt.053` -- End-of-day account statements (transactions, balances).
  - `camt.054` -- Intraday credit/debit notifications (for faster reconciliation).
- **Outbound:**
  - `pain.001` -- Credit transfer initiation (payment orders to bank).
  - `pain.002` -- Payment status report (from bank, confirming/rejecting payments).
- **Swiss QR-bill:** Invoices include a QR-bill payment slip per the Swiss Payment Standards (SPS). The QR reference (26-digit number + check digit) enables automatic matching of incoming payments.
- **Transport:** EBICS (Electronic Banking Internet Communication Standard) or SFTP, or manual file upload/download.

### 4.7 External: OCR Service
- OCR can be provided by an internal engine (e.g., Tesseract) or a cloud service (e.g., Azure Form Recognizer, Google Document AI).
- The OCR adapter is abstracted behind an interface to allow swapping providers.
- Language support: DE, FR, IT.
- Input: PDF or image (JPEG, PNG, TIFF).
- Output: structured JSON with field values and confidence scores.

### 4.8 External: Sage 50 (Export)
- Journal entries can be exported as CSV in a format compatible with Infoniqa Sage 50 import.
- This is a one-way export (no import from Sage 50 is in scope).
- Export format is configurable to match the customer's Sage 50 chart-of-accounts mapping.

---

## 5. Non-Functional Considerations

### 5.1 Performance
- Invoice creation and finalization: < 3 seconds.
- Open receivables/payables list: < 3 seconds for up to 10,000 items.
- Bank statement import (1,000 transactions): < 30 seconds.
- Auto-reconciliation (500 transactions): < 5 minutes.
- OCR processing: < 30 seconds per single-page document.
- Journal query with filters: < 3 seconds for up to 100,000 entries.

### 5.2 Data Integrity
- Journal entries are append-only (immutable). No UPDATE/DELETE.
- All financial amounts use DECIMAL(12,2) to avoid floating-point errors.
- Double-entry bookkeeping: every transaction has a debit and credit account.
- Invoice numbers are sequential and unique; generated within a database sequence.
- QR references are unique per invoice and follow the Swiss QR-bill specification.

### 5.3 Security
- Permissions: `accounting:ar:manage`, `accounting:ap:manage`, `accounting:ap:approve`, `accounting:ap:upload`, `accounting:journal:manage`, `accounting:journal:view`, `accounting:bank:manage`, `accounting:cash:view`.
- Bank connection credentials are stored encrypted (AES-256) at rest.
- Document archive access is permission-controlled.
- All financial operations are logged in the audit trail.

### 5.4 Compliance
- Swiss Code of Obligations Art. 958f: 10-year document retention.
- Swiss QR-bill standard (SPS 2022+) for invoice payment slips.
- ISO 20022 compliance for bank messaging.
- Swiss VAT rates: 8.1% (standard), 2.6% (reduced), 0% (exempt) -- configurable for future rate changes.
- CHF rounding: 0.05 rounding for cash transactions, 0.01 for electronic payments.

### 5.5 Auditability
- Every financial transaction creates a journal entry.
- Every journal entry references its source document.
- Document archive provides file integrity verification (SHA-256 hash).
- All user actions on financial records are logged with actor, timestamp, and action.
