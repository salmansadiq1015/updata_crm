/**
 * Shared constants + pure helpers for the secure CRM connect handoff.
 *
 * Kept free of `chrome` / DOM access so the trust gate can be unit-tested and
 * reused by both the service worker (external message listener) and crm-api.
 */

// The only web origin allowed to drive the extension through
// externally_connectable. Keep in lockstep with manifest.json
// `externally_connectable.matches` and the server CORS allowlist.
export const CRM_WEB_ORIGIN = 'https://updata.behjja.com';

/** True only for the exact CRM web origin. Anything else is rejected. */
export function isTrustedCrmOrigin(origin: string | null | undefined): boolean {
  return typeof origin === 'string' && origin === CRM_WEB_ORIGIN;
}

/** Derive the versioned API base from a web origin (no trailing slash). */
export function crmApiBaseForOrigin(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/api/v1`;
}
