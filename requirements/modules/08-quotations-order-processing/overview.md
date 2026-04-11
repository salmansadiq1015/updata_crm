# Module 08: Quotations & Order Processing

## Module Metadata

| Field              | Value                                        |
|--------------------|----------------------------------------------|
| Module ID          | MOD-08                                       |
| Module Name        | Quotations & Order Processing                |
| SOW Reference      | Section 7                                    |
| Status             | Draft                                        |
| Owner              | TBD                                          |
| Last Updated       | 2026-03-29                                   |
| Platform           | Web App, Mobile App                          |

---

## 1. Purpose

The Quotations & Order Processing module provides end-to-end management of the commercial document lifecycle -- from initial quotation through order confirmation to invoicing. It enables back-office staff, sales personnel, and dispatchers to create, track, convert, and invoice quotations and orders within a unified workflow.

This module is the commercial backbone of the MB Boiler & Heizung AG ERP system, ensuring that every customer interaction from initial offer to final invoice is tracked, documented, and linked to the correct customer, project, and department.

---

## 2. Scope

### 2.1 In Scope

- **Quotation Creation & Management** -- Create quotations with line items, pricing, terms, and validity periods. Edit, duplicate, and archive quotations.
- **Quotation Status Tracking** -- Track quotations through lifecycle stages: Draft, Sent, Viewed, Accepted, Declined, Expired.
- **Open Quotation Follow-Up Reminders** -- Automated reminders for sales staff to follow up on quotations nearing expiration or without response.
- **Quotation-to-Order Conversion** -- One-click conversion of accepted quotations to confirmed orders, carrying over all line items and terms.
- **Order Confirmation Generation** -- Automatic generation of order confirmation documents upon conversion.
- **Document Assignment to Customers/Projects** -- All documents (quotations, orders, invoices) are linked to customer records and optionally to projects.
- **Invoice Creation from Quotations** -- Generate invoices directly from accepted quotations or confirmed orders.
- **Pro Forma / Advance Invoices (Akontorechnungen)** -- Create advance payment invoices for projects requiring staged billing.
- **Automatic Advance Payment Deduction** -- Final invoices automatically deduct previously invoiced advance payments.
- **Invoice Status Tracking** -- Track invoices through: Draft, Sent, Partially Paid, Paid, Overdue, Cancelled.
- **Search & Filter Functions** -- Full-text search and multi-criteria filtering across all document types.
- **Automatic Document Numbering** -- Sequential, configurable numbering schemes per document type and department.
- **Department-Based Filtering** -- Filter and view documents by organizational department (e.g., Heating, Sanitary, Service).
- **Multilingual Document Versions** -- Generate the same document in multiple languages (DE, FR, IT, EN) based on customer language preference.
- **WhatsApp/Email Appointment Reminders** -- Send appointment reminders to customers via WhatsApp or email for scheduled service visits.

### 2.2 Out of Scope

- **Accounting ledger entries** -- Double-entry bookkeeping, account reconciliation, and financial reporting belong to Module 11 (Accounting & Finance). This module creates invoices but does not post journal entries.
- **Document template design** -- Visual layout, fonts, and CI elements are managed in Module 09 (Document Templates & Layout System). This module provides data; Module 09 provides formatting.
- **Payment processing** -- Actual payment collection (bank transfers, credit cards) is not handled here.
- **Inventory management** -- Stock checks and material reservations are handled by Module 10 (if applicable).

---

## 3. Key Actors

| Actor               | Role                                                                      |
|----------------------|---------------------------------------------------------------------------|
| Sales Staff          | Creates and manages quotations, follows up with customers                 |
| Back-Office Admin    | Creates orders, invoices; manages document numbering and workflows        |
| Dispatcher           | Converts accepted quotations to orders, triggers order confirmations      |
| Field Technician     | Views assigned orders on mobile; may trigger invoice creation post-service|
| Project Manager      | Manages project-level quotations and staged invoicing                     |
| Customer (external)  | Receives quotations, order confirmations, invoices, reminders             |
| System Administrator | Configures numbering schemes, department filters, reminder schedules      |

---

## 4. Requirements Summary

| Req ID   | Title                                      | Priority | Complexity |
|----------|--------------------------------------------|----------|------------|
| QOP-001  | Quotation Creation & Management            | High     | High       |
| QOP-002  | Quotation Status Management                | High     | Medium     |
| QOP-003  | Open Quotation Follow-Up Reminders         | Medium   | Medium     |
| QOP-004  | Quotation-to-Order Conversion              | High     | Medium     |
| QOP-005  | Order Confirmation Generation              | High     | Medium     |
| QOP-006  | Document Assignment to Customers/Projects  | Medium   | Low        |
| QOP-007  | Invoice Creation from Quotations           | High     | High       |
| QOP-008  | Pro Forma / Advance Invoices               | High     | High       |
| QOP-009  | Automatic Advance Payment Deduction        | High     | High       |
| QOP-010  | Invoice Status Tracking                    | High     | Medium     |
| QOP-011  | Search & Filter Functions                  | Medium   | Medium     |
| QOP-012  | Automatic Document Numbering               | High     | Medium     |
| QOP-013  | Department-Based Filtering                 | Medium   | Low        |
| QOP-014  | Multilingual Document Versions             | Medium   | Medium     |
| QOP-015  | WhatsApp/Email Appointment Reminders       | Medium   | Medium     |

---

## 5. Dependencies

| Dependency                            | Direction | Description                                                         |
|---------------------------------------|-----------|---------------------------------------------------------------------|
| MOD-03: CRM & Customer Management     | Inbound   | Customer and contact data sourced from CRM                          |
| MOD-04: Scheduling & Dispatch         | Both      | Orders feed into scheduling; schedule data used for reminders       |
| MOD-07: AI Assistant                   | Inbound   | Voice-created orders and quotations submitted to this module        |
| MOD-09: Document Templates            | Outbound  | Quotation/order/invoice data sent to template engine for rendering  |
| MOD-11: Accounting & Finance          | Outbound  | Invoice data exported to accounting module for ledger posting       |
| MOD-05: Mobile Field Service          | Both      | Orders visible on mobile; technicians can trigger invoicing         |

---

## 6. Key Assumptions

1. All pricing and tax calculations follow Swiss VAT rules (currently 8.1% standard, 2.6% reduced).
2. Document numbering resets annually or follows a continuous sequence, configurable per deployment.
3. WhatsApp integration requires an approved WhatsApp Business API account.
4. Multilingual document generation relies on translated template content managed in Module 09.
5. Graphical formatting of all documents follows agreed-upon templates. Maximum [X] correction rounds per template type (to be defined during design phase).
6. Currency is Swiss Franc (CHF) as default; EUR support may be added if cross-border operations are confirmed.

---

## 7. Risks

| Risk                                                        | Impact | Likelihood | Mitigation                                                    |
|-------------------------------------------------------------|--------|------------|---------------------------------------------------------------|
| Complex advance payment deduction logic causes errors        | High   | Medium     | Extensive testing with real billing scenarios; audit trail     |
| WhatsApp Business API policy changes                         | Medium | Medium     | Abstract messaging layer; support email fallback               |
| Document numbering gaps due to concurrent creation            | Medium | Low        | Database-level sequence generation with locking                |
| Multilingual content incomplete for all document types        | Medium | Medium     | Phased rollout by language; German first, then FR/IT/EN        |
| Template correction rounds exceed budget                     | Low    | Medium     | Clear contract terms; approval gate per correction round       |

---

## 8. Notes

- The term "Akontorechnungen" refers to the Swiss practice of advance/progress invoicing common in construction and HVAC projects.
- Quotation validity periods and follow-up intervals should be configurable per department.
- All generated documents must comply with Swiss OR (Obligationenrecht) requirements for commercial correspondence.
