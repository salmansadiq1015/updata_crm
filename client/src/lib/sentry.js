/**
 * Client-side Sentry initialization.
 *
 * Optional Sentry hook. The package is not installed in this project, so this
 * module stays a no-op unless a real loader is wired after adding @sentry/nextjs.
 * Keeping the bare package import out of the bundle prevents build warnings.
 */

let sentryInstance = null;

async function loadSentryClient() {
  return null;
}

export async function initSentry() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || sentryInstance) return;

  try {
    const Sentry = await loadSentryClient();
    if (!Sentry) return;
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
    // Optional error tracking failed to initialize; continue without it.
  }
}

export function getSentry() {
  return sentryInstance;
}
