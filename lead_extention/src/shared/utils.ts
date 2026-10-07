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
  const match = collapsed.match(/\+?\d[\d\s().\-/]{4,}\d/);
  const candidate = (match ? match[0] : collapsed).replace(/\s+/g, ' ').trim();
  return candidate ? candidate.slice(0, maxLength).trim() || null : null;
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
