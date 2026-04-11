# Module 01 -- Core Platform: Detailed Requirements

---

## CORE-001: API Gateway & Routing

| Field | Value |
|-------|-------|
| **ID** | CORE-001 |
| **Title** | API Gateway & Routing |
| **Priority** | H |
| **Complexity** | High |
| **Dependencies** | None (foundational) |
| **Tags** | `infrastructure`, `api`, `gateway`, `routing`, `security` |

### Description

The system shall expose a single API gateway that receives all inbound HTTP requests, applies cross-cutting middleware (rate limiting, request validation, CORS, compression), and routes them to the appropriate internal module handler. The gateway must support API versioning (URI-based, e.g., `/api/v1/...`) and generate OpenAPI 3.1 documentation automatically from route definitions.

### Actors

- **System** -- routes and processes requests automatically.
- **DevOps** -- configures rate limits, allowed origins, and deployment parameters.
- **Admin** -- monitors API usage through dashboards.

### Preconditions

1. The application server process is running and bound to the configured port.
2. At least one module has registered its route handlers.

### Flow

**Main Flow:**

1. An external client sends an HTTP request to the gateway endpoint.
2. The gateway applies CORS validation against the allowed-origins list.
3. The gateway checks the rate-limit counter for the client IP / API key.
4. If rate limit is not exceeded, the gateway parses and validates the request against the registered OpenAPI schema.
5. The gateway attaches a unique `X-Request-Id` header (UUID v4) if not already present.
6. The gateway forwards the request to the matching module handler.
7. The module handler processes the request and returns a response.
8. The gateway serializes the response as JSON, attaches standard headers (`X-Request-Id`, `X-Response-Time`), and returns it to the client.

**Alternate Flows:**

- **A1 -- Rate limit exceeded:** Gateway returns `429 Too Many Requests` with `Retry-After` header.
- **A2 -- Validation failure:** Gateway returns `400 Bad Request` with a structured error body listing field-level violations.
- **A3 -- Route not found:** Gateway returns `404 Not Found`.
- **A4 -- Internal error:** Gateway returns `500 Internal Server Error`, logs full stack trace internally, and returns a sanitized error to the client.

### Postconditions

- The request has been routed and a response returned to the caller.
- A structured log entry has been written for the request (method, path, status, duration, request ID).

### Acceptance Criteria

- [ ] All API endpoints are accessible exclusively through the gateway; no module exposes a direct port.
- [ ] Every response includes `X-Request-Id` and `X-Response-Time` headers.
- [ ] Rate limiting returns HTTP 429 when the configured threshold (default: 100 req/min per IP) is exceeded.
- [ ] Invalid request payloads return HTTP 400 with a JSON body containing an `errors` array with field paths and messages.
- [ ] OpenAPI 3.1 specification is auto-generated and available at `/api/docs` (Swagger UI) and `/api/docs/openapi.json`.
- [ ] API versioning via URI prefix (`/api/v1/`, `/api/v2/`) routes to the correct handler version.
- [ ] CORS preflight requests return correct `Access-Control-*` headers for configured origins.
- [ ] Gateway adds no more than 15 ms p99 latency to request processing (measured without downstream).

---

## CORE-002: Event Bus Infrastructure

| Field | Value |
|-------|-------|
| **ID** | CORE-002 |
| **Title** | Event Bus Infrastructure |
| **Priority** | H |
| **Complexity** | High |
| **Dependencies** | RabbitMQ instance |
| **Tags** | `infrastructure`, `events`, `messaging`, `async`, `decoupling` |

### Description

The system shall provide an event bus that enables modules to publish and subscribe to domain events asynchronously. The bus must guarantee at-least-once delivery, support topic-based routing, and provide dead-letter handling for failed event processing. All events must follow a standardized envelope schema.

### Actors

- **System** -- publishes and consumes events automatically.
- **DevOps** -- monitors queues, manages dead-letter policies, scales consumers.

### Preconditions

1. RabbitMQ (or equivalent AMQP broker) is running and reachable.
2. The Core Platform has established a connection to the broker on startup.

### Flow

**Main Flow:**

1. A module calls `eventBus.publish(eventType, payload)`.
2. The event bus wraps the payload in a standard envelope: `{ id, type, timestamp, source, correlationId, payload, version }`.
3. The bus publishes the envelope to the appropriate exchange/topic on RabbitMQ.
4. RabbitMQ routes the message to all bound subscriber queues.
5. Each subscriber's consumer receives the message, deserializes it, and invokes the registered handler.
6. On successful processing, the consumer acknowledges the message.

**Alternate Flows:**

- **A1 -- Handler throws error:** The message is negatively acknowledged (nack) and requeued up to the configured retry limit (default: 3).
- **A2 -- Retry limit exceeded:** The message is routed to the dead-letter queue (DLQ) for manual inspection.
- **A3 -- Broker unavailable:** The publisher buffers events in memory (up to a configurable limit) and retries connection with exponential backoff.

### Postconditions

- The event has been delivered to all active subscribers or moved to the DLQ.
- An event log entry exists in the structured logs.

### Acceptance Criteria

- [ ] Events follow the envelope schema: `id` (UUID), `type` (string), `timestamp` (ISO 8601), `source` (module name), `correlationId` (UUID), `payload` (object), `version` (semver string).
- [ ] At-least-once delivery is guaranteed: no acknowledged messages are lost.
- [ ] Failed messages are retried up to 3 times before being moved to the DLQ.
- [ ] A dead-letter queue exists for every subscriber queue and is monitorable.
- [ ] Event publishing latency (publish call to broker acceptance) is < 10 ms p95.
- [ ] The system reconnects to the broker automatically after transient failures within 30 seconds.
- [ ] Modules can subscribe to events using a decorator/annotation pattern (e.g., `@OnEvent('customer.created')`).

---

## CORE-003: Centralized Logging & Monitoring

| Field | Value |
|-------|-------|
| **ID** | CORE-003 |
| **Title** | Centralized Logging & Monitoring |
| **Priority** | H |
| **Complexity** | Medium |
| **Dependencies** | CORE-001 |
| **Tags** | `infrastructure`, `logging`, `monitoring`, `observability`, `metrics` |

### Description

The system shall produce structured JSON log entries for all significant operations (requests, events, errors, job executions) and expose Prometheus-compatible metrics. Logs must be shipped to a centralized log aggregator (ELK stack or compatible). PII must never appear in plaintext within logs.

### Actors

- **System** -- generates logs and metrics automatically.
- **DevOps** -- queries logs, configures alerting rules, reviews dashboards.
- **Admin** -- views operational dashboards.

### Preconditions

1. The application is running.
2. A log aggregator endpoint is configured (or logs are written to stdout for container orchestration pickup).

### Flow

**Main Flow:**

1. A module or the gateway performs an operation.
2. The logging middleware captures the operation context (request ID, user ID hash, module, action, duration).
3. The logger formats the entry as structured JSON with fields: `timestamp`, `level`, `message`, `requestId`, `module`, `action`, `duration`, `meta`.
4. The entry is written to stdout (for container log drivers) and/or shipped to the aggregator.
5. Prometheus metrics counters/histograms are incremented (e.g., `http_requests_total`, `http_request_duration_seconds`).

**Alternate Flows:**

- **A1 -- Log aggregator unreachable:** Logs continue to stdout; an alert metric is incremented.
- **A2 -- High log volume:** Log sampling is applied at DEBUG level; WARN/ERROR are never sampled.

### Postconditions

- A structured log entry exists for the operation.
- Relevant Prometheus metrics have been updated.

### Acceptance Criteria

- [ ] All log entries are valid JSON with at minimum: `timestamp`, `level`, `message`, `requestId`.
- [ ] Log levels supported: `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`.
- [ ] PII fields (email, phone, name) are masked or hashed in log output.
- [ ] Prometheus metrics endpoint is available at `/metrics`.
- [ ] Key metrics exposed: `http_requests_total` (by method, path, status), `http_request_duration_seconds` (histogram), `event_bus_messages_published_total`, `event_bus_messages_consumed_total`, `background_jobs_total` (by status).
- [ ] Log correlation via `requestId` is maintained across synchronous call chains.
- [ ] Grafana dashboard templates are provided for key operational metrics.

---

## CORE-004: Configuration Management

| Field | Value |
|-------|-------|
| **ID** | CORE-004 |
| **Title** | Configuration Management |
| **Priority** | M |
| **Complexity** | Low |
| **Dependencies** | None |
| **Tags** | `infrastructure`, `configuration`, `environment`, `secrets` |

### Description

The system shall support hierarchical configuration loading from multiple sources (environment variables, `.env` files, configuration files) with environment-specific overrides. Secrets must be managed separately from application configuration and never committed to version control.

### Actors

- **DevOps** -- sets environment variables and manages secrets.
- **System** -- reads configuration on startup and on-demand.

### Preconditions

1. At least one configuration source (env vars or config file) is available.

### Flow

**Main Flow:**

1. On startup, the configuration service loads values in order of precedence: environment variables > `.env` file > `config/{environment}.json` > `config/default.json`.
2. The service validates all required keys against a schema.
3. If validation passes, the configuration is frozen (immutable) and made available via `configService.get('key')`.
4. Modules access configuration through dependency injection of the config service.

**Alternate Flows:**

- **A1 -- Missing required key:** The application fails to start with a clear error message listing all missing keys.
- **A2 -- Invalid value type:** The application fails to start with a validation error.

### Postconditions

- A validated, immutable configuration object is available to all modules.
- No secrets are logged or exposed through API responses.

### Acceptance Criteria

- [ ] Configuration supports at least 3 environments: `development`, `staging`, `production`.
- [ ] Environment variables override file-based configuration.
- [ ] Missing required configuration keys cause startup failure with a descriptive error.
- [ ] Secrets (DB passwords, API keys, JWT secret) are loadable from environment variables and never appear in config files committed to VCS.
- [ ] Configuration values are accessible via a typed API (e.g., `configService.get<number>('port')`).
- [ ] A `.env.example` file documents all required and optional configuration keys.

---

## CORE-005: Database Migration Framework

| Field | Value |
|-------|-------|
| **ID** | CORE-005 |
| **Title** | Database Migration Framework |
| **Priority** | H |
| **Complexity** | Medium |
| **Dependencies** | CORE-004, PostgreSQL |
| **Tags** | `infrastructure`, `database`, `migrations`, `schema` |

### Description

The system shall provide a database migration framework that manages schema changes through versioned, reversible migration files. Migrations must run automatically on deployment and support both forward (up) and backward (down) operations. The framework must prevent concurrent migration execution.

### Actors

- **DevOps** -- triggers migrations during deployment.
- **System** -- executes migrations automatically on startup (if configured).
- **Admin** -- monitors migration status.

### Preconditions

1. PostgreSQL is running and accessible.
2. Database credentials are available via configuration (CORE-004).

### Flow

**Main Flow:**

1. On application startup (or via CLI command), the migration runner acquires a distributed lock.
2. The runner queries the `_migrations` table to determine the current schema version.
3. The runner identifies pending migrations (files with version > current).
4. For each pending migration, the runner executes the `up` function within a database transaction.
5. On success, the runner records the migration version, name, and execution timestamp in `_migrations`.
6. The runner releases the distributed lock.

**Alternate Flows:**

- **A1 -- Migration fails:** The transaction is rolled back, the lock is released, and the application logs the error and exits with a non-zero code.
- **A2 -- Lock already held:** The runner waits up to a configurable timeout (default: 60s), then fails if the lock is not released.
- **A3 -- Rollback requested:** The runner executes the `down` function of the specified migration(s) in reverse order.

### Postconditions

- The database schema matches the latest migration version.
- The `_migrations` table reflects the current state.

### Acceptance Criteria

- [ ] Migrations are stored as numbered files (e.g., `001_create_users.ts`) in a `migrations/` directory.
- [ ] Each migration file exports `up` and `down` functions.
- [ ] Migrations execute within a transaction; partial migrations are impossible.
- [ ] Concurrent migration attempts are blocked by a distributed lock (advisory lock or row lock).
- [ ] A CLI command exists to: create a new migration, run pending migrations, rollback the last N migrations, and show migration status.
- [ ] The migration table stores: version number, file name, executed_at timestamp, execution duration, and checksum.
- [ ] Migrations can be run automatically on application startup via a configuration flag (`AUTO_MIGRATE=true`).

---

## CORE-006: File Storage Service

| Field | Value |
|-------|-------|
| **ID** | CORE-006 |
| **Title** | File Storage Service |
| **Priority** | H |
| **Complexity** | Medium |
| **Dependencies** | CORE-001, CORE-004 |
| **Tags** | `infrastructure`, `storage`, `files`, `s3`, `upload` |

### Description

The system shall provide a file storage abstraction layer that supports uploading, downloading, listing, and deleting files via an S3-compatible interface. The service must support multiple storage backends (local filesystem for development, MinIO for self-hosted, AWS S3 for cloud) and enforce file size and type restrictions.

### Actors

- **System** -- stores and retrieves files on behalf of modules.
- **Admin** -- configures storage backends and policies.
- **DevOps** -- manages storage infrastructure.

### Preconditions

1. A storage backend is configured and accessible.
2. The bucket/container specified in configuration exists or auto-creation is enabled.

### Flow

**Main Flow:**

1. A module calls `fileStorage.upload(bucket, key, stream, metadata)`.
2. The service validates the file size against the configured maximum (default: 50 MB).
3. The service validates the file MIME type against the allowed-types list.
4. The service uploads the file to the configured backend.
5. The service returns a file reference object: `{ bucket, key, size, mimeType, url, createdAt }`.

**Alternate Flows:**

- **A1 -- File too large:** Returns an error with the maximum allowed size.
- **A2 -- Disallowed MIME type:** Returns an error listing allowed types.
- **A3 -- Backend unavailable:** Returns an error and logs the failure with retry metadata.
- **A4 -- Download request:** The service generates a pre-signed URL (time-limited, default 15 min) or streams the file directly.

### Postconditions

- The file is persisted in the storage backend.
- Metadata is recorded in the database for querying.

### Acceptance Criteria

- [ ] Files can be uploaded, downloaded, listed (by prefix), and deleted.
- [ ] Pre-signed URLs are supported with configurable expiration (default: 15 minutes).
- [ ] File size limit is configurable per bucket (default: 50 MB).
- [ ] Allowed MIME types are configurable per bucket.
- [ ] The service works with local filesystem, MinIO, and AWS S3 without code changes (configuration-only switch).
- [ ] File metadata (key, size, MIME type, uploader, timestamps) is stored in PostgreSQL.
- [ ] Virus scanning hook point is available (integration with ClamAV or similar).
- [ ] Uploaded files are organized by tenant/module/entity path (e.g., `tenant-1/crm/customers/123/photo.jpg`).

---

## CORE-007: Background Job Processing

| Field | Value |
|-------|-------|
| **ID** | CORE-007 |
| **Title** | Background Job Processing |
| **Priority** | M |
| **Complexity** | Medium |
| **Dependencies** | CORE-004, CORE-008 (Redis) |
| **Tags** | `infrastructure`, `jobs`, `async`, `queue`, `scheduler` |

### Description

The system shall provide a background job processing framework that supports both immediate (queued) and scheduled (cron-like) job execution. Jobs must be retryable, monitorable, and capable of running across multiple worker instances for horizontal scaling.

### Actors

- **System** -- enqueues and processes jobs.
- **DevOps** -- monitors job queues, manages worker scaling.
- **Admin** -- views job status and history.

### Preconditions

1. Redis is running and accessible (used as job queue backend).
2. At least one worker process is running.

### Flow

**Main Flow:**

1. A module enqueues a job: `jobService.enqueue('sendEmail', payload, options)`.
2. The job is serialized and placed on the appropriate Redis queue.
3. A worker picks up the job, deserializes it, and invokes the registered handler.
4. On success, the job is marked as completed and its result is stored (configurable retention).
5. Job metrics (enqueued, processing, completed, failed) are updated.

**Alternate Flows:**

- **A1 -- Handler failure:** The job is retried with exponential backoff (default: 3 retries, 30s/60s/120s delays).
- **A2 -- All retries exhausted:** The job is moved to the failed-jobs set with the error details.
- **A3 -- Scheduled job:** The scheduler checks cron expressions every 60 seconds and enqueues matching jobs.

### Postconditions

- The job has been processed (or moved to failed state after retries).
- Job execution metrics are available.

### Acceptance Criteria

- [ ] Jobs can be enqueued for immediate processing or scheduled via cron expressions.
- [ ] Failed jobs are retried up to a configurable limit with exponential backoff.
- [ ] Job status is queryable: `pending`, `active`, `completed`, `failed`, `delayed`.
- [ ] A dashboard or API endpoint lists all queues, their sizes, and recent job history.
- [ ] Scheduled jobs support cron syntax (e.g., `0 2 * * *` for daily at 02:00).
- [ ] Jobs can be prioritized (high, normal, low).
- [ ] Worker concurrency is configurable per queue.
- [ ] Long-running jobs report progress (percentage) that is queryable.

---

## CORE-008: Caching Layer

| Field | Value |
|-------|-------|
| **ID** | CORE-008 |
| **Title** | Caching Layer |
| **Priority** | M |
| **Complexity** | Low |
| **Dependencies** | CORE-004, Redis |
| **Tags** | `infrastructure`, `cache`, `redis`, `performance` |

### Description

The system shall provide a caching abstraction backed by Redis for storing frequently accessed data with configurable TTL. The cache must support key-based invalidation, pattern-based invalidation, and namespace isolation between modules.

### Actors

- **System** -- reads from and writes to cache automatically.
- **DevOps** -- monitors cache utilization and hit rates.

### Preconditions

1. Redis is running and accessible.

### Flow

**Main Flow:**

1. A module calls `cache.get(namespace, key)`.
2. If a cached value exists and has not expired, it is returned (cache hit).
3. If no value exists (cache miss), the module fetches from the primary data source, then calls `cache.set(namespace, key, value, ttl)`.
4. Subsequent reads for the same key return the cached value until TTL expiry.

**Alternate Flows:**

- **A1 -- Explicit invalidation:** A module calls `cache.invalidate(namespace, key)` or `cache.invalidatePattern(namespace, 'prefix:*')`.
- **A2 -- Redis unavailable:** The cache degrades gracefully; all requests fall through to the primary data source. A warning is logged.

### Postconditions

- The requested value is returned from cache or primary source.
- Cache metrics (hits, misses, evictions) are updated.

### Acceptance Criteria

- [ ] Cache supports `get`, `set`, `delete`, `invalidate`, and `invalidatePattern` operations.
- [ ] Each module uses a namespace prefix to avoid key collisions.
- [ ] TTL is configurable per entry (default: 300 seconds).
- [ ] Cache gracefully degrades when Redis is unavailable (no application errors).
- [ ] Cache hit/miss metrics are exposed via Prometheus.
- [ ] Pattern-based invalidation supports glob patterns (e.g., `crm:customer:*`).

---

## CORE-009: Health Check & Readiness Probes

| Field | Value |
|-------|-------|
| **ID** | CORE-009 |
| **Title** | Health Check & Readiness Probes |
| **Priority** | M |
| **Complexity** | Low |
| **Dependencies** | CORE-001, CORE-004 |
| **Tags** | `infrastructure`, `health`, `monitoring`, `kubernetes`, `devops` |

### Description

The system shall expose health check and readiness probe endpoints that report the operational status of the application and its dependencies (database, Redis, RabbitMQ, file storage). These endpoints are consumed by load balancers, container orchestrators (Kubernetes), and monitoring systems.

### Actors

- **System** -- responds to health check requests.
- **DevOps** -- configures orchestrator probes against these endpoints.

### Preconditions

1. The application server is running.

### Flow

**Main Flow:**

1. An orchestrator or monitoring system sends a GET request to `/health/live` or `/health/ready`.
2. For liveness (`/health/live`): The system confirms the process is alive and returns HTTP 200.
3. For readiness (`/health/ready`): The system checks all dependencies (DB connection, Redis ping, RabbitMQ connection, file storage accessibility).
4. If all checks pass, the system returns HTTP 200 with a JSON body listing each dependency status.
5. If any check fails, the system returns HTTP 503 with details of the failing dependency.

**Alternate Flows:**

- **A1 -- Dependency timeout:** If a dependency check does not respond within 5 seconds, it is marked as `unhealthy`.
- **A2 -- Partial degradation:** The response includes per-dependency status so operators can identify the specific failure.

### Postconditions

- The caller knows whether the application is alive and ready to serve traffic.

### Acceptance Criteria

- [ ] `/health/live` returns HTTP 200 if the process is running.
- [ ] `/health/ready` returns HTTP 200 only when all dependencies are healthy.
- [ ] `/health/ready` returns HTTP 503 when any dependency is unhealthy, with a JSON body listing each dependency and its status.
- [ ] Dependency checks have a configurable timeout (default: 5 seconds).
- [ ] Health endpoints do not require authentication.
- [ ] Response body format: `{ "status": "ok|degraded|unhealthy", "checks": { "database": "ok", "redis": "ok", "rabbitmq": "ok", "fileStorage": "ok" }, "uptime": 12345, "version": "1.2.3" }`.

---

## CORE-010: Error Handling & Reporting

| Field | Value |
|-------|-------|
| **ID** | CORE-010 |
| **Title** | Error Handling & Reporting |
| **Priority** | H |
| **Complexity** | Medium |
| **Dependencies** | CORE-001, CORE-003 |
| **Tags** | `infrastructure`, `errors`, `exception`, `reporting`, `sentry` |

### Description

The system shall implement a centralized error handling strategy that catches all unhandled exceptions, formats them consistently for API responses, logs full diagnostic information internally, and optionally reports to an external error tracking service (e.g., Sentry). Client-facing error responses must never expose internal details such as stack traces or database queries.

### Actors

- **System** -- catches and processes errors automatically.
- **DevOps** -- reviews error reports and configures alerting thresholds.

### Preconditions

1. The API gateway is running (CORE-001).
2. Logging is operational (CORE-003).

### Flow

**Main Flow:**

1. An unhandled exception occurs in a module handler.
2. The global exception filter catches the error.
3. The filter classifies the error (validation, not-found, authorization, business-rule, internal).
4. The filter maps the classification to an HTTP status code and a user-safe error message.
5. The filter logs the full error (stack trace, request context, user ID hash) at ERROR level.
6. If an external error tracker is configured, the error is reported with context.
7. The filter returns a standardized JSON error response to the client.

**Alternate Flows:**

- **A1 -- Known business error:** The module throws a typed exception (e.g., `NotFoundException`); the filter maps it directly without logging at ERROR level (logs at WARN).
- **A2 -- Unhandled promise rejection / async error:** The process-level handler catches it, logs it, and (in non-production) terminates gracefully.

### Postconditions

- The client receives a consistent, safe error response.
- The error is logged with full diagnostic context.
- If configured, the error is reported to the external tracking service.

### Acceptance Criteria

- [ ] All API error responses follow a standard format: `{ "statusCode": 400, "error": "Bad Request", "message": "Human-readable message", "requestId": "uuid", "timestamp": "ISO8601" }`.
- [ ] Stack traces are never included in API responses (any environment).
- [ ] Internal server errors (5xx) are logged at ERROR level with full stack trace, request body, and headers (with sensitive headers redacted).
- [ ] Known error types (validation, not-found, forbidden, conflict) are logged at WARN level.
- [ ] Integration with Sentry (or equivalent) is configurable via environment variable (`SENTRY_DSN`).
- [ ] Error rate metrics are exposed via Prometheus (`http_errors_total` by status code class).
- [ ] Unhandled promise rejections and uncaught exceptions are caught at process level and logged.
