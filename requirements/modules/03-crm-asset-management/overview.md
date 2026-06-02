# Module 03 -- CRM & Asset Management

## 1. Purpose

This module is the central hub for managing customers, contacts, sites (objects), and technical installations for MB Boiler & Heizung AG. It provides the foundational business data that feeds into scheduling, field service, quotations, and invoicing. Every technician, project manager, and dispatcher interacts with this module daily.

## 2. Source Requirement

Section 2 of the Statement of Work -- "Kunden-, Objekt- und Anlagenverwaltung" (Customer, Object, and Installation Management).

## 3. Scope

| In Scope | Out of Scope |
|----------|--------------|
| Customer master data CRUD | Quotation creation and pricing (Module 08) |
| Multiple contacts per customer | Scheduling and dispatch (Module 05) |
| Address book (accessible on mobile) | Invoice generation (Module 08) |
| Customer capture via mobile app | Project planning and tracking (Module 04) |
| Site/object management | Technician skill management (Module 02/05) |
| Technical installation management per site | |
| Installation info capture and storage | |
| Maintenance interval management | |
| Automatic marking of due maintenance | |
| Full order/service history per site & installation | |
| Image storage and assignment | |
| Special notes per site/installation | |
| Spare parts and ordering information | |
| Newsletter distribution via WhatsApp/email | |
| Website plugin for online service orders | |

## 4. Responsibilities

- Maintaining a complete and accurate customer database with all relevant business information.
- Managing the hierarchy: Customer -> Sites/Objects -> Technical Installations.
- Tracking maintenance intervals and automatically flagging installations due for service.
- Providing a complete order and service history per site and installation.
- Storing and organizing images, documents, and notes related to sites and installations.
- Managing spare parts catalogs and linking parts to specific installations.
- Distributing newsletters and marketing communications via WhatsApp and email.
- Providing an embeddable website plugin that allows end-customers to submit service requests online.

## 5. Key Features

| ID | Feature | Priority |
|----|---------|----------|
| CRM-001 | Customer Master Data Management | H |
| CRM-002 | Contact Management | H |
| CRM-003 | Address Book with Mobile Access | H |
| CRM-004 | Site/Object Management | H |
| CRM-005 | Technical Installation Management | H |
| CRM-006 | Installation Information Capture | H |
| CRM-007 | Maintenance Interval Management | H |
| CRM-008 | Automatic Maintenance Due Marking | H |
| CRM-009 | Order & Service History per Site/Installation | H |
| CRM-010 | Image Storage & Assignment | M |
| CRM-011 | Special Notes per Site/Installation | M |
| CRM-012 | Spare Parts & Ordering Information | M |
| CRM-013 | Newsletter Distribution (WhatsApp/Email) | L |
| CRM-014 | Website Plugin for Customer Orders | H |

## 6. Domain Model Overview

```
Customer (Kunde)
├── Contact 1 (Ansprechpartner)
├── Contact 2
├── ...
├── Site / Object 1 (Objekt)
│   ├── Installation 1 (Anlage)
│   │   ├── Maintenance Intervals
│   │   ├── Service History
│   │   ├── Images
│   │   ├── Notes
│   │   └── Spare Parts
│   ├── Installation 2
│   │   └── ...
│   ├── Images (site-level)
│   └── Notes (site-level)
├── Site / Object 2
│   └── ...
└── Order History (aggregated)
```

## 7. Module Boundaries

```
+---------------------------------------------------------------+
|              CRM & Asset Management (03)                      |
|  +-----------+  +----------+  +-----------+  +-------------+  |
|  | Customers |  | Contacts |  |   Sites   |  |Installations|  |
|  +-----------+  +----------+  +-----------+  +-------------+  |
|  +-----------+  +----------+  +-----------+  +-------------+  |
|  |Maintenance|  |  History  |  |  Images   |  | Spare Parts |  |
|  +-----------+  +----------+  +-----------+  +-------------+  |
|  +-----------+  +-------------+                               |
|  |Newsletter |  |Website Plugin|                              |
|  +-----------+  +-------------+                               |
+---------------------------------------------------------------+
       |              |              |               |
  Auth (02)    Scheduling (05)  Quotations (08)  Invoicing (08)
```

- **Upstream dependencies:** Core Platform (01), Authentication (02).
- **Downstream consumers:** Scheduling (05), Field Service (06), Quotations (08), Invoicing (08), Reporting.

## 8. Key Constraints

- Customer and site data must be accessible offline on mobile devices (local sync required).
- Swiss address format must be supported (PLZ, Ort, Kanton).
- Phone numbers must support Swiss formats (+41 ...).
- All customer-facing communications (newsletters, order confirmations) must be available in German.
- The website plugin must be embeddable via a simple `<script>` tag or iframe.
- Image uploads must support common mobile camera formats (JPEG, PNG, HEIF) with automatic compression.
- Maintenance due dates must be checked daily via a scheduled background job.

## 9. Success Metrics

| Metric | Target |
|--------|--------|
| Customer record completeness (required fields filled) | > 95 % |
| Maintenance due detection accuracy | 100 % (no missed intervals) |
| Mobile address book load time | < 2 seconds |
| Website plugin order submission success rate | > 99 % |
| Image upload success rate (mobile, field conditions) | > 95 % |
| Newsletter delivery rate | > 90 % |
