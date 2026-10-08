import type { Lead, LeadAddress } from '../types/lead-types';

/** Minimal shape of an entry in the workspace user directory. */
export type LeadUser = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

// ── People ───────────────────────────────────────────────────────────────────

export function getUserDisplayName(user: LeadUser | null | undefined): string {
  if (!user) return '';
  const full = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  return full || user.email || '';
}

export function getUserInitials(user: LeadUser | null | undefined): string {
  if (!user) return '';
  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();
  return initials || (user.email?.[0] ?? '').toUpperCase();
}

export function findUser(users: readonly LeadUser[], id: string | null | undefined): LeadUser | undefined {
  if (!id) return undefined;
  return users.find((user) => user.id === id);
}

/**
 * Display name of whoever created a lead. The API sends the creator populated;
 * a bare id (a response that was not populated, e.g. straight after a save) is
 * looked up in the user directory instead. '' when the creator is unknown, so
 * each caller picks its own fallback.
 */
export function getLeadCreatorName(createdBy: Lead['createdBy'], users: readonly LeadUser[] = []): string {
  if (!createdBy) return '';
  if (typeof createdBy === 'string') return getUserDisplayName(findUser(users, createdBy));
  return getUserDisplayName(createdBy) || getUserDisplayName(findUser(users, createdBy.id));
}

// ── Formatting ───────────────────────────────────────────────────────────────

/** Maps the app locale onto an Intl locale with Swiss-flavoured defaults. */
export function toIntlLocale(locale: string | undefined): string {
  switch (locale) {
    case 'de':
      return 'de-CH';
    case 'fr':
      return 'fr-CH';
    case 'en':
      return 'en-GB';
    default:
      return locale || 'de-CH';
  }
}

export function formatLeadDate(value: string | null | undefined, locale: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatLeadDateTime(value: string | null | undefined, locale: string | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/** Address as display lines, skipping every part that is not set. */
export function getAddressLines(address: LeadAddress): string[] {
  const lines = [
    [address.street, address.addressSupplement].filter(Boolean).join(', '),
    [address.postalCode, address.city].filter(Boolean).join(' '),
    // Only name the country when it adds information beyond the home market.
    [address.canton, address.country && address.country !== 'CH' ? address.country : null]
      .filter(Boolean)
      .join(', '),
  ];
  return lines.filter((line) => line.length > 0);
}

export function formatAddressOneLine(address: LeadAddress): string {
  return getAddressLines(address).join(', ');
}

// ── Links (only ever built from data the lead actually has) ──────────────────

/** `tel:` href, or null when the value has too few digits to be dialled. */
export function toTelHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const compact = phone.replace(/[^\d+]/g, '');
  const digits = compact.replace(/\D/g, '');
  if (digits.length < 3) return null;
  return `tel:${compact}`;
}

export function toMailtoHref(email: string | null | undefined): string | null {
  const value = email?.trim();
  if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return `mailto:${value}`;
}

/**
 * WhatsApp Web link: `https://web.whatsapp.com/send?phone=<digits>&text=<msg>`,
 * or null when the number has too few digits to be a real international number.
 * Opening it launches a WhatsApp Web chat in the browser (the user sends the
 * message from WhatsApp — we never send on their behalf). The stored value is
 * assumed to be E.164-ish (prefer `lead.normalizedPhone`): we only strip the
 * cosmetics (`+`, spaces, dashes, parentheses) and a leading `00` international
 * prefix — we never invent a country code. An optional message is `&text=`.
 */
export function toWhatsAppHref(phone: string | null | undefined, text?: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  // A usable international number is at least ~7 digits; anything shorter is noise.
  if (digits.length < 7) return null;
  const base = `https://web.whatsapp.com/send?phone=${digits}`;
  const message = text?.trim();
  return message ? `${base}&text=${encodeURIComponent(message)}` : base;
}

/**
 * Client-side `{{var}}` substitution for the WhatsApp deep-link text. This only
 * fills the message the person is about to send by hand; it mirrors the server's
 * template variables loosely (businessName, contactName, city, …). Known tokens
 * are substituted (an empty value drops the token); unknown tokens are left as
 * typed so nothing silently disappears.
 */
export function resolveLeadVars(text: string, lead: Lead): string {
  if (!text) return text;
  const vars: Record<string, string> = {
    businessName: lead.name ?? '',
    name: lead.name ?? '',
    // Leads have no separate contact person; the business name is the best we have.
    contactName: lead.name ?? '',
    city: lead.address?.city ?? '',
    phone: lead.phone ?? lead.mobile ?? '',
    email: lead.email ?? '',
    website: lead.websiteDomain ?? lead.website ?? '',
  };
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  );
}

/**
 * Only http(s) URLs are ever linked. A bare domain gets https://, and any other
 * scheme (javascript:, data:, ...) yields null so it can never become a href.
 */
export function toSafeWebUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getWebsiteLabel(lead: Pick<Lead, 'website' | 'websiteDomain'>): string {
  if (lead.websiteDomain) return lead.websiteDomain;
  const safe = toSafeWebUrl(lead.website);
  if (!safe) return lead.website ?? '';
  try {
    return new URL(safe).hostname.replace(/^www\./, '');
  } catch {
    return lead.website ?? '';
  }
}

/**
 * A genuine Google Place ID uses the base64url charset only. OSM/Nominatim ids
 * ("osm:node/123456", "nominatim:98765") contain ':' / '/', so they are rejected:
 * handing one to Google Maps as `query_place_id` makes Maps ignore the (correct)
 * coordinate and open an unrelated place. Rejected ids fall back to a coordinate
 * pin, which always points at the right spot.
 */
export function isGooglePlaceId(id: string | null | undefined): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{15,}$/.test(id);
}

/** Google Maps link for a lead that has coordinates; null otherwise. */
export function buildGoogleMapsUrl(lead: Pick<Lead, 'location' | 'sourceMetadata'>): string | null {
  const { location } = lead;
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return null;
  const params = new URLSearchParams({ api: '1', query: `${location.lat},${location.lng}` });
  // Only a genuine Google place id opens the business itself; anything else (e.g.
  // an OSM id) would send Maps to the wrong location, so fall back to the pin.
  if (isGooglePlaceId(lead.sourceMetadata.googlePlaceId)) {
    params.set('query_place_id', lead.sourceMetadata.googlePlaceId);
  }
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

/** Route of the customer a lead was converted into. */
export const customerHref = (customerId: string): string => `/crm/customers/${customerId}`;

// ── Clipboard ────────────────────────────────────────────────────────────────

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
