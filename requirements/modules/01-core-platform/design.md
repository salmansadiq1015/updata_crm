# Module 01 -- Core Platform: Technical Design

---

## 1. API Design

### 1.1 Gateway Endpoints

The gateway itself exposes the following system-level endpoints. All business-module endpoints are routed through the gateway transparently.

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| GET | `/health/live` | Liveness probe | No |
| GET | `/health/ready` | Readiness probe (checks all dependencies) | No |
| GET | `/metrics` | Prometheus metrics endpoint | No (internal network only) |
| GET | `/api/docs` | Swagger UI | No |
| GET | `/api/docs/openapi.json` | OpenAPI 3.1 specification | No |
| GET | `/api/v1/system/config` | Non-sensitive runtime configuration | Admin |
| GET | `/api/v1/system/jobs` | Background job queue overview | Admin |
| GET | `/api/v1/system/jobs/:id` | Single job status | Admin |
| DELETE | `/api/v1/system/jobs/:id` | Cancel/remove a job | Admin |
| GET | `/api/v1/system/events/dlq` | Dead-letter queue listing | Admin |
| POST | `/api/v1/system/events/dlq/:id/retry` | Retry a dead-lettered event | Admin |
| POST | `/api/v1/system/cache/invalidate` | Invalidate cache entries by pattern | Admin |

### 1.2 File Storage Endpoints

| Method | Path | Description | Auth Required |
|--------|------|-------------|---------------|
| POST | `/api/v1/files/upload` | Upload a file (multipart/form-data) | Yes |
| GET | `/api/v1/files/:id` | Get file metadata | Yes |
| GET | `/api/v1/files/:id/download` | Download file or get pre-signed URL | Yes |
| DELETE | `/api/v1/files/:id` | Delete a file | Yes |
| GET | `/api/v1/files` | List files (with filters: bucket, prefix, module) | Yes |

### 1.3 Standard Response Envelope

All API responses follow a consistent envelope:

```json
{
  "success": true,
  "data": { },
  "meta": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-03-29T10:15:30.000Z",
    "duration": 42
  }
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "statusCode": 400,
    "error": "Bad Request",
    "message": "Validation failed",
    "details": [
      { "field": "email", "message": "must be a valid email address" }
    ]
  },
  "meta": {
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-03-29T10:15:30.000Z"
  }
}
```

### 1.4 Paginated List Response

```json
{
  "success": true,
  "data": [ ],
  "pagination": {
    "page": 1,
    "pageSize": 25,
    "totalItems": 142,
    "totalPages": 6
  },
  "meta": { }
}
```

Standard query parameters for pagination: `page` (default 1), `pageSize` (default 25, max 100), `sortBy`, `sortOrder` (`asc`|`desc`).

---

## 2. Data Models

### 2.1 Migration Record

Table: `_migrations`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | SERIAL | PK | Auto-increment ID |
| version | INTEGER | NOT NULL, UNIQUE | Migration version number |
| name | VARCHAR(255) | NOT NULL | Migration file name |
| checksum | VARCHAR(64) | NOT NULL | SHA-256 of migration file |
| executed_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Execution timestamp |
| duration_ms | INTEGER | NOT NULL | Execution duration in milliseconds |
| rolled_back_at | TIMESTAMPTZ | NULL | Set if migration was rolled back |

### 2.2 File Metadata

Table: `file_metadata`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() | Unique file identifier |
| bucket | VARCHAR(100) | NOT NULL | Storage bucket name |
| key | VARCHAR(500) | NOT NULL | Object key / path |
| original_name | VARCHAR(255) | NOT NULL | Original upload filename |
| mime_type | VARCHAR(100) | NOT NULL | Detected MIME type |
| size_bytes | BIGINT | NOT NULL | File size in bytes |
| uploaded_by | UUID | FK -> users.id, NULL | Uploading user |
| module | VARCHAR(50) | NOT NULL | Owning module name |
| entity_type | VARCHAR(100) | NULL | Associated entity type (e.g., 'customer') |
| entity_id | UUID | NULL | Associated entity ID |
| storage_backend | VARCHAR(20) | NOT NULL | 'local', 'minio', 's3' |
| checksum_sha256 | VARCHAR(64) | NOT NULL | SHA-256 hash of file content |
| is_deleted | BOOLEAN | NOT NULL, DEFAULT false | Soft delete flag |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Upload timestamp |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last update timestamp |
| deleted_at | TIMESTAMPTZ | NULL | Soft deletion timestamp |

Indexes:
- `idx_file_metadata_bucket_key` on `(bucket, key)` UNIQUE
- `idx_file_metadata_entity` on `(entity_type, entity_id)`
- `idx_file_metadata_module` on `(module)`

### 2.3 Event Log (Optional Persistence)

Table: `event_log`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Event envelope ID |
| type | VARCHAR(200) | NOT NULL | Event type (e.g., 'customer.created') |
| source | VARCHAR(50) | NOT NULL | Publishing module |
| correlation_id | UUID | NULL | Correlation ID for tracing |
| payload | JSONB | NOT NULL | Event payload |
| version | VARCHAR(20) | NOT NULL | Event schema version |
| published_at | TIMESTAMPTZ | NOT NULL | Publication timestamp |
| consumed_at | TIMESTAMPTZ | NULL | First consumption timestamp |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'published' | 'published', 'consumed', 'failed', 'dlq' |

Indexes:
- `idx_event_log_type` on `(type)`
- `idx_event_log_correlation` on `(correlation_id)`
- `idx_event_log_published_at` on `(published_at)`

### 2.4 Background Job Record

Table: `background_jobs`

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | UUID | PK | Job identifier |
| queue | VARCHAR(100) | NOT NULL | Queue name |
| type | VARCHAR(200) | NOT NULL | Job type identifier |
| payload | JSONB | NOT NULL | Job payload |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'pending' | pending, active, completed, failed, delayed |
| priority | SMALLINT | NOT NULL, DEFAULT 0 | Priority (higher = more urgent) |
| attempts | SMALLINT | NOT NULL, DEFAULT 0 | Number of attempts made |
| max_attempts | SMALLINT | NOT NULL, DEFAULT 3 | Maximum retry attempts |
| result | JSONB | NULL | Job result on completion |
| error | TEXT | NULL | Error message on failure |
| scheduled_at | TIMESTAMPTZ | NULL | Scheduled execution time |
| started_at | TIMESTAMPTZ | NULL | Actual start time |
| completed_at | TIMESTAMPTZ | NULL | Completion time |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Creation timestamp |

Indexes:
- `idx_background_jobs_status_queue` on `(status, queue)`
- `idx_background_jobs_scheduled` on `(scheduled_at)` WHERE status = 'delayed'

---

## 3. Event Flows

### 3.1 Event Envelope Schema

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "type": "customer.created",
  "source": "crm",
  "correlationId": "660e8400-e29b-41d4-a716-446655440001",
  "timestamp": "2026-03-29T10:15:30.000Z",
  "version": "1.0.0",
  "payload": {
    "customerId": "770e8400-e29b-41d4-a716-446655440002",
    "name": "Muster AG"
  }
}
```

### 3.2 Event Bus Topology (RabbitMQ)

```
Producer Module
      |
      v
[Topic Exchange: "domain.events"]
      |
      +---> Queue: "crm.customer.created" --> CRM Consumer
      |
      +---> Queue: "notifications.customer.created" --> Notification Consumer
      |
      +---> Queue: "audit.all" (wildcard binding "#") --> Audit Consumer
      |
      +---> DLX: "domain.events.dlx"
                |
                +---> DLQ: "domain.events.dlq.<original-queue>"
```

- **Exchange type:** Topic exchange.
- **Routing key format:** `<module>.<entity>.<action>` (e.g., `crm.customer.created`).
- **Dead-letter exchange (DLX):** Bound to all queues via `x-dead-letter-exchange`.
- **Message TTL in DLQ:** 7 days (configurable).

### 3.3 Core Platform Events Published

| Event Type | Payload | Trigger |
|------------|---------|---------|
| `system.started` | `{ version, environment, timestamp }` | Application boot complete |
| `system.health.degraded` | `{ dependency, status, error }` | Health check detects failure |
| `system.health.recovered` | `{ dependency, status }` | Previously failed dependency recovers |
| `file.uploaded` | `{ fileId, bucket, key, mimeType, size, module }` | File upload completed |
| `file.deleted` | `{ fileId, bucket, key }` | File deleted |
| `job.failed` | `{ jobId, queue, type, error, attempts }` | Job exhausted retries |

### 3.4 Event Flow Diagram -- File Upload

```
Client                Gateway              FileService         S3/MinIO        EventBus
  |                      |                      |                  |               |
  |-- POST /files/upload -->                    |                  |               |
  |                      |-- validate size/type -->                |               |
  |                      |                      |-- PUT object --->|               |
  |                      |                      |<-- 200 OK -------|               |
  |                      |                      |-- INSERT metadata (DB) --------->|
  |                      |                      |-- publish("file.uploaded") ------>|
  |                      |<-- 201 { fileId } ---|                  |               |
  |<-- 201 Created ------|                      |                  |               |
```

---

## 4. Integration Points

### 4.1 Dependencies (Infrastructure)

| Dependency | Protocol | Purpose | Required |
|------------|----------|---------|----------|
| PostgreSQL | TCP/5432 | Primary database | Yes |
| Redis | TCP/6379 | Caching, job queues, session store | Yes |
| RabbitMQ | AMQP/5672 | Event bus, async messaging | Yes |
| S3/MinIO | HTTPS/9000 | File/object storage | Yes |
| Sentry | HTTPS | Error tracking (optional) | No |
| ELK/Loki | HTTPS | Log aggregation (optional) | No |
| Prometheus | HTTP/9090 | Metrics scraping | Recommended |

### 4.2 Integration with Other Modules

The Core Platform does not call other modules directly. Instead, it provides services that other modules consume:

| Service | Consumer Modules | Interface |
|---------|-----------------|-----------|
| API Gateway | All | HTTP middleware pipeline |
| Event Bus | All | `eventBus.publish()` / `@OnEvent()` |
| File Storage | CRM (images), Projects (documents), Field Service (photos) | `fileStorage.upload()` / `fileStorage.download()` |
| Cache | All | `cache.get()` / `cache.set()` |
| Job Queue | CRM (newsletters), Invoicing (PDF generation), Notifications | `jobService.enqueue()` |
| Config | All | `configService.get()` |
| Logging | All | `logger.info()` / `logger.error()` |

### 4.3 Module Registration Pattern

Each business module registers with the Core Platform on startup:

```typescript
// Example module registration
@Module({
  name: 'crm',
  version: '1.0.0',
  routes: CrmRoutes,
  eventHandlers: CrmEventHandlers,
  jobs: CrmJobDefinitions,
  healthChecks: [CrmDatabaseCheck],
})
export class CrmModule {}
```

The Core Platform then:
1. Registers the module's routes under `/api/v1/crm/...`.
2. Binds event handler queues for declared subscriptions.
3. Registers job handlers with the job processing framework.
4. Includes the module's health checks in the readiness probe.

---

## 5. Caching Strategy

### 5.1 Cache Key Convention

```
<namespace>:<entity>:<identifier>[:<variant>]
```

Examples:
- `crm:customer:550e8400` -- single customer record
- `crm:customer:list:page=1&size=25` -- paginated list
- `auth:permissions:user:660e8400` -- user permission set

### 5.2 Invalidation Strategy

| Trigger | Invalidation Scope |
|---------|--------------------|
| Entity created | List caches for that entity type |
| Entity updated | Specific entity cache + related list caches |
| Entity deleted | Specific entity cache + related list caches |
| Role/permission changed | All permission caches for affected users |

Invalidation is triggered via event bus: when a module publishes `customer.updated`, the cache listener invalidates `crm:customer:<id>` and `crm:customer:list:*`.

---

## 6. Logging Format

### 6.1 Structured Log Entry

```json
{
  "timestamp": "2026-03-29T10:15:30.123Z",
  "level": "INFO",
  "message": "HTTP request completed",
  "service": "mb-boiler-api",
  "environment": "production",
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "module": "gateway",
  "action": "http.request",
  "method": "GET",
  "path": "/api/v1/crm/customers",
  "statusCode": 200,
  "duration": 42,
  "userId": "sha256:a1b2c3d4",
  "ip": "192.168.1.x",
  "userAgent": "Mozilla/5.0..."
}
```

### 6.2 Log Levels

| Level | Usage |
|-------|-------|
| DEBUG | Detailed diagnostic info, disabled in production |
| INFO | Normal operations (request served, job completed, event published) |
| WARN | Recoverable issues (cache miss, retry attempt, deprecated endpoint used) |
| ERROR | Failures requiring attention (unhandled exception, dependency down) |
| FATAL | Application cannot continue (startup failure, critical dependency permanently lost) |

---

## 7. Security Considerations

- **Rate limiting:** IP-based and API-key-based, configurable per route group.
- **Request size limit:** 10 MB for JSON payloads, 50 MB for file uploads (configurable).
- **CORS:** Strict origin whitelist; no wildcard in production.
- **Headers:** Security headers applied globally (`X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`).
- **Input sanitization:** All string inputs sanitized against XSS; SQL injection prevented via parameterized queries (ORM).
- **Secrets:** Never logged, never returned in API responses, loaded exclusively from environment variables.

---

## 8. Deployment Architecture

```
                    [Load Balancer / Reverse Proxy]
                              |
              +---------------+---------------+
              |                               |
        [API Server 1]                 [API Server 2]
              |                               |
              +-------+-----------+-----------+
                      |           |           |
                [PostgreSQL]  [Redis]   [RabbitMQ]
                                              |
                                     [Worker Process(es)]
                                              |
                                    [S3 / MinIO Storage]
```

- API servers are stateless and horizontally scalable.
- Workers can be scaled independently based on queue depth.
- PostgreSQL uses connection pooling (PgBouncer recommended for > 2 API instances).
- Redis is used for both caching and job queue storage (separate logical databases or instances recommended for production).
