import client from 'prom-client';

/**
 * Prometheus metrics registry.
 *
 * Exposes:
 * - Default Node.js metrics (memory, CPU, event loop lag)
 * - Custom HTTP request metrics
 * - Cache hit/miss counters
 * - Event bus counters
 * - Queue job counters
 */

// Collect default metrics (GC, memory, CPU)
client.collectDefaultMetrics({ prefix: 'updata_' });

// --- HTTP Metrics ---
export const httpRequestsTotal = new client.Counter({
  name: 'updata_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'path', 'status'],
});

export const httpRequestDuration = new client.Histogram({
  name: 'updata_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'path'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

// --- Cache Metrics ---
export const cacheHitsTotal = new client.Counter({
  name: 'updata_cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['layer', 'namespace'],
});

export const cacheMissesTotal = new client.Counter({
  name: 'updata_cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['layer', 'namespace'],
});

// --- Event Bus Metrics ---
export const eventBusPublishedTotal = new client.Counter({
  name: 'updata_event_bus_published_total',
  help: 'Total events published',
  labelNames: ['type'],
});

export const eventBusConsumedTotal = new client.Counter({
  name: 'updata_event_bus_consumed_total',
  help: 'Total events consumed',
  labelNames: ['type', 'status'],
});

// --- Queue Metrics ---
export const queueJobsTotal = new client.Counter({
  name: 'updata_queue_jobs_total',
  help: 'Total background jobs',
  labelNames: ['queue', 'status'],
});

// --- Middleware for recording request metrics ---
export function metricsMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationNs = Number(process.hrtime.bigint() - start);
    const durationSec = durationNs / 1e9;

    // Normalize path to avoid high cardinality (replace IDs with :id)
    const normalizedPath = req.route?.path || req.path.replace(/[0-9a-f]{24}/gi, ':id');

    httpRequestsTotal.inc({
      method: req.method,
      path: normalizedPath,
      status: res.statusCode,
    });

    httpRequestDuration.observe(
      { method: req.method, path: normalizedPath },
      durationSec,
    );
  });

  next();
}

// --- Metrics endpoint handler ---
export async function metricsEndpoint(_req, res) {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
}

export default {
  metricsMiddleware,
  metricsEndpoint,
  httpRequestsTotal,
  httpRequestDuration,
  cacheHitsTotal,
  cacheMissesTotal,
  eventBusPublishedTotal,
  eventBusConsumedTotal,
  queueJobsTotal,
};
