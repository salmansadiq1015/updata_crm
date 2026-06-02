# Module 08: Quotations & Order Processing -- Detailed Requirements

---

## QOP-001: Quotation Creation & Management

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | QOP-001                                                                                        |
| **Title**         | Quotation Creation & Management                                                               |
| **Priority**      | High                                                                                           |
| **Complexity**    | High                                                                                           |
| **Tags**          | `quotation`, `creation`, `management`, `line-items`, `pricing`                                 |

### Description

The system shall allow users to create, edit, duplicate, and archive quotations. A quotation consists of a header (customer, project, validity, terms), line items (services, materials, quantities, unit prices, VAT), totals, and optional notes. Quotations can be created from scratch, duplicated from existing quotations, or generated from service catalog templates.

### Actors

- Sales Staff (primary)
- Back-Office Admin
- Dispatcher

### Preconditions

1. User has quotation creation permissions.
2. Customer record exists in CRM (MOD-03) or can be created inline.
3. Service/material catalog is available for line item selection (if applicable).

### Flow

1. User navigates to "New Quotation" or selects "Duplicate" on an existing quotation.
2. User selects or searches for the customer (auto-complete from CRM).
3. System populates customer address and contact details.
4. User optionally assigns the quotation to a project.
5. User sets validity period (default configurable per department, e.g., 30 days).
6. User adds line items:
   a. Select from service catalog or enter manually.
   b. Specify quantity, unit, unit price, discount (%), VAT rate.
   c. System calculates line total.
7. User adds optional text blocks (introduction, terms, notes).
8. System calculates subtotal, VAT breakdown, and grand total.
9. User saves as Draft.
10. User can edit, delete, or archive the quotation at any time while in Draft status.

### Postconditions

1. Quotation record is created with a unique quotation number (see QOP-012).
2. Quotation is linked to the customer and optionally to a project.
3. Quotation status is "Draft."
4. Quotation appears in the quotation list with search and filter capability.

### Acceptance Criteria

- [ ] User can create a quotation with at least 50 line items.
- [ ] Line items support manual entry and catalog selection.
- [ ] Discount can be applied per line item (%) and/or as a global discount.
- [ ] VAT rates are configurable (8.1% standard, 2.6% reduced, 0% exempt).
- [ ] Quotation validity date is auto-calculated from creation date + configured period.
- [ ] Duplicate quotation copies all fields except number and date.
- [ ] Archived quotations are hidden from default list view but searchable.
- [ ] Quotation can include optional/alternative line items (clearly marked).
- [ ] Multi-currency support: CHF default, EUR selectable.
- [ ] All monetary values are calculated to 2 decimal places (5-Rappen rounding for CHF if configured).

### Dependencies

- MOD-03: CRM & Customer Management
- QOP-012: Automatic Document Numbering

---

## QOP-002: Quotation Status Management

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | QOP-002                                                                                        |
| **Title**         | Quotation Status Management                                                                   |
| **Priority**      | High                                                                                           |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `quotation`, `status`, `workflow`, `tracking`                                                  |

### Description

The system shall track quotations through defined lifecycle stages with automatic and manual status transitions. Status changes are logged in the audit trail, and relevant stakeholders are notified of key transitions.

### Actors

- Sales Staff
- Back-Office Admin
- System (automatic transitions)

### Preconditions

1. Quotation record exists.

### Flow

1. Quotation is created in "Draft" status.
2. User sends quotation to customer (via email/PDF) --> status changes to "Sent."
3. If email tracking is available, viewing the email/PDF changes status to "Viewed" (optional).
4. Customer responds:
   a. Accepted --> User marks as "Accepted" (triggers QOP-004 conversion option).
   b. Declined --> User marks as "Declined" with optional reason.
5. If validity period expires without response --> system auto-transitions to "Expired."
6. User can manually reactivate an expired quotation (extends validity) --> status returns to "Sent."
7. At any point, a quotation can be "Cancelled" by an authorized user.

**Status Flow:**
```
Draft --> Sent --> Viewed --> Accepted --> Converted (to Order)
                          --> Declined
                --> Expired --> Reactivated (back to Sent)
      --> Cancelled
```

### Postconditions

1. Quotation status is updated.
2. Status change is recorded in the audit log with user, timestamp, and reason.
3. Notifications are sent to configured recipients on key status changes.

### Acceptance Criteria

- [ ] All defined statuses are implemented: Draft, Sent, Viewed, Accepted, Declined, Expired, Cancelled, Converted.
- [ ] Only valid status transitions are allowed (invalid transitions are rejected).
- [ ] Automatic expiration runs daily and transitions overdue quotations.
- [ ] Status change audit trail is visible on the quotation detail screen.
- [ ] Notification rules are configurable per status transition.
- [ ] Declined quotations capture an optional reason (free text or predefined list).
- [ ] Dashboard widget shows quotation count by status.

### Dependencies

- QOP-001: Quotation Creation
- QOP-003: Follow-Up Reminders (triggered by status)

---

## QOP-003: Open Quotation Follow-Up Reminders

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | QOP-003                                                                                        |
| **Title**         | Open Quotation Follow-Up Reminders                                                             |
| **Priority**      | Medium                                                                                         |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `quotation`, `reminder`, `follow-up`, `automation`, `notification`                             |

### Description

The system shall generate automated reminders for sales staff to follow up on open quotations. Reminders are triggered based on configurable time intervals after sending (e.g., 7 days, 14 days, 21 days) and when quotations are approaching their expiration date.

### Actors

- System (automated)
- Sales Staff (recipient)
- System Administrator (configuration)

### Preconditions

1. Quotation is in "Sent" or "Viewed" status.
2. Reminder rules are configured.

### Flow

1. System runs a daily scheduled job to evaluate open quotations.
2. For each quotation in "Sent" or "Viewed" status:
   a. Calculate days since sent.
   b. Check against configured reminder intervals.
   c. Check days until expiration.
3. If a reminder trigger is met and the reminder has not already been sent for this interval:
   a. Create an in-app notification for the assigned sales person.
   b. Optionally send an email reminder.
   c. Record that the reminder was sent.
4. Sales person views the reminder and takes action (call customer, resend quotation, mark as declined).

### Postconditions

1. Reminder notifications are delivered to the assigned sales person.
2. Reminder history is recorded on the quotation.

### Acceptance Criteria

- [ ] Reminder intervals are configurable per department (e.g., after 7, 14, 21 days).
- [ ] Expiration warning is sent X days before expiry (configurable, default 3 days).
- [ ] Reminders are not sent for quotations already accepted, declined, or cancelled.
- [ ] Each reminder interval triggers only one notification (no duplicates).
- [ ] Reminder notifications include a direct link to the quotation.
- [ ] Sales person can snooze a reminder for a configurable period.
- [ ] Reminder statistics are visible in the sales dashboard.

### Dependencies

- QOP-002: Quotation Status Management
- Notification service

---

## QOP-004: Quotation-to-Order Conversion

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | QOP-004                                                                                        |
| **Title**         | Quotation-to-Order Conversion                                                                 |
| **Priority**      | High                                                                                           |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `quotation`, `order`, `conversion`, `workflow`                                                 |

### Description

The system shall provide a one-click conversion of an accepted quotation into a confirmed order. The conversion carries over all line items, pricing, terms, customer data, and project assignment. The user can review and modify the order before final confirmation.

### Actors

- Sales Staff
- Back-Office Admin
- Dispatcher

### Preconditions

1. Quotation is in "Accepted" status.
2. User has order creation permissions.

### Flow

1. User opens an accepted quotation and clicks "Convert to Order."
2. System creates a new order record pre-populated with all quotation data:
   - Customer, contact, address
   - Line items (services, materials, quantities, prices, discounts)
   - Terms and conditions
   - Project assignment
3. System assigns a new order number (QOP-012).
4. User reviews the pre-populated order, makes adjustments if needed:
   - Modify line items, quantities, or prices.
   - Add order-specific fields (requested delivery date, assigned team, special instructions).
5. User confirms the order.
6. Quotation status is updated to "Converted" with a reference to the new order.
7. Order confirmation document is generated (QOP-005).

### Postconditions

1. A new order record exists, linked to the source quotation.
2. Quotation status is "Converted."
3. Order is in "Confirmed" status.
4. Bidirectional reference exists between quotation and order.

### Acceptance Criteria

- [ ] Conversion is available only for quotations in "Accepted" status.
- [ ] All quotation data is carried over to the order (no data loss).
- [ ] User can modify the order before final confirmation.
- [ ] Order receives a new sequential order number.
- [ ] Quotation status transitions to "Converted" automatically.
- [ ] The quotation cannot be converted more than once (guard against duplicates).
- [ ] Quotation detail screen shows a link to the resulting order.
- [ ] Order detail screen shows a link to the source quotation.
- [ ] Partial conversion (selecting specific line items) is supported.

### Dependencies

- QOP-001: Quotation Creation
- QOP-002: Quotation Status Management
- QOP-005: Order Confirmation Generation
- QOP-012: Automatic Document Numbering

---

## QOP-005: Order Confirmation Generation

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | QOP-005                                                                                        |
| **Title**         | Order Confirmation Generation                                                                  |
| **Priority**      | High                                                                                           |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `order`, `confirmation`, `document`, `pdf`                                                     |

### Description

The system shall automatically generate an order confirmation document when an order is confirmed. The document is rendered using the order confirmation template from Module 09, populated with order data, and made available for PDF download and email dispatch.

### Actors

- System (automated generation)
- Back-Office Admin (review and dispatch)
- Sales Staff

### Preconditions

1. Order is in "Confirmed" status.
2. Order confirmation template is configured in Module 09.

### Flow

1. Order is confirmed (via QOP-004 conversion or direct order creation).
2. System triggers document generation via Module 09 API.
3. Document data payload is assembled: customer info, order number, date, line items, totals, terms.
4. Module 09 renders the document as PDF.
5. PDF is stored and linked to the order record.
6. User is notified that the order confirmation is ready.
7. User reviews the PDF and dispatches via email (QOP-015) or downloads for printing.

### Postconditions

1. Order confirmation PDF is generated and stored.
2. Document is linked to the order and customer records.
3. Document is available for email dispatch.

### Acceptance Criteria

- [ ] Order confirmation PDF is generated automatically upon order confirmation.
- [ ] PDF contains all order details: customer, order number, date, line items, totals, terms.
- [ ] PDF adheres to CI guidelines (Module 09 / DOC-009).
- [ ] PDF is available for download within 5 seconds of generation.
- [ ] User can regenerate the PDF if order details are modified.
- [ ] Document is stored with version tracking.

### Dependencies

- QOP-004: Quotation-to-Order Conversion
- MOD-09: Document Templates (DOC-002, DOC-006, DOC-007)

---

## QOP-006: Document Assignment to Customers/Projects

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | QOP-006                                                                                        |
| **Title**         | Document Assignment to Customers/Projects                                                      |
| **Priority**      | Medium                                                                                         |
| **Complexity**    | Low                                                                                            |
| **Tags**          | `document`, `customer`, `project`, `linking`, `organization`                                   |

### Description

The system shall ensure that all quotations, orders, order confirmations, and invoices are linked to their respective customer records and optionally to projects. Users can view all documents associated with a customer or project from a single document timeline.

### Actors

- Sales Staff
- Back-Office Admin
- Project Manager

### Preconditions

1. Customer record exists in CRM.
2. Project record exists (optional).

### Flow

1. During document creation (quotation, order, invoice), the system requires customer selection.
2. User optionally assigns the document to a project.
3. System creates the bidirectional link between document and customer/project.
4. On the customer detail screen, a "Documents" tab shows all linked documents.
5. On the project detail screen, a "Documents" tab shows all linked documents.
6. Documents can be reassigned to a different project (but not to a different customer without admin override).

### Postconditions

1. Document is linked to customer and optionally to project.
2. Document appears in customer and project document timelines.

### Acceptance Criteria

- [ ] All document types are linked to a customer record (mandatory).
- [ ] Project assignment is optional but encouraged.
- [ ] Customer detail screen shows a document timeline (chronological, filterable by type).
- [ ] Project detail screen shows all associated documents.
- [ ] Documents can be filtered by type (quotation, order, invoice) on both screens.
- [ ] Reassigning a document to a different project is audited.
- [ ] Bulk assignment of documents to a project is supported.

### Dependencies

- MOD-03: CRM & Customer Management
- QOP-001, QOP-004, QOP-007: Document creation flows

---

## QOP-007: Invoice Creation from Quotations

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | QOP-007                                                                                        |
| **Title**         | Invoice Creation from Quotations                                                               |
| **Priority**      | High                                                                                           |
| **Complexity**    | High                                                                                           |
| **Tags**          | `invoice`, `creation`, `quotation`, `billing`, `vat`                                           |

### Description

The system shall allow users to create invoices directly from accepted quotations or confirmed orders. The invoice inherits line items, pricing, and customer data from the source document. Users can adjust the invoice before finalization (e.g., actual quantities, additional charges). The system calculates VAT, applies discounts, and generates the invoice document.

### Actors

- Back-Office Admin (primary)
- Sales Staff
- Project Manager

### Preconditions

1. Source quotation is "Accepted" or "Converted," or source order is "Confirmed" or "Completed."
2. User has invoice creation permissions.

### Flow

1. User selects "Create Invoice" from a quotation or order.
2. System pre-populates the invoice with source document data.
3. User adjusts line items if needed:
   - Change quantities to reflect actual work performed.
   - Add additional line items for unforeseen work.
   - Apply additional discounts.
4. System calculates:
   - Line totals
   - Subtotal
   - VAT breakdown by rate (8.1%, 2.6%, 0%)
   - Grand total
   - 5-Rappen rounding (if configured for CHF)
5. User selects payment terms (e.g., 30 days net).
6. System assigns invoice number (QOP-012).
7. User finalizes the invoice.
8. Invoice PDF is generated via Module 09.
9. Invoice can be dispatched via email.

### Postconditions

1. Invoice record is created and linked to the source quotation/order and customer.
2. Invoice status is "Draft" until finalized, then "Sent" upon dispatch.
3. Invoice data is available for export to accounting (MOD-11).

### Acceptance Criteria

- [ ] Invoice can be created from quotation or order with one click.
- [ ] All source data is carried over (editable before finalization).
- [ ] VAT calculation handles multiple rates per invoice.
- [ ] 5-Rappen rounding is applied correctly for CHF totals.
- [ ] Payment terms are configurable and displayed on the invoice.
- [ ] Invoice references the source quotation/order number.
- [ ] Finalized invoices cannot be edited (only cancelled and re-created as credit notes).
- [ ] Invoice PDF matches the invoice template (DOC-003).

### Dependencies

- QOP-001: Quotation Creation
- QOP-004: Quotation-to-Order Conversion
- QOP-012: Automatic Document Numbering
- MOD-09: Document Templates (DOC-003, DOC-006, DOC-007)
- MOD-11: Accounting & Finance (invoice export)

---

## QOP-008: Pro Forma / Advance Invoices (Akontorechnungen)

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | QOP-008                                                                                        |
| **Title**         | Pro Forma / Advance Invoices (Akontorechnungen)                                                |
| **Priority**      | High                                                                                           |
| **Complexity**    | High                                                                                           |
| **Tags**          | `invoice`, `advance`, `akonto`, `staged-billing`, `project`                                    |

### Description

The system shall support creation of advance payment invoices (Akontorechnungen) for projects requiring staged billing. Users can define billing milestones as percentages or fixed amounts of the total project value. Each advance invoice is tracked separately and linked to the project and quotation/order.

### Actors

- Back-Office Admin
- Project Manager
- Sales Staff

### Preconditions

1. A confirmed order or accepted quotation with a total value exists.
2. User has invoice creation permissions.

### Flow

1. User opens the order/quotation and selects "Create Advance Invoice."
2. User specifies the advance amount:
   - As a percentage of total (e.g., 30%)
   - As a fixed amount (e.g., CHF 15,000.00)
3. User optionally specifies a milestone description (e.g., "Anzahlung Auftragsbeginn", "2. Akonto nach Rohinstallation").
4. System calculates VAT on the advance amount.
5. System assigns an invoice number with advance invoice designation.
6. User finalizes the advance invoice.
7. System tracks the advance invoice against the project's billing plan:
   - Total project value
   - Total advance invoiced
   - Remaining to invoice
8. Steps 1-7 repeat for subsequent milestones.

### Postconditions

1. Advance invoice record is created, linked to the project/order.
2. Project billing summary reflects the advance payment.
3. Advance invoice is flagged for deduction on the final invoice (QOP-009).

### Acceptance Criteria

- [ ] Multiple advance invoices can be created per project/order.
- [ ] Total advance invoiced cannot exceed 100% of the project value (with configurable override).
- [ ] Advance invoice clearly identifies itself as "Akontorechnung" on the document.
- [ ] Billing plan overview shows all advance invoices and remaining balance.
- [ ] Each advance invoice is independently trackable for payment status (QOP-010).
- [ ] VAT is calculated on each advance invoice individually.
- [ ] Advance invoices use the same numbering scheme as regular invoices (QOP-012).

### Dependencies

- QOP-007: Invoice Creation
- QOP-009: Automatic Advance Payment Deduction
- QOP-012: Automatic Document Numbering

---

## QOP-009: Automatic Advance Payment Deduction

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | QOP-009                                                                                        |
| **Title**         | Automatic Advance Payment Deduction                                                            |
| **Priority**      | High                                                                                           |
| **Complexity**    | High                                                                                           |
| **Tags**          | `invoice`, `advance`, `deduction`, `final-invoice`, `calculation`                              |

### Description

When creating a final invoice for a project that has outstanding advance invoices, the system shall automatically deduct all previously invoiced advance payments. The final invoice shows the full project value, lists all advance invoices as deduction lines, and calculates the remaining balance due. VAT is handled correctly to avoid double-taxation.

### Actors

- Back-Office Admin
- Project Manager
- System (automated calculation)

### Preconditions

1. One or more advance invoices exist for the project/order (QOP-008).
2. User initiates final invoice creation.

### Flow

1. User selects "Create Final Invoice" for the project/order.
2. System pre-populates the invoice with full project line items and totals.
3. System queries all advance invoices linked to this project/order.
4. For each advance invoice:
   a. A deduction line is added showing the advance invoice number, date, and amount.
   b. VAT deduction is calculated to match the original advance VAT.
5. System calculates:
   - Gross total (full project value)
   - Sum of advance deductions
   - Net total (amount remaining due)
   - VAT summary (net of advances)
6. User reviews the final invoice with all deductions.
7. User finalizes and generates the final invoice PDF.

### Postconditions

1. Final invoice is created showing the full project value minus advance deductions.
2. VAT is correctly calculated on the net amount.
3. All advance invoices are marked as "Deducted" in the billing plan.
4. The project billing plan shows 100% invoiced.

### Acceptance Criteria

- [ ] All advance invoices are automatically listed as deduction lines on the final invoice.
- [ ] Deduction lines show the advance invoice number, date, and amount (net and VAT).
- [ ] Net balance is correctly calculated (total - sum of advances).
- [ ] VAT is calculated on the net balance, avoiding double-taxation.
- [ ] Final invoice document clearly separates project total, advance deductions, and balance due.
- [ ] System prevents final invoice if outstanding advance amounts exceed the project total.
- [ ] Advance deduction logic handles mixed VAT rates correctly.
- [ ] Deduction amounts match the original advance invoices exactly (no rounding discrepancies).

### Dependencies

- QOP-008: Pro Forma / Advance Invoices
- QOP-007: Invoice Creation
- MOD-09: Document Templates (invoice template with deduction section)

---

## QOP-010: Invoice Status Tracking

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | QOP-010                                                                                        |
| **Title**         | Invoice Status Tracking                                                                        |
| **Priority**      | High                                                                                           |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `invoice`, `status`, `tracking`, `payment`, `overdue`                                          |

### Description

The system shall track invoices through their payment lifecycle. Statuses include Draft, Sent, Partially Paid, Paid, Overdue, and Cancelled. Overdue detection runs automatically based on payment terms. Payment information can be entered manually or imported from bank statements (if integrated).

### Actors

- Back-Office Admin
- System (automated overdue detection)

### Preconditions

1. Invoice record exists.

### Flow

1. Invoice is created in "Draft" status.
2. Upon finalization and dispatch --> "Sent" with due date calculated from payment terms.
3. System runs daily check for overdue invoices:
   - Due date passed and status is still "Sent" --> "Overdue."
4. User records a payment:
   - Full amount received --> "Paid."
   - Partial amount received --> "Partially Paid" (remaining balance tracked).
5. If needed, user cancels an invoice --> "Cancelled" (with reason).

**Status Flow:**
```
Draft --> Sent --> Partially Paid --> Paid
                --> Overdue --> Partially Paid --> Paid
      --> Cancelled
```

### Postconditions

1. Invoice status reflects current payment state.
2. Overdue invoices are flagged for follow-up.
3. Payment history is recorded on the invoice.

### Acceptance Criteria

- [ ] All statuses are implemented: Draft, Sent, Partially Paid, Paid, Overdue, Cancelled.
- [ ] Overdue detection runs daily at a configurable time.
- [ ] Partial payments track remaining balance.
- [ ] Multiple partial payments can be recorded per invoice.
- [ ] Payment recording captures: date, amount, reference, method.
- [ ] Cancelled invoices cannot receive payments.
- [ ] Overdue invoice list is accessible from the dashboard.
- [ ] Aging report shows invoice amounts by overdue period (30/60/90+ days).

### Dependencies

- QOP-007: Invoice Creation
- MOD-11: Accounting & Finance (payment reconciliation)

---

## QOP-011: Search & Filter Functions

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | QOP-011                                                                                        |
| **Title**         | Search & Filter Functions                                                                      |
| **Priority**      | Medium                                                                                         |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `search`, `filter`, `ux`, `performance`                                                        |

### Description

The system shall provide comprehensive search and filtering capabilities across all document types (quotations, orders, invoices). Users can search by full text, document number, customer name, date range, status, department, and amount range.

### Actors

- All users with document access

### Preconditions

1. Documents exist in the system.

### Flow

1. User enters a search query in the global search bar or uses the advanced filter panel.
2. System performs full-text search across document content and metadata.
3. Results are displayed in a sortable, paginated table.
4. User can refine results using filter controls:
   - Document type (quotation, order, invoice)
   - Status
   - Date range (created, sent, due date)
   - Customer
   - Department
   - Amount range
   - Assigned sales person
5. Filters can be saved as named presets for quick access.

### Postconditions

1. Matching documents are displayed.
2. Applied filters are visible and can be cleared individually or all at once.

### Acceptance Criteria

- [ ] Full-text search returns results within 2 seconds for datasets up to 100,000 documents.
- [ ] Search covers: document number, customer name, line item descriptions, notes.
- [ ] All listed filter criteria are functional.
- [ ] Filters can be combined (AND logic).
- [ ] Filter presets can be saved, loaded, and deleted per user.
- [ ] Sort by any column in the results table (number, date, amount, status, customer).
- [ ] Pagination with configurable page size (25, 50, 100).
- [ ] Export search results to CSV/Excel.

### Dependencies

- QOP-001, QOP-004, QOP-007: Document records

---

## QOP-012: Automatic Document Numbering

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | QOP-012                                                                                        |
| **Title**         | Automatic Document Numbering                                                                   |
| **Priority**      | High                                                                                           |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `numbering`, `sequence`, `configuration`, `compliance`                                         |

### Description

The system shall automatically assign unique, sequential document numbers to quotations, orders, and invoices. The numbering format is configurable per document type and department, supporting prefixes, year codes, and sequential counters. Numbers are guaranteed unique and gap-free within their sequence.

### Actors

- System (automated)
- System Administrator (configuration)

### Preconditions

1. Numbering scheme is configured for each document type.

### Flow

1. User creates/finalizes a document.
2. System determines the applicable numbering scheme based on document type and department.
3. System acquires the next number in the sequence (with database-level locking to prevent duplicates).
4. Number is assigned to the document and cannot be changed.

### Postconditions

1. Document has a unique, sequential number.
2. Sequence counter is incremented.

### Acceptance Criteria

- [ ] Numbering format is configurable: prefix + year + separator + sequence (e.g., "OFF-2026-0001", "RE-2026-0001").
- [ ] Separate sequences per document type (quotations, orders, invoices).
- [ ] Optional separate sequences per department.
- [ ] Annual reset option: sequence restarts at 1 each year (configurable).
- [ ] No duplicate numbers are possible under concurrent usage.
- [ ] No gaps in numbering sequence (sequential, no skipping).
- [ ] Format preview is shown during configuration.
- [ ] Existing numbering schemes can be migrated from legacy systems (starting counter configurable).

### Dependencies

- Database sequence mechanism

---

## QOP-013: Department-Based Filtering

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | QOP-013                                                                                        |
| **Title**         | Department-Based Filtering                                                                     |
| **Priority**      | Medium                                                                                         |
| **Complexity**    | Low                                                                                            |
| **Tags**          | `department`, `filter`, `organization`, `access`                                               |

### Description

The system shall allow users to filter all document views (quotations, orders, invoices) by organizational department (e.g., Heizung, Sanitaer, Service, Lüftung). Department assignment is set during document creation and used for reporting, filtering, and optionally for access control.

### Actors

- All users
- System Administrator (department configuration)

### Preconditions

1. Departments are configured in the system.
2. Documents are assigned to departments.

### Flow

1. User selects a department filter from the filter bar (dropdown or tabs).
2. Document list is filtered to show only documents of the selected department.
3. User can select "All Departments" to see the full list.
4. Department filter persists across sessions (user preference).

### Postconditions

1. Document list shows only documents matching the selected department.

### Acceptance Criteria

- [ ] Department filter is available on all document list views.
- [ ] At least 5 departments can be configured.
- [ ] Users can be assigned a default department (pre-selected on login).
- [ ] Multi-department selection is supported (e.g., "Heizung" + "Service").
- [ ] Department filter works in combination with other filters (QOP-011).
- [ ] Department is a required field during document creation.
- [ ] Reports can be aggregated by department.

### Dependencies

- QOP-011: Search & Filter Functions
- Organizational structure configuration

---

## QOP-014: Multilingual Document Versions

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | QOP-014                                                                                        |
| **Title**         | Multilingual Document Versions                                                                 |
| **Priority**      | Medium                                                                                         |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `multilingual`, `i18n`, `document`, `template`, `localization`                                 |

### Description

The system shall generate business documents (quotations, order confirmations, invoices) in the customer's preferred language. Supported languages are German, French, Italian, and English. Translated document templates, standard text blocks, and labels are maintained in the system.

### Actors

- Back-Office Admin
- Sales Staff
- System Administrator (translation management)

### Preconditions

1. Customer language preference is set in CRM.
2. Document templates exist in the target language (Module 09).
3. Standard text blocks are translated.

### Flow

1. User creates a document for a customer.
2. System determines the customer's language preference from CRM.
3. Document template and standard text blocks are loaded in the target language.
4. User-entered free text remains as entered (not auto-translated).
5. Document is generated in the customer's language.
6. User can override the language for a specific document.

### Postconditions

1. Document is generated in the customer's preferred language.
2. Language version is recorded on the document record.

### Acceptance Criteria

- [ ] Documents can be generated in DE, FR, IT, EN.
- [ ] Customer language preference is auto-applied from CRM.
- [ ] Language override is available per document.
- [ ] Template labels, headers, footers are translated (e.g., "Offerte" / "Devis" / "Offerta" / "Quotation").
- [ ] Standard text blocks (terms, payment conditions) are available in all languages.
- [ ] Line item descriptions are not auto-translated (user responsibility).
- [ ] Same document can be regenerated in a different language without recreating it.

### Dependencies

- MOD-03: CRM & Customer Management (language preference)
- MOD-09: Document Templates (multilingual templates)

---

## QOP-015: WhatsApp/Email Appointment Reminders

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | QOP-015                                                                                        |
| **Title**         | WhatsApp/Email Appointment Reminders                                                           |
| **Priority**      | Medium                                                                                         |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `whatsapp`, `email`, `reminder`, `appointment`, `notification`, `customer-facing`              |

### Description

The system shall send appointment reminders to customers via WhatsApp and/or email before scheduled service visits. Reminders include the appointment date, time window, technician name, and a brief description. Customers can confirm or request rescheduling through a response.

### Actors

- System (automated dispatch)
- Back-Office Admin (configuration)
- Customer (recipient)

### Preconditions

1. Service appointment is scheduled (MOD-05: Field Deployment Planning).
2. Customer has a valid phone number (for WhatsApp) or email address.
3. WhatsApp Business API is configured (for WhatsApp channel).
4. Reminder templates are defined.

### Flow

1. System runs a scheduled job to identify appointments in the upcoming period.
2. For each qualifying appointment:
   a. Determine reminder timing (e.g., 48 hours before, day-of morning).
   b. Determine channel: WhatsApp (if phone number available), email (if email available), or both.
3. System composes the reminder message from the template:
   - Customer name, appointment date, time window, technician, brief description.
4. Message is sent via the appropriate channel.
5. If WhatsApp: customer can reply "OK" to confirm or "Verschieben" to request rescheduling.
6. Confirmation/rescheduling request is logged and displayed to the dispatcher.

### Postconditions

1. Customer receives the appointment reminder.
2. Delivery status is tracked (sent, delivered, read, failed).
3. Customer responses are captured and routed to the dispatcher.

### Acceptance Criteria

- [ ] Reminders are sent at configurable intervals (e.g., 48h before, day-of).
- [ ] Both WhatsApp and email channels are supported.
- [ ] Channel selection is automatic based on available contact data (WhatsApp preferred if phone available).
- [ ] Reminder message includes: date, time window, technician name, service description.
- [ ] Customer confirmation via WhatsApp reply is captured.
- [ ] Failed delivery is retried once and logged.
- [ ] Reminder templates are editable by admin.
- [ ] Reminder language matches customer preference (QOP-014).
- [ ] Opt-out mechanism is available for customers who do not wish to receive reminders.
- [ ] WhatsApp messages comply with WhatsApp Business API message template policies.

### Dependencies

- MOD-05: Field Deployment Planning
- MOD-03: CRM & Customer Management
- QOP-014: Multilingual Document Versions
- External: WhatsApp Business API
- External: Email service (SMTP/API)
