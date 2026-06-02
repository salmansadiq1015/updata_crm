# Development Roadmap

**MB Boiler & Heizung AG — Digital Platform**

---

## Phase Overview

| Phase | Name | Duration | Modules | Goal |
|-------|------|----------|---------|------|
| **1** | Foundation | Weeks 1–4 | 01, 02, 16 | Platform infrastructure, auth, CI/CD, data-protection & security baseline |
| **2** | Core Business | Weeks 5–12 | 03, 10, 09, 08 | CRM, materials, documents, quotations |
| **3** | Operations | Weeks 13–18 | 04, 05, 12, 11 | Projects, scheduling, tasks, accounting |
| **4** | Mobile & Notifications | Weeks 19–24 | 06, 13, 14 | Mobile app MVP, notifications, integrations |
| **5** | AI & Advanced | Weeks 25–28 | 07, 06+ | AI assistant, mobile offline/chat, advanced features |
| **6** | Migration & Launch | Weeks 29–32 | 15, 16 | Data migration, compliance/handover package, UAT, production go-live |

---

## MVP vs Advanced Features

### MVP (Phases 1–4) — Target: Production-ready core

| Module | MVP Scope |
|--------|-----------|
| **01 Core Platform** | API gateway, DB, file storage, logging, background jobs |
| **02 Auth & Users** | User CRUD, 4 core roles (Admin, Office, Dispatcher, Technician), JWT |
| **03 CRM & Assets** | Customer/contact/site/installation CRUD, maintenance intervals, due marking, history |
| **08 Quotes & Orders** | Quotation creation, status management, quote→order conversion, invoicing, advance invoices |
| **09 Doc Templates** | 3 core templates (quote, order confirmation, invoice), PDF export, email send |
| **10 Material Catalogs** | Internal catalog CRUD, article usage in quotes/orders |
| **04 Project Mgmt** | Project CRUD, status tracking, document repository |
| **05 Scheduling** | Calendar view, employee assignment, appointment management |
| **11 Accounting** | AR invoices, open receivables, incoming payments, basic journal |
| **12 Task Mgmt** | Task CRUD, assignment, due dates, basic reminders |
| **06 Mobile App** | Order overview, work reports, photo docs, time tracking (online only) |
| **13 Notifications** | Email dispatch, basic push notifications |
| **16 Compliance & DP** | nDSG/revDSG baseline (DP-001), consent enforcement (DP-002), security baseline & encryption (DP-006), retention policy (DP-004) |

### Advanced (Phases 5–6)

| Module | Advanced Scope |
|--------|---------------|
| **03 CRM** | Website plugin for customer orders, newsletter (WhatsApp/email), spare parts |
| **05 Scheduling** | Drag-and-drop rescheduling, conflict detection, OF-Bau coarse view |
| **06 Mobile** | Offline mode + auto-sync, project chat, daily report reminders, quotation view |
| **07 AI Assistant** | Voice order creation, speech-to-text reports, multi-language |
| **08 Quotes** | Multilingual documents, department filtering, WhatsApp reminders |
| **11 Accounting** | AP supplier invoices, OCR scanning, bank connection, payment reconciliation, cash mgmt |
| **13 Notifications** | WhatsApp integration, notification preferences, scheduled notifications |
| **14 Integrations** | IGH catalog sync, banking interface (ISO 20022), website widget, calendar sync |
| **15 Data Migration** | Full migration from OF software + Messerli CRM |
| **16 Compliance & DP** | Data-subject-rights tooling (DP-003), ROPA & sub-processor DPAs (DP-005), SBOM automation (OSS-001), source-code & IP handover package (SRC-001) |

---

## Phase 1: Foundation (Weeks 1–4)

### Goals
- Production-grade infrastructure
- Authentication and authorization framework
- CI/CD pipeline
- Development environment setup

### Deliverables

| Week | Tasks |
|------|-------|
| 1 | Project setup, repository structure, CI/CD pipeline, dev environment |
| 2 | CORE-001 API gateway, CORE-002 event bus, CORE-005 DB migrations, CORE-010 error handling |
| 3 | AUTH-001 user management, AUTH-002 role definitions, AUTH-003 module access control, AUTH-004 JWT |
| 4 | CORE-003 logging, CORE-006 file storage, CORE-008 caching, AUTH-005 password policies |

### Exit Criteria
- API gateway routing functional
- User registration, login, JWT auth working
- Role-based access control enforced
- File upload/download operational
- Automated tests passing in CI

---

## Phase 2: Core Business (Weeks 5–12)

### Goals
- Full CRM with customer/site/installation management
- Material catalog with articles and pricing
- Document template engine with CI branding
- Quotation-to-invoice lifecycle

### Deliverables

| Week | Tasks |
|------|-------|
| 5–6 | CRM-001 through CRM-006: customer, contact, site, installation CRUD |
| 7 | CRM-007/008 maintenance intervals + due marking, CRM-009 history, CRM-010/011 images/notes |
| 8 | MAT-001 through MAT-004: catalog, articles, text blocks with prices |
| 9 | DOC-001 through DOC-003: quotation, order confirmation, invoice templates |
| 10 | DOC-006/007/008: auto-generation, PDF export, email dispatch; DOC-009 CI compliance |
| 11 | QOP-001 through QOP-007: quotation CRUD, status, reminders, quote→order, confirmations, invoicing |
| 12 | QOP-008/009: advance invoices + deduction, QOP-010/012: status tracking, auto-numbering |

### Exit Criteria
- End-to-end flow: Create customer → create site → create quotation → convert to order → generate invoice
- PDF documents render with correct CI branding
- Material articles usable in quotations
- Maintenance due dates calculated and displayed

---

## Phase 3: Operations (Weeks 13–18)

### Goals
- Project management with status tracking
- Calendar-based field deployment
- Task management with assignment
- Basic accounting (AR)

### Deliverables

| Week | Tasks |
|------|-------|
| 13 | PROJ-001 through PROJ-004: project CRUD, status, preparatory actions, construction schedule |
| 14 | PROJ-005/006/007: documents, repository, dashboard |
| 15 | SCHED-001 through SCHED-005: calendar, employee assignment, appointments, mobile provision |
| 16 | TASK-001 through TASK-007: task CRUD, lists, assignment, due dates, reminders, completion |
| 17 | ACC-001 through ACC-003: AR invoices, open receivables, incoming payments |
| 18 | ACC-015/017: accounting journal, open-item management; integration testing |

### Exit Criteria
- Projects creatable with status workflow
- Calendar shows employee assignments
- Tasks assignable to projects and orders
- Invoices trackable with payment recording

---

## Phase 4: Mobile & Notifications (Weeks 19–24)

### Goals
- Mobile app MVP (online mode)
- Notification service (email + push)
- Core integrations

### Deliverables

| Week | Tasks |
|------|-------|
| 19 | Mobile app shell, auth, MOB-001/002: order overview, site/installation access |
| 20 | MOB-003/004: work reports, material/service entry |
| 21 | MOB-007/008/009: photo docs, time recording, time report lock |
| 22 | MOB-013: push notifications; NOTIF-001/002: push + email services |
| 23 | INT-005: SMTP integration; INT-001: website widget (basic) |
| 24 | End-to-end mobile testing, performance optimization |

### Exit Criteria
- Technicians can view orders, create reports, track time on mobile
- Push notifications delivered for new assignments
- Email dispatch functional for documents
- Website widget accepts service requests

---

## Phase 5: AI & Advanced (Weeks 25–28)

### Goals
- AI voice assistant
- Mobile offline mode
- Advanced features across modules

### Deliverables

| Week | Tasks |
|------|-------|
| 25 | AI-001/002/003: voice order creation, report dictation, STT |
| 26 | AI-004/006: structured extraction, address capture; MOB-012: offline mode |
| 27 | MOB-010: project chat; MOB-015: daily reminders; NOTIF-003: WhatsApp |
| 28 | INT-002: IGH catalog; INT-003: banking interface; advanced accounting (AP, OCR) |

### Exit Criteria
- Voice-created orders appear correctly in system
- Mobile app functions offline with sync on reconnect
- Chat messages delivered in real-time
- IGH catalog articles importable

---

## Phase 6: Migration & Launch (Weeks 29–32)

### Goals
- Legacy data migration
- User acceptance testing
- Production deployment
- Go-live support

### Deliverables

| Week | Tasks |
|------|-------|
| 29 | MIG-001/002: OF software + Messerli CRM data extraction, mapping |
| 30 | MIG-003 through MIG-006: address, quotation, invoice, plant migration; MIG-007/008: validation, dry-run |
| 31 | MIG-009: formal migration protocol with spot-checks; UAT with client |
| 32 | Production migration, go-live, monitoring, hotfix support |

### Exit Criteria
- All legacy data migrated and verified per migration protocol
- Client signs off on UAT
- System operational in production
- Support/monitoring in place

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| IGH API documentation unavailable | Start integration research in Phase 2; decouple catalog so it works without IGH |
| WhatsApp Business API approval delays | Use email as primary channel; WhatsApp as enhancement |
| OCR accuracy insufficient | Implement manual correction UI alongside OCR; track accuracy metrics |
| Offline sync conflicts | Last-write-wins with conflict log; manual resolution UI for edge cases |
| Data migration quality issues | Multiple dry-runs; validation reports; client responsible for source data quality per contract |
| Voice recognition accuracy (Swiss German) | Start with standard German; fine-tune with domain vocabulary; fallback to manual input |
| Template correction rounds | Contract limits correction rounds; get template approval before coding |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| **API Response Time** | p95 < 500ms |
| **Mobile App Launch** | < 3 seconds |
| **Offline Sync** | Complete within 30s on reconnect |
| **PDF Generation** | < 5 seconds per document |
| **OCR Accuracy** | > 85% field extraction accuracy |
| **Voice Recognition** | > 90% word accuracy (standard German) |
| **System Uptime** | 99.5% (excl. planned maintenance) |
| **Data Migration** | 100% of agreed data types, 0% data loss |
