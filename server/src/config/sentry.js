/**
 * Sentry error-tracking initialization for the server.
 *
 * Must be imported BEFORE any other application code so that Sentry can
 * instrument Node.js modules (http, express, etc.) via its ESM hooks.
 *
 * Safe no-op when SENTRY_DSN is not configured or @sentry/node is not installed.
 */

import config from './index.js';

let Sentry = null;

if (config.logging?.sentryDsn) {
  try {
    Sentry = await import('@sentry/node');
    Sentry.init({
      dsn: config.logging.sentryDsn,
      environment: config.env,
      tracesSampleRate: config.isProduction ? 0.1 : 1.0,
      // Attach server name for multi-instance debugging
      serverName: `updata-api-${config.env}`,
    });
  } catch {
    // @sentry/node not installed — continue without error tracking
    Sentry = null;
  }
}

export default Sentry;
