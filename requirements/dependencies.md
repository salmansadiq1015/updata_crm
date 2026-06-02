# Module Dependency Map

**MB Boiler & Heizung AG — Digital Platform**

---

## 1. Dependency Graph (Textual)

```
Layer 0 (Foundation):
  01-core-platform
      │
      ▼
Layer 1 (Identity):
  02-authentication-users
      │
      ▼
Layer 2 (Core Business Data):
  03-crm-asset-management ◄──────────────────────────────┐
  10-material-catalogs                                    │
      │                                                   │
      ▼                                                   │
Layer 3 (Business Operations):                            │
  04-project-management ──────► 03 (sites, customers)     │
  05-field-deployment-planning ► 03, 04 (orders, projects)│
  08-quotations-order-processing ► 03, 10 (customers, articles)
  09-document-templates ──────► 08 (document data)        │
      │                                                   │
      ▼                                                   │
Layer 4 (Extended Operations):                            │
  11-accounting ──────────────► 08 (invoices)              │
  12-task-management ─────────► 04, 05 (projects, orders) │
      │                                                   │
      ▼                                                   │
Layer 5 (Cross-Cutting Services):                         │
  07-ai-assistant ────────────► 03, 08 (voice data entry) │
  13-notifications ───────────► all modules (events)      │
      │                                                   │
      ▼                                                   │
Layer 6 (External Adapters):                              │
  14-integrations ────────────► 03, 08, 10, 11 ───────────┘
      │
      ▼
Layer 7 (Client-Facing Mobile):
  06-mobile-technician-app ──► 03, 04, 05, 08, 10, 12, 13

One-Time:
  15-data-migration ─────────► 03, 08, 11 (target schemas)
```

---

## 2. Module Dependency Matrix

| Module | Depends On (Upstream) | Depended By (Downstream) |
|--------|-----------------------|--------------------------|
| **01 Core Platform** | — | All modules |
| **02 Auth & Users** | 01 | All modules |
| **03 CRM & Assets** | 01, 02 | 04, 05, 06, 07, 08, 11, 14, 15 |
| **04 Project Mgmt** | 01, 02, 03 | 05, 06, 12 |
| **05 Scheduling** | 01, 02, 03, 04 | 06 |
| **06 Mobile App** | 01, 02, 03, 04, 05, 08, 10, 12, 13 | — (leaf consumer) |
| **07 AI Assistant** | 01, 02, 03, 08 | 06 |
| **08 Quotes & Orders** | 01, 02, 03, 09, 10 | 06, 07, 11, 15 |
| **09 Doc Templates** | 01, 02 | 08 |
| **10 Material Catalogs** | 01, 02 | 06, 08 |
| **11 Accounting** | 01, 02, 03, 08 | — |
| **12 Task Mgmt** | 01, 02, 03, 04 | 06 |
| **13 Notifications** | 01, 02 | 06 (and all modules publish events to it) |
| **14 Integrations** | 01, 02 | 03, 08, 10, 11, 13 |
| **15 Data Migration** | 01, 03, 08, 11 | — (one-time) |
| **16 Compliance & DP** | 01, 02, 03, 11, 13, 14 | All modules (cross-cutting controls) |

---

## 3. Communication Type

| From → To | Type | Pattern |
|-----------|------|---------|
| 03 → 13 | Async | Event: `maintenance.due`, `customer.created` |
| 04 → 13 | Async | Event: `project.status_changed` |
| 05 → 06 | Async | Event: `assignment.created`, `assignment.changed` |
| 05 → 13 | Async | Event: `assignment.created` → push notification |
| 06 → 03 | Sync | REST: fetch site/installation data |
| 06 → 05 | Sync | REST: fetch assignments |
| 06 → 08 | Sync | REST: submit work reports |
| 06 → 10 | Sync | REST: fetch material catalog |
| 06 → 12 | Sync+WS | REST+WebSocket: task sync |
| 07 → 03 | Sync | REST: create/update customer, orders |
| 07 → 08 | Sync | REST: create quotations via voice |
| 08 → 03 | Sync | REST: fetch customer data |
| 08 → 09 | Sync | REST: render document from template |
| 08 → 10 | Sync | REST: fetch article/pricing |
| 08 → 11 | Async | Event: `invoice.created`, `invoice.paid` |
| 08 → 13 | Async | Event: `quotation.reminder_due` |
| 11 → 14 | Sync | REST: bank transaction fetch/push |
| 14 → 03 | Async | Event: `widget.order_submitted` |
| 14 → 10 | Async | Event: `igh.catalog_updated` |
| 14 → 11 | Sync | REST: bank data import |
| 15 → 03, 08, 11 | Sync | Direct DB: bulk data import |

---

## 4. Critical Path (Build Order)

The following represents the recommended implementation sequence based on dependencies:

```
Sprint 1-2:   01 Core Platform
              02 Authentication & Users
                 ↓
Sprint 3-5:   03 CRM & Asset Management
              10 Material Catalogs
              09 Document Templates
                 ↓
Sprint 6-8:   08 Quotations & Order Processing
              04 Project Management
              12 Task Management
                 ↓
Sprint 9-10:  05 Field Deployment Planning
              11 Accounting
              13 Notifications
                 ↓
Sprint 11-12: 14 Integrations (Website plugin, IGH, Bank)
              06 Mobile Technician App (MVP)
                 ↓
Sprint 13-14: 07 AI Assistant
              06 Mobile App (Full — offline, chat, push)
                 ↓
Sprint 15:    15 Data Migration (dry-run)
                 ↓
Sprint 16:    15 Data Migration (production cutover)
              System-wide integration testing
              UAT & Go-Live
```

---

## 5. Event Catalog (Key Domain Events)

| Event | Publisher | Subscribers |
|-------|-----------|-------------|
| `customer.created` | 03 CRM | 13 Notifications |
| `customer.updated` | 03 CRM | 06 Mobile (sync) |
| `site.created` | 03 CRM | 04 Project, 05 Scheduling |
| `maintenance.due` | 03 CRM | 13 Notifications, 05 Scheduling |
| `project.created` | 04 Project | 12 Tasks, 05 Scheduling |
| `project.status_changed` | 04 Project | 13 Notifications |
| `assignment.created` | 05 Scheduling | 06 Mobile, 13 Notifications |
| `assignment.changed` | 05 Scheduling | 06 Mobile, 13 Notifications |
| `report.submitted` | 06 Mobile | 08 Quotes, 11 Accounting |
| `time_entry.submitted` | 06 Mobile | 11 Accounting |
| `quotation.created` | 08 Quotes | 13 Notifications |
| `quotation.accepted` | 08 Quotes | 04 Project, 13 Notifications |
| `quotation.reminder_due` | 08 Quotes | 13 Notifications |
| `order.created` | 08 Quotes | 05 Scheduling, 13 Notifications |
| `invoice.created` | 08 Quotes | 11 Accounting, 13 Notifications |
| `invoice.paid` | 11 Accounting | 08 Quotes |
| `payment.received` | 11 Accounting | 08 Quotes |
| `document.generated` | 09 Templates | 08 Quotes, 13 Notifications |
| `widget.order_submitted` | 14 Integrations | 03 CRM, 13 Notifications |
| `catalog.updated` | 14 Integrations | 10 Materials |
| `task.due` | 12 Tasks | 13 Notifications |
| `task.assigned` | 12 Tasks | 13 Notifications, 06 Mobile |
