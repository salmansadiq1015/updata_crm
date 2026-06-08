/**
 * Resolve API base URL.
 * Production defaults to same-origin `/api/v1` to avoid mixed-content blocks
 * when embedded in HTTPS parent apps (e.g. appnity.ch iframe).
 */
export function resolveApiUrl() {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') return '/api/v1';
  return 'http://localhost:9097/api/v1';
}

/** Origin for health checks, sockets, etc. (no /api/v1 path). */
export function resolveApiOrigin() {
  const apiUrl = resolveApiUrl();
  if (apiUrl.startsWith('/')) {
    if (typeof window !== 'undefined') return window.location.origin;
    return '';
  }
  try {
    const url = new URL(apiUrl);
    return `${url.protocol}//${url.host}`;
  } catch {
    return 'http://localhost:9097';
  }
}

export const API_URL = resolveApiUrl();
