# Module 08: Quotations & Order Processing -- Technical Design

---

## 1. Architecture Overview

The Quotations & Order Processing module is a core transactional module that manages the commercial document lifecycle. It follows a domain-driven design with clear aggregate boundaries for Quotations, Orders, and Invoices.

```
[UI Layer (Web/Mobile)]
        |
[API Gateway]
        |
[Quotation Service]  [Order Service]  [Invoice Service]
        |                   |                |
   [Quotation Agg.]   [Order Agg.]    [Invoice Agg.]
        \                  |                /
         \                 |               /
          [Document Numbering Service]
          [Notification Service]
          [Document Generation (MOD-09)]
          [CRM Integration (MOD-03)]
```

---

## 2. Data Models

### 2.1 Quotation

```json
{
  "id": "uuid",
  "quotationNumber": "string (e.g., OFF-2026-0042)",
  "customerId": "uuid",
  "customerName": "string (denormalized)",
  "contactId": "uuid | null",
  "projectId": "uuid | null",
  "departmentId": "uuid",
  "status": "draft | sent | viewed | accepted | declined | expired | cancelled | converted",
  "language": "de | fr | it | en",
  "title": "string",
  "introduction": "string | null",
  "validFrom": "ISO8601 date",
  "validUntil": "ISO8601 date",
  "currency": "CHF | EUR",
  "lineItems": [
    {
      "id": "uuid",
      "position": "integer",
      "type": "service | material | text | subtotal | optional",
      "catalogItemId": "uuid | null",
      "description": "string",
      "unit": "string (h, Stk, m, m2, kg, Pau, etc.)",
      "quantity": "decimal",
      "unitPrice": "decimal",
      "discountPercent": "decimal",
      "vatRate": "decimal (0.081 | 0.026 | 0)",
      "lineTotal": "decimal (calculated)"
    }
  ],
  "globalDiscountPercent": "decimal | null",
  "subtotal": "decimal",
  "vatBreakdown": [
    { "rate": "decimal", "base": "decimal", "amount": "decimal" }
  ],
  "grandTotal": "decimal",
  "roundingAmount": "decimal",
  "grandTotalRounded": "decimal",
  "paymentTerms": "string",
  "notes": "string | null",
  "termsAndConditions": "string | null",
  "assignedUserId": "uuid",
  "sentAt": "ISO8601 | null",
  "acceptedAt": "ISO8601 | null",
  "declinedAt": "ISO8601 | null",
  "declineReason": "string | null",
  "convertedOrderId": "uuid | null",
  "sourceQuotationId": "uuid | null (for duplicates)",
  "documents": [
    {
      "id": "uuid",
      "type": "pdf",
      "version": "integer",
      "fileUrl": "string",
      "generatedAt": "ISO8601"
    }
  ],
  "reminders": [
    {
      "id": "uuid",
      "type": "follow_up | expiration_warning",
      "scheduledAt": "ISO8601",
      "sentAt": "ISO8601 | null",
      "snoozedUntil": "ISO8601 | null"
    }
  ],
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "createdBy": "uuid",
  "updatedBy": "uuid"
}
```

### 2.2 Order

```json
{
  "id": "uuid",
  "orderNumber": "string (e.g., AUF-2026-0018)",
  "sourceQuotationId": "uuid | null",
  "sourceQuotationNumber": "string | null",
  "customerId": "uuid",
  "customerName": "string",
  "contactId": "uuid | null",
  "projectId": "uuid | null",
  "departmentId": "uuid",
  "status": "confirmed | in_progress | completed | cancelled",
  "language": "de | fr | it | en",
  "title": "string",
  "lineItems": "same structure as quotation lineItems",
  "subtotal": "decimal",
  "vatBreakdown": "same structure as quotation",
  "grandTotal": "decimal",
  "grandTotalRounded": "decimal",
  "paymentTerms": "string",
  "requestedDate": "ISO8601 date | null",
  "assignedTeam": "string | null",
  "specialInstructions": "string | null",
  "orderConfirmationDocId": "uuid | null",
  "invoiceIds": ["uuid"],
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "createdBy": "uuid",
  "updatedBy": "uuid"
}
```

### 2.3 Invoice

```json
{
  "id": "uuid",
  "invoiceNumber": "string (e.g., RE-2026-0105)",
  "invoiceType": "standard | advance | final | credit_note",
  "sourceOrderId": "uuid | null",
  "sourceQuotationId": "uuid | null",
  "customerId": "uuid",
  "customerName": "string",
  "contactId": "uuid | null",
  "projectId": "uuid | null",
  "departmentId": "uuid",
  "status": "draft | sent | partially_paid | paid | overdue | cancelled",
  "language": "de | fr | it | en",
  "title": "string",
  "invoiceDate": "ISO8601 date",
  "dueDate": "ISO8601 date",
  "currency": "CHF | EUR",
  "lineItems": "same structure as quotation lineItems",
  "advanceDeductions": [
    {
      "advanceInvoiceId": "uuid",
      "advanceInvoiceNumber": "string",
      "advanceInvoiceDate": "ISO8601 date",
      "netAmount": "decimal",
      "vatAmount": "decimal",
      "totalAmount": "decimal"
    }
  ],
  "subtotal": "decimal",
  "advanceDeductionTotal": "decimal",
  "netSubtotal": "decimal",
  "vatBreakdown": [
    { "rate": "decimal", "base": "decimal", "amount": "decimal" }
  ],
  "grandTotal": "decimal",
  "roundingAmount": "decimal",
  "grandTotalRounded": "decimal",
  "amountPaid": "decimal",
  "amountDue": "decimal",
  "paymentTermsDays": "integer",
  "paymentTermsText": "string",
  "payments": [
    {
      "id": "uuid",
      "date": "ISO8601 date",
      "amount": "decimal",
      "reference": "string | null",
      "method": "bank_transfer | cash | card | other",
      "note": "string | null",
      "recordedBy": "uuid",
      "recordedAt": "ISO8601"
    }
  ],
  "milestoneDescription": "string | null (for advance invoices)",
  "milestonePercent": "decimal | null",
  "documents": "same as quotation documents",
  "sentAt": "ISO8601 | null",
  "paidAt": "ISO8601 | null",
  "cancelledAt": "ISO8601 | null",
  "cancellationReason": "string | null",
  "createdAt": "ISO8601",
  "updatedAt": "ISO8601",
  "createdBy": "uuid",
  "updatedBy": "uuid"
}
```

### 2.4 Document Number Sequence

```json
{
  "id": "uuid",
  "documentType": "quotation | order | invoice",
  "departmentId": "uuid | null (null = global)",
  "prefix": "string (e.g., OFF, AUF, RE)",
  "yearFormat": "YYYY | YY | none",
  "separator": "string (e.g., -, /)",
  "paddingLength": "integer (e.g., 4)",
  "currentValue": "integer",
  "resetsAnnually": "boolean",
  "currentYear": "integer",
  "isActive": "boolean"
}
```

### 2.5 Appointment Reminder

```json
{
  "id": "uuid",
  "appointmentId": "uuid",
  "customerId": "uuid",
  "channel": "whatsapp | email | both",
  "scheduledAt": "ISO8601",
  "sentAt": "ISO8601 | null",
  "deliveredAt": "ISO8601 | null",
  "readAt": "ISO8601 | null",
  "status": "pending | sent | delivered | read | failed | responded",
  "customerResponse": "confirmed | reschedule | null",
  "customerResponseAt": "ISO8601 | null",
  "language": "de | fr | it | en",
  "messageContent": "string",
  "retryCount": "integer",
  "lastError": "string | null"
}
```

---

## 3. Database Schema

```sql
-- Quotations
CREATE TABLE quotations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_number        VARCHAR(30) NOT NULL UNIQUE,
    customer_id             UUID NOT NULL REFERENCES customers(id),
    customer_name           VARCHAR(255) NOT NULL,
    contact_id              UUID REFERENCES contacts(id),
    project_id              UUID REFERENCES projects(id),
    department_id           UUID NOT NULL REFERENCES departments(id),
    status                  VARCHAR(20) NOT NULL DEFAULT 'draft',
    language                VARCHAR(5) NOT NULL DEFAULT 'de',
    title                   VARCHAR(500) NOT NULL,
    introduction            TEXT,
    valid_from              DATE NOT NULL,
    valid_until             DATE NOT NULL,
    currency                VARCHAR(3) NOT NULL DEFAULT 'CHF',
    global_discount_percent DECIMAL(5,2),
    subtotal                DECIMAL(12,2) NOT NULL DEFAULT 0,
    grand_total             DECIMAL(12,2) NOT NULL DEFAULT 0,
    rounding_amount         DECIMAL(12,2) DEFAULT 0,
    grand_total_rounded     DECIMAL(12,2) NOT NULL DEFAULT 0,
    payment_terms           TEXT,
    notes                   TEXT,
    terms_and_conditions    TEXT,
    assigned_user_id        UUID NOT NULL REFERENCES users(id),
    sent_at                 TIMESTAMPTZ,
    accepted_at             TIMESTAMPTZ,
    declined_at             TIMESTAMPTZ,
    decline_reason          TEXT,
    converted_order_id      UUID,
    source_quotation_id     UUID REFERENCES quotations(id),
    source                  VARCHAR(30) DEFAULT 'manual',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by              UUID NOT NULL REFERENCES users(id),
    updated_by              UUID NOT NULL REFERENCES users(id)
);

-- Line Items (shared for quotations, orders, invoices)
CREATE TABLE document_line_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type     VARCHAR(20) NOT NULL,
    document_id       UUID NOT NULL,
    position          INTEGER NOT NULL,
    item_type         VARCHAR(20) NOT NULL DEFAULT 'service',
    catalog_item_id   UUID,
    description       TEXT NOT NULL,
    unit              VARCHAR(20),
    quantity          DECIMAL(12,3),
    unit_price        DECIMAL(12,2),
    discount_percent  DECIMAL(5,2) DEFAULT 0,
    vat_rate          DECIMAL(5,4) NOT NULL DEFAULT 0.081,
    line_total        DECIMAL(12,2) NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_line_items_document ON document_line_items(document_type, document_id);
CREATE INDEX idx_line_items_position ON document_line_items(document_id, position);

-- VAT Breakdown
CREATE TABLE document_vat_breakdown (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type VARCHAR(20) NOT NULL,
    document_id   UUID NOT NULL,
    vat_rate      DECIMAL(5,4) NOT NULL,
    base_amount   DECIMAL(12,2) NOT NULL,
    vat_amount    DECIMAL(12,2) NOT NULL
);

CREATE INDEX idx_vat_document ON document_vat_breakdown(document_type, document_id);

-- Orders
CREATE TABLE orders (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number                VARCHAR(30) NOT NULL UNIQUE,
    source_quotation_id         UUID REFERENCES quotations(id),
    source_quotation_number     VARCHAR(30),
    customer_id                 UUID NOT NULL REFERENCES customers(id),
    customer_name               VARCHAR(255) NOT NULL,
    contact_id                  UUID REFERENCES contacts(id),
    project_id                  UUID REFERENCES projects(id),
    department_id               UUID NOT NULL REFERENCES departments(id),
    status                      VARCHAR(20) NOT NULL DEFAULT 'confirmed',
    language                    VARCHAR(5) NOT NULL DEFAULT 'de',
    title                       VARCHAR(500) NOT NULL,
    subtotal                    DECIMAL(12,2) NOT NULL DEFAULT 0,
    grand_total                 DECIMAL(12,2) NOT NULL DEFAULT 0,
    grand_total_rounded         DECIMAL(12,2) NOT NULL DEFAULT 0,
    payment_terms               TEXT,
    requested_date              DATE,
    assigned_team               VARCHAR(255),
    special_instructions        TEXT,
    order_confirmation_doc_id   UUID,
    source                      VARCHAR(30) DEFAULT 'conversion',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by                  UUID NOT NULL REFERENCES users(id),
    updated_by                  UUID NOT NULL REFERENCES users(id)
);

-- Invoices
CREATE TABLE invoices (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number          VARCHAR(30) NOT NULL UNIQUE,
    invoice_type            VARCHAR(20) NOT NULL DEFAULT 'standard',
    source_order_id         UUID REFERENCES orders(id),
    source_quotation_id     UUID REFERENCES quotations(id),
    customer_id             UUID NOT NULL REFERENCES customers(id),
    customer_name           VARCHAR(255) NOT NULL,
    contact_id              UUID REFERENCES contacts(id),
    project_id              UUID REFERENCES projects(id),
    department_id           UUID NOT NULL REFERENCES departments(id),
    status                  VARCHAR(20) NOT NULL DEFAULT 'draft',
    language                VARCHAR(5) NOT NULL DEFAULT 'de',
    title                   VARCHAR(500) NOT NULL,
    invoice_date            DATE NOT NULL,
    due_date                DATE NOT NULL,
    currency                VARCHAR(3) NOT NULL DEFAULT 'CHF',
    subtotal                DECIMAL(12,2) NOT NULL DEFAULT 0,
    advance_deduction_total DECIMAL(12,2) DEFAULT 0,
    net_subtotal            DECIMAL(12,2) NOT NULL DEFAULT 0,
    grand_total             DECIMAL(12,2) NOT NULL DEFAULT 0,
    rounding_amount         DECIMAL(12,2) DEFAULT 0,
    grand_total_rounded     DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount_paid             DECIMAL(12,2) NOT NULL DEFAULT 0,
    amount_due              DECIMAL(12,2) NOT NULL DEFAULT 0,
    payment_terms_days      INTEGER NOT NULL DEFAULT 30,
    payment_terms_text      TEXT,
    milestone_description   TEXT,
    milestone_percent       DECIMAL(5,2),
    sent_at                 TIMESTAMPTZ,
    paid_at                 TIMESTAMPTZ,
    cancelled_at            TIMESTAMPTZ,
    cancellation_reason     TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by              UUID NOT NULL REFERENCES users(id),
    updated_by              UUID NOT NULL REFERENCES users(id)
);

-- Advance Deductions (on final invoices)
CREATE TABLE invoice_advance_deductions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id              UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    advance_invoice_id      UUID NOT NULL REFERENCES invoices(id),
    advance_invoice_number  VARCHAR(30) NOT NULL,
    advance_invoice_date    DATE NOT NULL,
    net_amount              DECIMAL(12,2) NOT NULL,
    vat_amount              DECIMAL(12,2) NOT NULL,
    total_amount            DECIMAL(12,2) NOT NULL
);

CREATE INDEX idx_advance_deductions_invoice ON invoice_advance_deductions(invoice_id);

-- Payments
CREATE TABLE invoice_payments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    payment_date  DATE NOT NULL,
    amount        DECIMAL(12,2) NOT NULL,
    reference     VARCHAR(255),
    method        VARCHAR(30) NOT NULL DEFAULT 'bank_transfer',
    note          TEXT,
    recorded_by   UUID NOT NULL REFERENCES users(id),
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_invoice ON invoice_payments(invoice_id);

-- Document Number Sequences
CREATE TABLE document_number_sequences (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type     VARCHAR(20) NOT NULL,
    department_id     UUID REFERENCES departments(id),
    prefix            VARCHAR(10) NOT NULL,
    year_format       VARCHAR(4) NOT NULL DEFAULT 'YYYY',
    separator         VARCHAR(2) NOT NULL DEFAULT '-',
    padding_length    INTEGER NOT NULL DEFAULT 4,
    current_value     INTEGER NOT NULL DEFAULT 0,
    resets_annually   BOOLEAN NOT NULL DEFAULT true,
    current_year      INTEGER NOT NULL,
    is_active         BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(document_type, department_id, current_year)
);

-- Appointment Reminders
CREATE TABLE appointment_reminders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_id      UUID NOT NULL,
    customer_id         UUID NOT NULL REFERENCES customers(id),
    channel             VARCHAR(20) NOT NULL,
    scheduled_at        TIMESTAMPTZ NOT NULL,
    sent_at             TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    read_at             TIMESTAMPTZ,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending',
    customer_response   VARCHAR(20),
    customer_response_at TIMESTAMPTZ,
    language            VARCHAR(5) NOT NULL DEFAULT 'de',
    message_content     TEXT NOT NULL,
    retry_count         INTEGER NOT NULL DEFAULT 0,
    last_error          TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reminders_status ON appointment_reminders(status, scheduled_at);
CREATE INDEX idx_reminders_appointment ON appointment_reminders(appointment_id);

-- Document attachments (generated PDFs)
CREATE TABLE document_attachments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type   VARCHAR(20) NOT NULL,
    document_id     UUID NOT NULL,
    file_type       VARCHAR(10) NOT NULL DEFAULT 'pdf',
    version         INTEGER NOT NULL DEFAULT 1,
    file_url        TEXT NOT NULL,
    file_size_bytes BIGINT,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by    UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_doc_attachments ON document_attachments(document_type, document_id);

-- Quotation reminders tracking
CREATE TABLE quotation_reminders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quotation_id    UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
    reminder_type   VARCHAR(30) NOT NULL,
    scheduled_at    TIMESTAMPTZ NOT NULL,
    sent_at         TIMESTAMPTZ,
    snoozed_until   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quotation_reminders ON quotation_reminders(quotation_id);

-- Status audit log
CREATE TABLE document_status_log (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type   VARCHAR(20) NOT NULL,
    document_id     UUID NOT NULL,
    from_status     VARCHAR(20),
    to_status       VARCHAR(20) NOT NULL,
    changed_by      UUID NOT NULL REFERENCES users(id),
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason          TEXT,
    metadata        JSONB
);

CREATE INDEX idx_status_log_document ON document_status_log(document_type, document_id);
CREATE INDEX idx_status_log_changed ON document_status_log(changed_at);
```

---

## 4. REST API Endpoints

### 4.1 Quotations

```
POST   /api/v1/quotations                              -- Create quotation
GET    /api/v1/quotations                              -- List quotations (with filters)
GET    /api/v1/quotations/{id}                         -- Get quotation details
PUT    /api/v1/quotations/{id}                         -- Update quotation
DELETE /api/v1/quotations/{id}                         -- Delete draft quotation
POST   /api/v1/quotations/{id}/duplicate               -- Duplicate quotation
PATCH  /api/v1/quotations/{id}/status                  -- Change status
POST   /api/v1/quotations/{id}/send                    -- Send to customer (email)
POST   /api/v1/quotations/{id}/convert                 -- Convert to order
GET    /api/v1/quotations/{id}/documents               -- List generated documents
POST   /api/v1/quotations/{id}/documents/generate      -- Generate PDF
GET    /api/v1/quotations/{id}/history                  -- Status change history
POST   /api/v1/quotations/{id}/reminders/{remId}/snooze -- Snooze reminder
```

#### Create Quotation -- Request Body

```json
{
  "customerId": "uuid",
  "contactId": "uuid | null",
  "projectId": "uuid | null",
  "departmentId": "uuid",
  "language": "de",
  "title": "Heizungssanierung EFH Musterstrasse 10",
  "introduction": "Gerne unterbreiten wir Ihnen folgende Offerte...",
  "validFrom": "2026-03-29",
  "validUntil": "2026-04-28",
  "currency": "CHF",
  "lineItems": [
    {
      "type": "service",
      "catalogItemId": "uuid | null",
      "description": "Demontage alte Heizungsanlage",
      "unit": "Pau",
      "quantity": 1,
      "unitPrice": 2500.00,
      "discountPercent": 0,
      "vatRate": 0.081
    }
  ],
  "globalDiscountPercent": null,
  "paymentTerms": "30 Tage netto",
  "notes": null,
  "termsAndConditions": null
}
```

#### List Quotations -- Query Parameters

```
GET /api/v1/quotations?
  status=sent,viewed
  &customerId=uuid
  &departmentId=uuid
  &assignedUserId=uuid
  &dateFrom=2026-01-01
  &dateTo=2026-03-31
  &amountMin=1000
  &amountMax=50000
  &search=Musterstrasse
  &sortBy=created_at
  &sortOrder=desc
  &page=1
  &pageSize=25
```

#### Change Status -- Request Body

```json
{
  "status": "accepted",
  "reason": "Kunde hat per Telefon zugesagt"
}
```

### 4.2 Orders

```
POST   /api/v1/orders                                 -- Create order (direct)
GET    /api/v1/orders                                 -- List orders (with filters)
GET    /api/v1/orders/{id}                            -- Get order details
PUT    /api/v1/orders/{id}                            -- Update order
PATCH  /api/v1/orders/{id}/status                     -- Change status
GET    /api/v1/orders/{id}/invoices                   -- List related invoices
POST   /api/v1/orders/{id}/documents/generate         -- Generate order confirmation PDF
GET    /api/v1/orders/{id}/history                    -- Status change history
```

### 4.3 Invoices

```
POST   /api/v1/invoices                               -- Create invoice
GET    /api/v1/invoices                               -- List invoices (with filters)
GET    /api/v1/invoices/{id}                          -- Get invoice details
PUT    /api/v1/invoices/{id}                          -- Update draft invoice
PATCH  /api/v1/invoices/{id}/status                   -- Change status
POST   /api/v1/invoices/{id}/finalize                 -- Finalize invoice
POST   /api/v1/invoices/{id}/send                     -- Send to customer
POST   /api/v1/invoices/{id}/payments                 -- Record payment
GET    /api/v1/invoices/{id}/payments                 -- List payments
POST   /api/v1/invoices/{id}/documents/generate       -- Generate PDF
POST   /api/v1/invoices/advance                       -- Create advance invoice
POST   /api/v1/invoices/final                         -- Create final invoice (with advance deduction)
GET    /api/v1/invoices/{id}/history                   -- Status change history
```

#### Create Advance Invoice -- Request Body

```json
{
  "sourceOrderId": "uuid",
  "projectId": "uuid",
  "departmentId": "uuid",
  "milestoneDescription": "Anzahlung Auftragsbeginn",
  "milestonePercent": 30,
  "fixedAmount": null,
  "language": "de",
  "paymentTermsDays": 10
}
```

#### Create Final Invoice -- Request Body

```json
{
  "sourceOrderId": "uuid",
  "projectId": "uuid",
  "departmentId": "uuid",
  "language": "de",
  "autoDeductAdvances": true,
  "lineItemOverrides": [],
  "paymentTermsDays": 30
}
```

#### Record Payment -- Request Body

```json
{
  "date": "2026-03-28",
  "amount": 5000.00,
  "reference": "ESR-Ref 12345678901234567890",
  "method": "bank_transfer",
  "note": "1. Teilzahlung"
}
```

### 4.4 Document Numbering

```
GET    /api/v1/numbering/sequences                    -- List all sequences
POST   /api/v1/numbering/sequences                    -- Create sequence
PUT    /api/v1/numbering/sequences/{id}               -- Update sequence config
GET    /api/v1/numbering/sequences/{id}/preview       -- Preview next number
POST   /api/v1/numbering/sequences/{id}/next          -- Get and reserve next number (internal)
```

### 4.5 Appointment Reminders

```
GET    /api/v1/reminders/appointments                 -- List reminders (with filters)
POST   /api/v1/reminders/appointments                 -- Create manual reminder
GET    /api/v1/reminders/appointments/{id}            -- Get reminder details
PATCH  /api/v1/reminders/appointments/{id}/status     -- Update status (from webhook)
GET    /api/v1/reminders/appointments/stats            -- Reminder statistics
```

### 4.6 Search & Aggregation

```
GET    /api/v1/documents/search?q=term&type=all       -- Global document search
GET    /api/v1/documents/customer/{customerId}        -- All documents for customer
GET    /api/v1/documents/project/{projectId}          -- All documents for project
GET    /api/v1/invoices/aging                          -- Invoice aging report
GET    /api/v1/quotations/pipeline                    -- Quotation pipeline summary
```

---

## 5. Event Flows

### 5.1 Domain Events (Published)

| Event Name                          | Trigger                                        | Key Payload                                   |
|-------------------------------------|-------------------------------------------------|-----------------------------------------------|
| `quotation.created`                 | New quotation saved                             | quotationId, customerId, departmentId, total  |
| `quotation.status_changed`          | Status transition                               | quotationId, fromStatus, toStatus, reason     |
| `quotation.sent`                    | Quotation dispatched to customer                | quotationId, customerId, channel              |
| `quotation.accepted`               | Quotation marked accepted                       | quotationId, customerId, total                |
| `quotation.expired`                | Auto-expiration                                 | quotationId, customerId                       |
| `quotation.converted`              | Converted to order                              | quotationId, orderId, orderNumber             |
| `order.created`                     | New order created                               | orderId, quotationId, customerId              |
| `order.confirmed`                  | Order confirmed                                 | orderId, customerId, total                    |
| `order.status_changed`             | Order status transition                         | orderId, fromStatus, toStatus                 |
| `invoice.created`                   | New invoice created                             | invoiceId, invoiceType, customerId, total     |
| `invoice.finalized`                | Invoice finalized (no more edits)               | invoiceId, invoiceNumber, total               |
| `invoice.sent`                     | Invoice dispatched                              | invoiceId, customerId, channel                |
| `invoice.payment_recorded`         | Payment recorded on invoice                     | invoiceId, paymentAmount, remainingBalance    |
| `invoice.paid`                     | Invoice fully paid                              | invoiceId, customerId, total                  |
| `invoice.overdue`                  | Invoice past due date                           | invoiceId, customerId, amount, daysPastDue    |
| `reminder.sent`                    | Appointment reminder dispatched                 | reminderId, appointmentId, channel            |
| `reminder.customer_responded`       | Customer responded to reminder                  | reminderId, response                          |

### 5.2 Consumed Events

| Event                             | Source Module  | Action                                                     |
|-----------------------------------|----------------|-------------------------------------------------------------|
| `customer.updated`                | MOD-03         | Update denormalized customer name/address on open documents |
| `appointment.scheduled`           | MOD-05         | Schedule appointment reminders                              |
| `appointment.rescheduled`         | MOD-05         | Cancel existing reminders, schedule new ones                |
| `appointment.cancelled`           | MOD-05         | Cancel pending reminders                                    |
| `ai.order.create_requested`       | MOD-07         | Create order from voice assistant data                      |
| `document.generated`              | MOD-09         | Link generated PDF to the document record                   |

---

## 6. Integration Points

### 6.1 CRM Integration (MOD-03)

- **Customer lookup:** `GET /api/v1/customers/search?q={term}`
- **Customer details:** `GET /api/v1/customers/{id}`
- **Language preference:** Read from customer record for document language.
- **Document timeline:** Register documents with CRM for customer document tab.

### 6.2 Document Templates (MOD-09)

- **Generate document:** `POST /api/v1/documents/generate`
  ```json
  {
    "templateType": "quotation | order_confirmation | invoice | advance_invoice | final_invoice",
    "language": "de",
    "data": { "...document data payload..." },
    "outputFormat": "pdf"
  }
  ```
- **Email dispatch:** `POST /api/v1/documents/{docId}/send`

### 6.3 Scheduling & Dispatch (MOD-05)

- Subscribe to appointment events for reminder scheduling.
- Query appointments for reminder batch processing.

### 6.4 Accounting & Finance (MOD-11)

- **Invoice export:** `POST /api/v1/accounting/entries`
  ```json
  {
    "source": "invoice",
    "sourceId": "uuid",
    "invoiceNumber": "RE-2026-0105",
    "customerId": "uuid",
    "date": "2026-03-29",
    "amount": 10800.00,
    "vatAmount": 810.00,
    "currency": "CHF"
  }
  ```

### 6.5 WhatsApp Business API

- **Send template message:** `POST /v1/messages` (WhatsApp Cloud API)
- **Webhook for delivery status and replies:** `POST /api/v1/webhooks/whatsapp`
- Message templates must be pre-approved by WhatsApp.

### 6.6 Email Service

- **Send email with attachment:** Via SMTP or transactional email API (SendGrid, AWS SES).
- Email body templates stored in Module 09.
- Configurable sender address per department.

---

## 7. Business Logic

### 7.1 VAT Calculation

```
For each line item:
  lineNet = quantity * unitPrice * (1 - discountPercent/100)
  lineVat = lineNet * vatRate
  lineTotal = lineNet + lineVat

Subtotal = SUM(lineNet)
Total VAT = SUM(lineVat) grouped by vatRate
Grand Total = Subtotal + Total VAT - globalDiscount

If currency == CHF and rappenRoundingEnabled:
  Grand Total Rounded = ROUND(Grand Total / 0.05) * 0.05
  Rounding Amount = Grand Total Rounded - Grand Total
```

### 7.2 Advance Deduction Logic

```
For final invoice:
  1. Calculate full project total (as if no advances existed)
  2. Query all advance invoices for project WHERE status != 'cancelled'
  3. For each advance invoice:
     - Add deduction line: negative net amount
     - Add deduction VAT line: negative VAT amount (matching original rate)
  4. Net balance = Full total - SUM(advance deductions)
  5. Validate: Net balance >= 0 (else error)
  6. Final VAT = Full VAT - SUM(advance VAT deductions)
```

### 7.3 Document Numbering

```
function getNextNumber(documentType, departmentId):
  sequence = findSequence(documentType, departmentId)
  if sequence.resetsAnnually AND currentYear != sequence.currentYear:
    sequence.currentValue = 0
    sequence.currentYear = currentYear

  sequence.currentValue += 1  // atomic increment with row lock

  number = sequence.prefix
           + sequence.separator
           + formatYear(sequence.yearFormat)
           + sequence.separator
           + PAD(sequence.currentValue, sequence.paddingLength)

  return number  // e.g., "OFF-2026-0042"
```

---

## 8. Scheduled Jobs

| Job                         | Schedule       | Description                                          |
|-----------------------------|----------------|------------------------------------------------------|
| Quotation Expiration Check  | Daily 06:00    | Transitions expired quotations to "Expired" status   |
| Follow-Up Reminder Check    | Daily 08:00    | Generates follow-up reminders for open quotations    |
| Invoice Overdue Check       | Daily 07:00    | Transitions overdue invoices to "Overdue" status     |
| Appointment Reminder Dispatch| Every 15 min  | Sends pending appointment reminders                  |
| Number Sequence Year Reset  | Jan 1 00:01    | Resets annual numbering sequences                    |

---

## 9. Security & Access Control

| Permission                    | Roles                                    |
|-------------------------------|------------------------------------------|
| quotation.create              | Sales, Admin, Dispatcher                 |
| quotation.edit                | Sales (own), Admin                       |
| quotation.delete              | Admin                                    |
| quotation.send                | Sales, Admin                             |
| quotation.convert             | Sales, Admin, Dispatcher                 |
| order.create                  | Sales, Admin, Dispatcher                 |
| order.edit                    | Admin                                    |
| invoice.create                | Admin, Finance                           |
| invoice.finalize              | Admin, Finance                           |
| invoice.payment.record        | Admin, Finance                           |
| invoice.cancel                | Admin                                    |
| numbering.configure           | System Administrator                     |
| reminder.configure            | Admin, System Administrator              |

---

## 10. Performance Requirements

| Metric                                        | Target              |
|------------------------------------------------|---------------------|
| Document list loading (with filters)           | < 1s for 10K records|
| Full-text search                               | < 2s for 100K records|
| PDF generation                                 | < 5s per document   |
| Quotation-to-order conversion                  | < 3s                |
| Advance deduction calculation                  | < 2s for 20 advances|
| Concurrent document creation (no numbering gaps)| 100 users           |
| WhatsApp message dispatch throughput           | 100 messages/min    |
