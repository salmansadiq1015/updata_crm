# System Architecture

**MB Boiler & Heizung AG — Digital Platform**

---

## 1. Architecture Style

**Modular Monolith with Event-Driven Communication**, designed to be extractable into microservices as the system scales.

### Rationale

- **Team size:** Small-to-medium team — microservices overhead is unjustified at launch
- **Time to market:** Modular monolith ships faster with lower operational complexity
- **Future-proofing:** Clean module boundaries and event bus allow extraction into microservices per-module when needed
- **Mobile app:** Separate deployment (React Native / Flutter), communicates via REST API + WebSocket

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                               │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Web App  │  │ Mobile App   │  │ Website Plugin (Widget)│ │
│  │ (React)  │  │ (iOS/Android)│  │ (Embeddable JS)       │ │
│  └────┬─────┘  └──────┬───────┘  └───────────┬────────────┘ │
└───────┼────────────────┼─────────────────────┼──────────────┘
        │                │                     │
        ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                     API GATEWAY / BFF                        │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │
│  │ Web API  │  │ Mobile BFF   │  │ Public API (Widget)    │ │
│  │ (REST)   │  │ (REST+WS)   │  │ (REST, rate-limited)   │ │
│  └────┬─────┘  └──────┬───────┘  └───────────┬────────────┘ │
└───────┼────────────────┼─────────────────────┼──────────────┘
        │                │                     │
        ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                         │
│                                                              │
│  ┌─────────┐ ┌─────┐ ┌──────────┐ ┌────────┐ ┌──────────┐ │
│  │  CRM &  │ │Proj │ │Scheduling│ │ Quotes │ │Accounting│ │
│  │ Assets  │ │ Mgmt│ │          │ │& Orders│ │          │ │
│  └────┬────┘ └──┬──┘ └────┬─────┘ └───┬────┘ └────┬─────┘ │
│  ┌────┴────┐ ┌──┴──┐ ┌────┴─────┐ ┌───┴────┐ ┌────┴─────┐ │
│  │Materials│ │Tasks│ │  Docs &  │ │   AI   │ │  Notif.  │ │
│  │ Catalog │ │     │ │Templates │ │  Asst  │ │ Service  │ │
│  └─────────┘ └─────┘ └──────────┘ └────────┘ └──────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              EVENT BUS (RabbitMQ / Redis Streams)     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │        AUTH & RBAC (Cross-cutting middleware)          │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
        │                │                     │
        ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   INFRASTRUCTURE LAYER                       │
│                                                              │
│  ┌──────────┐  ┌───────┐  ┌──────┐  ┌──────┐  ┌─────────┐ │
│  │PostgreSQL│  │ Redis │  │  S3  │  │Queue │  │  OCR    │ │
│  │  (Main)  │  │(Cache)│  │(Files)│ │(Jobs)│  │Service  │ │
│  └──────────┘  └───────┘  └──────┘  └──────┘  └─────────┘ │
│                                                              │
│  ┌──────────┐  ┌───────┐  ┌──────┐  ┌──────────────────┐   │
│  │  SMTP    │  │WhatsApp│ │ Bank │  │ IGH Catalog API  │   │
│  │ Service  │  │Bus.API│  │ API  │  │                  │   │
│  └──────────┘  └───────┘  └──────┘  └──────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack (Recommended)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Web Frontend** | React + TypeScript | Component ecosystem, TypeScript safety |
| **Mobile App** | React Native or Flutter | Cross-platform iOS/Android from single codebase |
| **API Backend** | Node.js (NestJS) or Python (FastAPI) | Modular architecture support, async-capable |
| **Database** | PostgreSQL 16+ | JSONB for flexible fields, full-text search, robust |
| **Cache** | Redis 7+ | Session store, cache, pub/sub, job queues |
| **File Storage** | S3-compatible (AWS S3 / MinIO) | Scalable blob storage for images, documents |
| **Message Queue** | RabbitMQ or Redis Streams | Event-driven communication, job processing |
| **Search** | PostgreSQL FTS (start) → Elasticsearch (scale) | Full-text search across CRM, catalogs |
| **OCR** | Tesseract / AWS Textract / Azure Form Recognizer | Supplier invoice scanning |
| **STT/AI** | OpenAI Whisper / Google Speech-to-Text | Voice assistant module |
| **NLP** | Claude API / GPT-4 | Structured data extraction from voice |
| **PDF Generation** | Puppeteer / WeasyPrint | Template-based document rendering |
| **Push Notifications** | Firebase Cloud Messaging (FCM) | Cross-platform push |
| **Email** | SMTP + SendGrid/SES | Transactional email |
| **WhatsApp** | WhatsApp Business API (Meta) | Newsletter, reminders |
| **Hosting** | AWS (preferred) or Azure | Swiss data residency option |

---

## 4. Communication Patterns

### 4.1 Synchronous (REST API)

Used for:
- CRUD operations
- User-facing queries
- Mobile BFF endpoints
- Public widget API

### 4.2 Asynchronous (Event Bus)

Used for:
- Module-to-module notifications (e.g., "quotation accepted" → create order)
- Background processing (OCR, document generation, AI transcription)
- Notification dispatch
- Audit trail events
- Maintenance due calculations

### 4.3 WebSocket

Used for:
- Real-time chat (technician project chat)
- Live notification delivery (in-app)
- Calendar/schedule live updates
- Task list real-time sync

---

## 5. Data Architecture

### 5.1 Database Strategy

**Single PostgreSQL instance with schema-per-module** (modular monolith pattern):

```
boiler_db/
├── core.*          -- migrations, config, jobs
├── auth.*          -- users, roles, permissions, sessions
├── crm.*           -- customers, contacts, sites, installations
├── project.*       -- projects, schedules, documents
├── scheduling.*    -- assignments, appointments
├── quotes.*        -- quotations, orders, invoices
├── docs.*          -- templates, generated documents
├── materials.*     -- catalogs, articles, text blocks
├── accounting.*    -- AR, AP, journal, bank transactions
├── tasks.*         -- tasks, lists, reminders
├── notifications.* -- notifications, preferences, delivery log
├── integration.*   -- external system configs, sync logs
└── migration.*     -- migration runs, mapping, validation
```

### 5.2 Key Relationships (Cross-Schema)

```
auth.users ──────────┐
                      ├── Referenced by nearly all modules
crm.customers ───────┤
                      │
crm.sites ───────────┼── Referenced by projects, scheduling, quotes
                      │
crm.installations ───┼── Referenced by service orders, reports
                      │
quotes.quotations ───┼── Referenced by accounting, projects
                      │
materials.articles ──┘── Referenced by quotes, reports, catalogs
```

### 5.3 File Storage Layout

```
s3://mb-boiler-files/
├── customers/{id}/images/
├── installations/{id}/photos/
├── projects/{id}/documents/
├── orders/{id}/reports/
├── orders/{id}/photos/
├── invoices/{id}/pdf/
├── templates/{id}/versions/
├── accounting/supplier-invoices/{id}/
└── migration/source-data/
```

---

## 6. Security Architecture

| Layer | Measure |
|-------|---------|
| **Transport** | TLS 1.3 everywhere |
| **Authentication** | JWT (access + refresh tokens) |
| **Authorization** | RBAC with module-level permissions |
| **API Security** | Rate limiting, CORS, input validation |
| **Data at Rest** | AES-256 encryption for PII |
| **File Uploads** | Virus scanning, type validation, size limits |
| **Public Widget** | CAPTCHA, rate limiting, origin validation |
| **Mobile** | Certificate pinning, encrypted local storage |
| **Audit** | All access events logged with actor, action, resource |
| **Compliance** | Swiss Federal Act on Data Protection (nDSG) |
| **Voice Data** | Processed ephemerally, not stored after transcription |

---

## 7. Scalability Strategy

### Phase 1: Launch (0–100 users)
- Single server deployment (modular monolith)
- PostgreSQL + Redis on same or adjacent instance
- S3 for file storage

### Phase 2: Growth (100–1,000 users)
- Horizontal scaling behind load balancer
- Read replicas for PostgreSQL
- Dedicated Redis cluster
- CDN for static assets and generated PDFs

### Phase 3: Scale (1,000+ users)
- Extract high-traffic modules into microservices (notifications, AI, document generation)
- Elasticsearch for search
- Kafka for event streaming (replace RabbitMQ)
- Multi-region deployment for Swiss data residency

---

## 8. Deployment Architecture

```
┌─────────────────────────────────────────┐
│              AWS (eu-central-1/2)        │
│                                          │
│  ┌─────────┐    ┌──────────────────┐    │
│  │   ALB   │───▶│  ECS / EKS       │    │
│  │         │    │  ┌────────────┐   │    │
│  └─────────┘    │  │ Web API    │   │    │
│                 │  │ Mobile BFF │   │    │
│  ┌─────────┐   │  │ Workers    │   │    │
│  │CloudFront│   │  └────────────┘   │    │
│  │  (CDN)  │   └──────────────────┘    │
│  └─────────┘                            │
│                                          │
│  ┌─────────┐  ┌───────┐  ┌──────────┐  │
│  │RDS Postgres│ │ElastiCache│ │   S3    │  │
│  │(Multi-AZ) │ │ (Redis)  │ │         │  │
│  └─────────┘  └───────┘  └──────────┘  │
│                                          │
│  ┌─────────┐  ┌───────────────────┐     │
│  │   SQS   │  │ CloudWatch/Logs   │     │
│  └─────────┘  └───────────────────┘     │
└─────────────────────────────────────────┘
```

---

## 9. Monitoring & Observability

| Component | Tool |
|-----------|------|
| **Application Logs** | Structured JSON → CloudWatch / ELK |
| **Metrics** | Prometheus + Grafana |
| **Tracing** | OpenTelemetry → Jaeger |
| **Alerting** | PagerDuty / CloudWatch Alarms |
| **Uptime** | Health check endpoints + synthetic monitoring |
| **Error Tracking** | Sentry |

---

## 10. Assumptions

1. **Cloud hosting on AWS** (eu-central-1 or eu-central-2 for Swiss data proximity) unless client specifies otherwise
2. **Single-tenant system** — this is a bespoke solution for MB Boiler, not a SaaS platform
3. **Swiss German (DE-CH)** is the primary language; documents support DE, FR, IT, EN
4. **Mobile app** will be cross-platform (React Native or Flutter), not native per platform
5. **OCR** and **STT** services may use cloud APIs (Textract, Whisper) with data processing agreements
6. **IGH catalog** integration depends on third-party API documentation availability
7. **Banking interface** follows Swiss ISO 20022 standard (camt/pain messages)
8. **WhatsApp Business API** requires Meta verification and approved message templates
