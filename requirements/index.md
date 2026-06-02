# MB Boiler & Heizung AG — Digital Platform Requirements

**Version:** 1.0
**Based on:** Detaillierte Leistungsvereinbarung, stand 22.03.2026
**Client:** MB Boiler & Heizung AG, Hohestrasse 199, 4104 Oberwil, Switzerland

---

## System Overview

A tailored digital software solution for a Swiss HVAC company comprising:

- **Web Application** — Administration, dispatching, project execution, office organisation
- **Mobile Application** — iOS and Android app for field technicians (a *separate client application* that runs against the *same shared backend/server* as the web app; the mobile server-side surface — BFF, sync, push — is delivered here, the native client UI is a separate project)
- **AI Assistant** — Voice-based data entry and document creation support

The platform digitises end-to-end business operations: CRM, asset management, project management, field deployment, service reports, quotations, order processing, invoicing, accounting, document management, materials management, and task management — with data migration from legacy systems (OF software, Messerli CRM).

---

## Module Index

| # | Module | Directory | Req Count | Priority |
|---|--------|-----------|-----------|----------|
| 01 | [Core Platform](modules/01-core-platform/overview.md) | `01-core-platform/` | 10 | Foundation |
| 02 | [Authentication & Users](modules/02-authentication-users/overview.md) | `02-authentication-users/` | 7 | Foundation |
| 03 | [CRM & Asset Management](modules/03-crm-asset-management/overview.md) | `03-crm-asset-management/` | 14 | Core |
| 04 | [Project Management](modules/04-project-management/overview.md) | `04-project-management/` | 7 | Core |
| 05 | [Field Deployment Planning](modules/05-field-deployment-planning/overview.md) | `05-field-deployment-planning/` | 8 | Core |
| 06 | [Mobile Technician App](modules/06-mobile-technician-app/overview.md) | `06-mobile-technician-app/` | 15 | Core |
| 07 | [AI Assistant](modules/07-ai-assistant/overview.md) | `07-ai-assistant/` | 9 | Advanced |
| 08 | [Quotations & Order Processing](modules/08-quotations-order-processing/overview.md) | `08-quotations-order-processing/` | 15 | Core |
| 09 | [Document Templates & Layout](modules/09-document-templates/overview.md) | `09-document-templates/` | 10 | Core |
| 10 | [Material Catalogs & Interfaces](modules/10-material-catalogs/overview.md) | `10-material-catalogs/` | 8 | Core |
| 11 | [Accounting](modules/11-accounting/overview.md) | `11-accounting/` | 17 | Core |
| 12 | [Task Management](modules/12-task-management/overview.md) | `12-task-management/` | 13 | Supporting |
| 13 | [Notifications](modules/13-notifications/overview.md) | `13-notifications/` | 9 | Supporting |
| 14 | [Integrations](modules/14-integrations/overview.md) | `14-integrations/` | 9 | Supporting |
| 15 | [Data Migration](modules/15-data-migration/overview.md) | `15-data-migration/` | 10 | One-time |
| 16 | [Compliance, Data Protection & Handover](modules/16-compliance-data-protection/overview.md) | `16-compliance-data-protection/` | 8 | Foundation (cross-cutting) |

**Total Requirements: 159**

---

## Per-Module Navigation

Each module contains three files:

| File | Purpose |
|------|---------|
| `overview.md` | Purpose, scope, responsibilities, boundaries |
| `requirements.md` | Detailed functional requirements with acceptance criteria |
| `design.md` | API design, data models, event flows, integration points |

> Module 16 (Compliance, Data Protection & Handover) is a cross-cutting module and contains `overview.md` + `requirements.md` only; it has no standalone `design.md` because its controls are implemented within the other modules' designs.

---

## Key Actors / Personas

| Actor | Description |
|-------|-------------|
| **Admin** | Back-office administrator, full system access |
| **Dispatcher** | Plans field deployments, manages calendar |
| **Project Manager** | Manages projects, preparatory actions, documents |
| **Office Staff** | Handles quotations, orders, invoices, accounting |
| **Technician** | Field staff using mobile app for work reports, time tracking |
| **Customer** | External user submitting service requests via website plugin |
| **Partner Company** | Receives appointment confirmations for construction schedules |
| **System** | Automated processes (reminders, sync, maintenance alerts) |

---

## Cross-Cutting Concerns

| Concern | Approach |
|---------|----------|
| **Authentication** | JWT-based, module 02 |
| **Authorization** | Role-based access control per module |
| **Offline Support** | Mobile app with local DB + sync queue |
| **Notifications** | Centralized service (push, email, WhatsApp) |
| **File Storage** | S3-compatible, managed by core platform |
| **Event Bus** | Async domain events for module decoupling |
| **Data Protection** | Swiss data protection law (nDSG/revDSG) compliance — see [Module 16](modules/16-compliance-data-protection/overview.md) |
| **Source Code & IP / OSS** | Rights handover and open-source disclosure — see [Module 16](modules/16-compliance-data-protection/overview.md) (SRC-001, OSS-001) |
| **Multilingual** | DE, FR, IT, EN document generation |
| **CI/Branding** | Museo Sans fonts, CMYK brand colors |

---

## Related Documents

- [System Architecture](architecture.md)
- [Dependency Map](dependencies.md)
- [Development Roadmap](roadmap.md)
- [Source: Detailed Service Agreement (EN)](Detaillierte-Leistungsvereinbarung-2026-03-22-EN.md)
