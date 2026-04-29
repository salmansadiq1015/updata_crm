/**
 * Client-side Sentry initialization.
 *
 * Dynamically imports @sentry/nextjs so the app works fine when the
 * package is not installed. Guarded by NEXT_PUBLIC_SENTRY_DSN — when
 * the env var is empty or missing, this module is a no-op.
 */

let sentryInstance = null;

export async function initSentry() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || sentryInstance) return;

  try {
    const Sentry = await import('@sentry/nextjs');
    Sentry.init({
      dsn,
      environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || 'development',
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      // Replay is opt-in — uncomment if needed:
      // replaysSessionSampleRate: 0.1,
      // replaysOnErrorSampleRate: 1.0,
    });
    sentryInstance = Sentry;
  } catch {
    // @sentry/nextjs not installed — continue without error tracking
  }
}

export function getSentry() {
  return sentryInstance;
}
