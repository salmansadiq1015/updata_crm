# Module 09: Document Templates & Layout System

## Module Metadata

| Field              | Value                                        |
|--------------------|----------------------------------------------|
| Module ID          | MOD-09                                       |
| Module Name        | Document Templates & Layout System           |
| SOW Reference      | Section 8                                    |
| Status             | Draft                                        |
| Owner              | TBD                                          |
| Last Updated       | 2026-03-29                                   |
| Platform           | Web App (template management), Server-side (rendering) |

---

## 1. Purpose

The Document Templates & Layout System module provides a centralized template engine for creating standardized business documents. It defines the visual layout, typography, color scheme, and data-binding rules that ensure every document produced by the MB Boiler & Heizung AG platform conforms to the company's corporate identity (CI) and Swiss commercial standards.

This module acts as the rendering layer -- it receives structured data from other modules (quotations, orders, invoices) and produces formatted, print-ready PDF documents that can be exported or dispatched via email directly from the system.

---

## 2. Scope

### 2.1 In Scope

- **Quotation Templates** -- Standardized layout for customer quotations including header, line items, totals, terms, and footer.
- **Order Confirmation Templates** -- Layout for order confirmations generated upon quotation acceptance.
- **Invoice Templates** -- Layout for standard invoices, advance invoices (Akontorechnungen), and final invoices with advance deduction lines.
- **Cover Letter & Additional Templates** -- Templates for cover letters, service reports, inspection certificates, and other correspondence.
- **Custom Layout Definition** -- Ability to define and adjust layout parameters (margins, column widths, section ordering) per template type.
- **Automatic Document Generation from System Data** -- Templates are populated automatically with data from the ERP (customer info, line items, prices, dates, reference numbers).
- **PDF Export** -- All documents are rendered as high-quality PDF files suitable for print and digital distribution.
- **Email Dispatch from System** -- Documents can be sent as email attachments directly from the platform, with configurable sender addresses and email body templates.
- **CI Compliance** -- All documents adhere to MB Boiler & Heizung AG corporate identity guidelines.
- **Template Versioning** -- Track template changes over time; ability to revert to previous versions.

### 2.2 Design Specifications

| Element        | Specification                                                    |
|----------------|------------------------------------------------------------------|
| Body Font      | Museo Sans 300, 10pt default                                    |
| Bold Font      | Museo Sans 500 (semi-bold), Museo Sans 700 (bold)               |
| Font Size      | 10pt body, 12pt headings, 8pt footer/fine print                  |
| Primary Blue   | CMYK: C100 / M85 / Y2 / K0                                      |
| Primary Red    | CMYK: C10 / M100 / Y95 / K2                                     |
| Logo File      | mb_boiler_heizung_ag_cmyk.eps                                    |
| Paper Size     | A4 (210 x 297 mm)                                               |
| Margins        | Top: 25mm, Bottom: 20mm, Left: 20mm, Right: 15mm (configurable) |

### 2.3 Out of Scope

- **Document workflow and status management** -- The lifecycle of quotations, orders, and invoices (Draft, Sent, Paid, etc.) is managed by Module 08. This module only renders documents.
- **Template content authoring** -- Business text, terms and conditions, and legal clauses are provided by the client or Module 08. This module provides the layout container.
- **Email marketing or bulk mailing** -- This module handles transactional document dispatch, not marketing campaigns.
- **Digital signature** -- Electronic/qualified digital signatures are not part of this module (may be a future enhancement).

### 2.4 Clarification -- Correction Rounds (Contract §7.2)

Graphical formatting of documents follows the agreed templates. Unlimited correction loops are **not** owed: the work price includes at most **[X]** correction rounds per template type (the value of **[X]** is fixed in the work contract, §7.2). Template designs must be approved per template type before downstream document-generation work depends on them; further changes beyond the agreed rounds are handled as change requests.

---

## 3. Key Actors

| Actor                | Role                                                                   |
|----------------------|------------------------------------------------------------------------|
| Back-Office Admin    | Manages templates, triggers document generation, dispatches emails     |
| System Administrator | Configures template engine, manages fonts, uploads CI assets           |
| Sales Staff          | Generates quotations and order confirmations from templates            |
| Field Technician     | Views generated documents (PDF) on mobile; may trigger report generation|
| Designer (Setup)     | Creates initial template designs during implementation phase           |

---

## 4. Requirements Summary

| Req ID   | Title                                         | Priority | Complexity |
|----------|-----------------------------------------------|----------|------------|
| DOC-001  | Quotation Template Creation                   | High     | Medium     |
| DOC-002  | Order Confirmation Template                   | High     | Medium     |
| DOC-003  | Invoice Template                              | High     | High       |
| DOC-004  | Cover Letter & Additional Templates           | Medium   | Medium     |
| DOC-005  | Custom Layout Definition                      | Medium   | Medium     |
| DOC-006  | Automatic Document Generation from System Data| High     | High       |
| DOC-007  | PDF Export                                    | High     | Medium     |
| DOC-008  | Email Dispatch from System                    | High     | Medium     |
| DOC-009  | CI Compliance (Fonts, Colors, Logo)           | High     | Low        |
| DOC-010  | Template Versioning                           | Low      | Medium     |

---

## 5. Dependencies

| Dependency                            | Direction | Description                                                           |
|---------------------------------------|-----------|-----------------------------------------------------------------------|
| MOD-08: Quotations & Order Processing | Inbound   | Receives structured document data (line items, totals, customer info)  |
| MOD-03: CRM & Customer Management     | Inbound   | Customer address and contact data for document headers                 |
| MOD-07: AI Assistant                   | Inbound   | Voice-dictated content merged into templates                          |
| MOD-06: Mobile Technician App         | Outbound  | Generated PDFs made available for viewing on mobile devices            |
| Email Service (Infrastructure)         | Outbound  | SMTP/API integration for email dispatch                               |

---

## 6. Key Assumptions

1. Museo Sans font family is licensed for server-side PDF rendering (web font license + server embedding license).
2. The logo file (mb_boiler_heizung_ag_cmyk.eps) will be provided by the client in the required format. An RGB/PNG variant will also be provided for screen rendering.
3. Template design follows an iterative process with a defined maximum number of correction rounds per template type (to be contractually agreed).
4. PDF rendering uses a server-side engine (e.g., Puppeteer, wkhtmltopdf, or a dedicated PDF library) -- not client-side browser printing.
5. Email dispatch uses the company's existing email infrastructure or a transactional email service (e.g., SendGrid, AWS SES).

---

## 7. Risks

| Risk                                                      | Impact | Likelihood | Mitigation                                                      |
|-----------------------------------------------------------|--------|------------|-----------------------------------------------------------------|
| Font licensing issues for server-side rendering            | High   | Medium     | Verify license terms early; acquire server embedding license    |
| Template correction rounds exceed agreed scope             | Medium | High       | Define clear acceptance criteria; limit rounds contractually    |
| PDF rendering inconsistencies across platforms             | Medium | Medium     | Standardize on a single rendering engine; automated visual tests|
| Large document generation causes performance issues        | Medium | Low        | Async generation with background jobs; pagination for previews  |
| Email deliverability issues (spam filters)                 | Medium | Medium     | SPF/DKIM/DMARC configuration; dedicated sending domain          |
