export function normalizeText(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizePhone(value: string | null | undefined): string {
  return (value ?? '').replace(/[^\d+]/g, '').replace(/^00/, '+');
}

/**
 * Produce a display-ready phone string that is safe to store and import.
 * Maps occasionally concatenates a number with trailing text (opening hours,
 * "Call", a second number), which can exceed the CRM's 50-character phone
 * limit and reject an entire import batch. Keep the first phone-like run and
 * hard-cap the length so one noisy cell can never fail the batch.
 */
export function cleanPhone(value: string | null | undefined, maxLength = 50): string | null {
  if (!value) return null;
  const collapsed = value.replace(/\s+/g, ' ').trim();
  if (!collapsed) return null;
  const digits = (collapsed.match(/\d/g) || []).length;
  const letters = (collapsed.match(/\p{L}/gu) || []).length;
  const match = collapsed.match(/\+?\d[\d\s().\-/]{4,}\d/);
  if (match) {
    const candidate = match[0].replace(/\s+/g, ' ').trim();
    return candidate ? candidate.slice(0, maxLength).trim() || null : null;
  }
  // No dialling-pattern match: accept only if the value is clearly numeric
  // (short codes), otherwise reject. This stops Maps text such as
  // "Café X · Visited link" from being stored as a phone number.
  if (digits >= 5 && letters <= 1) return collapsed.slice(0, maxLength).trim() || null;
  return null;
}

export function normalizeUrl(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const url = new URL(value, 'https://www.google.com');
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString().toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/\/+$/, '');
  }
}

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/\s*\[at\]\s*|\s*\(at\)\s*/g, '@')
    .replace(/\s*\[dot\]\s*|\s*\(dot\)\s*/g, '.');
  return isValidEmail(normalized) ? normalized : null;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value);
}

export function haversineDistanceMeters(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number }
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const dLat = radians(destination.latitude - origin.latitude);
  const dLon = radians(destination.longitude - origin.longitude);
  const lat1 = radians(origin.latitude);
  const lat2 = radians(destination.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function slugify(value: string): string {
  return normalizeText(value).replace(/\s+/g, '-').slice(0, 60) || 'leads';
}

export function formatDistance(km: number | null): string {
  return km === null ? '—' : km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function parseCoordinates(urlOrText: string): { latitude: number; longitude: number } | null {
  const match = urlOrText.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null;
}

export function nowIso(): string {
  return new Date().toISOString();
}

// ── Adaptive request pacing ──────────────────────────────────────────────────
// Pure helpers (no DOM / chrome deps) so the pacing logic is unit-testable.

/** Clamp a user-supplied scraping delay to the allowed 5s–5m range. */
export function clampRequestDelay(
  ms: number | null | undefined,
  min = 5_000,
  max = 300_000,
  fallback = 10_000,
): number {
  if (ms === null || ms === undefined) return fallback;
  const value = Number(ms);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/**
 * Grow the backoff multiplier when Google throttles/terminates a feed, or decay
 * it by one step on a clean request. Bounded to [1, maxBackoff] so a sweep never
 * stalls indefinitely but still keeps making progress under sustained throttling.
 */
export function nextThrottleBackoff(current: number, throttled: boolean, maxBackoff = 6): number {
  const base = Number.isFinite(current) && current >= 1 ? current : 1;
  if (throttled) return Math.min(maxBackoff, base * 2);
  return Math.max(1, base - 1);
}

/** Effective pause = clamped base delay × backoff, never beyond the max. */
export function effectiveRequestDelay(
  baseMs: number,
  backoff: number,
  max = 300_000,
): number {
  const safeBackoff = Number.isFinite(backoff) && backoff >= 1 ? backoff : 1;
  return Math.min(max, Math.max(0, Math.round(baseMs)) * safeBackoff);
}
