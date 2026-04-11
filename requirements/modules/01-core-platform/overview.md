# Module 01 -- Core Platform

## 1. Purpose

The Core Platform module provides the foundational technical infrastructure on which all other modules of the MB Boiler & Heizung AG ERP/Field-Service platform are built. It is a cross-cutting concerns layer that delivers shared services, communication patterns, and operational tooling required by every business module.

## 2. Source Requirement

Internal architectural decision -- no single SOW section. Derived from the need for a unified, maintainable, and scalable platform backbone.

## 3. Scope

| In Scope | Out of Scope |
|----------|--------------|
| Application shell & bootstrapping | Business logic of any domain |
| API gateway & request routing | Authentication & authorization (Module 02) |
| Event bus (domain event backbone) | UI component library |
| Shared database infrastructure | Domain-specific data models |
| Configuration management | End-user-facing screens |
| Centralized logging & monitoring | |
| Health checks & readiness probes | |
| Caching layer (Redis) | |
| File storage abstraction (S3-compat.) | |
| Background job processing | |
| Database migration framework | |
| Error handling & reporting | |

## 4. Responsibilities

- Bootstrapping the web application and API server.
- Providing shared services: structured logging, configuration, error handling, and health monitoring.
- Routing all inbound HTTP/REST traffic through a single gateway with versioning, rate limiting, and request validation.
- Operating the event-driven communication backbone so modules can publish and subscribe to domain events without tight coupling.
- Managing database connection pooling, migrations, and schema versioning.
- Providing a caching layer (Redis) for performance-critical read paths.
- Abstracting file/object storage behind a provider-agnostic interface (S3-compatible).
- Running background and scheduled jobs (e.g., email sending, report generation, maintenance-due checks).

## 5. Key Features

| ID | Feature | Priority |
|----|---------|----------|
| CORE-001 | API Gateway & Routing | H |
| CORE-002 | Event Bus Infrastructure | H |
| CORE-003 | Centralized Logging & Monitoring | H |
| CORE-004 | Configuration Management | M |
| CORE-005 | Database Migration Framework | H |
| CORE-006 | File Storage Service | H |
| CORE-007 | Background Job Processing | M |
| CORE-008 | Caching Layer | M |
| CORE-009 | Health Check & Readiness Probes | M |
| CORE-010 | Error Handling & Reporting | H |

## 6. Technology Decisions

| Concern | Technology |
|---------|-----------|
| Primary database | PostgreSQL 15+ |
| Cache | Redis 7+ |
| File/object storage | S3-compatible (MinIO for dev/self-hosted, AWS S3 for cloud) |
| Message queue / event bus | RabbitMQ (AMQP 0-9-1) |
| Logging format | Structured JSON (ELK-compatible) |
| API style | RESTful, JSON payloads, OpenAPI 3.1 specs |
| Background jobs | Bull (Node.js) or Celery (Python) backed by Redis |
| Monitoring | Prometheus metrics + Grafana dashboards |

## 7. Module Boundaries

```
+---------------------------------------------+
|              Core Platform (01)              |
|  +---------+  +----------+  +------------+  |
|  | API GW  |  | Event Bus|  | File Store |  |
|  +---------+  +----------+  +------------+  |
|  +---------+  +----------+  +------------+  |
|  | Logging |  | Cache    |  | Jobs       |  |
|  +---------+  +----------+  +------------+  |
|  +---------+  +----------+  +------------+  |
|  | Config  |  | DB Migr. |  | Health     |  |
|  +---------+  +----------+  +------------+  |
+---------------------------------------------+
        |               |               |
   Module 02       Module 03       Module 04 ...
  (Auth/Users)   (CRM/Assets)    (Projects)
```

- **Upstream dependencies:** None (root module).
- **Downstream consumers:** Every other module depends on Core Platform.

## 8. Key Constraints

- The platform must support deployment on both cloud (AWS/Azure) and on-premises (Docker Compose) environments typical of Swiss SME IT infrastructure.
- All data at rest and in transit must comply with Swiss data protection regulations (nDSG / FADP) and GDPR where applicable.
- The system must support the German language as primary UI/log language, with English as the technical default.
- Structured logs must never contain PII in plaintext.

## 9. Success Metrics

| Metric | Target |
|--------|--------|
| API gateway p99 latency (excluding downstream) | < 15 ms |
| Event delivery guarantee | At-least-once |
| Uptime (health check perspective) | 99.5 % |
| Mean time to recover from failed migration | < 10 min |
| Cache hit ratio for hot-path queries | > 80 % |
