# Module 11: Accounting

## Source
Statement of Work -- Section 10

## Purpose
Integrated accounting with accounts receivable (AR) and accounts payable (AP) capabilities, providing MB Boiler & Heizung AG with core financial transaction management within the ERP platform.

## Scope

### Accounts Receivable (AR)
- Invoice creation and management.
- Open receivables tracking.
- Incoming payment recording and allocation to invoices.

### Accounts Payable (AP)
- Supplier invoice recording.
- Open payables tracking.
- Invoice upload and scanning from physical documents.
- OCR recognition of invoice data (supplier, amount, date, line items).
- Supplier and accounting structure allocation.
- Document archive for scanned/uploaded invoices.

### Banking & Reconciliation
- Bank connection via defined interface (e.g., ISO 20022 camt/pain messages as standard in Swiss banking).
- Automatic and semi-automatic payment reconciliation.
- Cash management and liquidity overview.

### Document & Mobile
- Mobile document scanning (camera capture on field devices).
- Document allocation to employees (assign scanned documents to responsible persons).

### Reporting & Journals
- Accounting journal (chronological record of all postings).
- Account overviews (balance and transaction views per account).
- Open-item management (aged receivables/payables lists).

## Important Contractual Note
> "Not a full replication of Infoniqa Sage 50 unless individual functions are expressly agreed."

This module provides operationally essential AR/AP and reconciliation functions. It does **not** aim to replace a full-featured accounting suite such as Sage 50.

## Out of Scope / Boundaries
- **Full ERP accounting suite** -- general ledger depth, cost center accounting, and multi-entity consolidation are not in scope unless expressly agreed.
- **Tax filing** -- no direct submission to Swiss Federal Tax Administration or cantonal authorities.
- **Annual financial statement preparation** -- balance sheet, income statement, and audit-ready closing are excluded.
- **Tax/audit/legal responsibility** -- the platform supports data capture but does not assume responsibility for correctness of financial statements.
- **Payroll** -- salary processing is not part of this module.

## Requirements Summary

| ID | Title | Priority |
|----|-------|----------|
| ACC-001 | Accounts Receivable - Invoice Management | High |
| ACC-002 | Open Receivables Management | High |
| ACC-003 | Incoming Payment Recording & Allocation | High |
| ACC-004 | Accounts Payable - Supplier Invoice Recording | High |
| ACC-005 | Open Payables Management | High |
| ACC-006 | Supplier Invoice Upload/Scan | High |
| ACC-007 | OCR-Supported Invoice Data Recognition | High |
| ACC-008 | Supplier & Accounting Structure Allocation | Medium |
| ACC-009 | Document Archive Storage | Medium |
| ACC-010 | Bank Connection Interface | High |
| ACC-011 | Automatic/Semi-Automatic Payment Reconciliation | High |
| ACC-012 | Cash Management | Medium |
| ACC-013 | Mobile Document Scanning | Medium |
| ACC-014 | Document Allocation to Employees | Medium |
| ACC-015 | Accounting Journal | High |
| ACC-016 | Account Overviews | Medium |
| ACC-017 | Open-Item Management | High |

## Key Stakeholders
- **Finance / bookkeeping staff** -- primary users for AR/AP, reconciliation, journal management.
- **Office management** -- invoice creation, payment tracking.
- **Field technicians** -- mobile document scanning, receipt capture.
- **Project managers** -- review project-related costs and supplier invoices.
- **Management** -- cash management dashboards, open-item oversight.

## Integration Points
- **Module 03 (Quotation Management)** -- accepted quotations may trigger invoice creation.
- **Module 04 (Order/Project Management)** -- order completion triggers final invoicing; supplier invoices linked to orders.
- **Module 07 (Field-Service Reports)** -- completed reports can generate customer invoices.
- **Module 10 (Material Catalogs)** -- catalog prices feed invoice line items.
- **External bank systems** -- ISO 20022 camt.053/054 for statements, pain.001/002 for payments.
- **OCR service** -- internal or third-party OCR engine for invoice data extraction.

## Assumptions
1. All monetary amounts are in CHF unless a currency field is explicitly provided.
2. Swiss VAT rates (currently 8.1% standard, 2.6% reduced, 0% exempt) are configurable.
3. Bank connection uses ISO 20022 message formats as mandated by Swiss financial institutions.
4. OCR accuracy is best-effort; all OCR-extracted data requires human review/confirmation before posting.
5. Document archive stores files in a durable object store with configurable retention policies.
