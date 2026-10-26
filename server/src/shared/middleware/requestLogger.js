import logger from '../logger/index.js';

/**
 * Structured HTTP request logger.
 * Replaces Morgan — logs as JSON with requestId correlation.
 *
 * Logs on response finish (not on request start) to capture duration and status.
 * Skips health check endpoints to avoid log noise from LB probes.
 */
const SKIP_PATHS = ['/health/live', '/health/ready', '/metrics'];

/** SMS link tokens are bearer secrets: never write them to logs. */
export function redactPath(url) {
  return String(url || '').replace(/^\/c\/[^/?#]+/, '/c/[link]');
}

export function requestLogger(req, res, next) {
  if (SKIP_PATHS.includes(req.path)) {
    return next();
  }

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logData = {
      module: 'gateway',
      action: 'http.request',
      requestId: req.requestId,
      method: req.method,
      path: redactPath(req.originalUrl),
      statusCode: res.statusCode,
      duration,
      contentLength: res.getHeader('content-length'),
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    };

    if (req.user?._id) {
      logData.userId = String(req.user._id); // PII masking handled by logger
    }

    if (res.statusCode >= 500) {
      logger.error('HTTP request failed', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('HTTP request client error', logData);
    } else {
      logger.info('HTTP request completed', logData);
    }
  });

  next();
}

export default requestLogger;
