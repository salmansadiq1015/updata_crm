/**
 * Shared constants + pure helpers for the secure CRM connect handoff.
 *
 * Kept free of `chrome` / DOM access so the trust gate can be unit-tested and
 * reused by both the service worker (external message listener) and crm-api.
 */

// The production CRM web origin — the default the extension connects back to.
export const CRM_WEB_ORIGIN = 'https://updata.behjja.com';

// Every web origin allowed to drive the extension through externally_connectable.
// Keep in lockstep with manifest.json `externally_connectable.matches` and the
// server CORS allowlist. localhost entries let the card work while running the
// CRM web app locally in development.
export const ALLOWED_CRM_ORIGINS: readonly string[] = [
  CRM_WEB_ORIGIN,
  'http://localhost:3000',
  'http://localhost:9097',
];

/** True only for an allow-listed CRM web origin. Anything else is rejected. */
export function isTrustedCrmOrigin(origin: string | null | undefined): boolean {
  return typeof origin === 'string' && ALLOWED_CRM_ORIGINS.includes(origin);
}

/** Derive the versioned API base from a web origin (no trailing slash). */
export function crmApiBaseForOrigin(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/api/v1`;
}
