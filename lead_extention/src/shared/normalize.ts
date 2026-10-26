import type { Lead, RawBusinessRecord } from './types';
import { cleanPhone, haversineDistanceMeters, normalizePhone, normalizeText, normalizeUrl, nowIso, parseCoordinates } from './utils';
import { normalizeMapsPlaceUrl, websiteDomain } from './discovery-checkpoint';

export function makeLead(raw: RawBusinessRecord, searchId: string, searchLocation?: string | null, discoveryCategory?: string): Lead {
  const timestamp = nowIso();
  const coordinates = raw.latitude !== null && raw.latitude !== undefined && raw.longitude !== null && raw.longitude !== undefined
    ? { latitude: raw.latitude, longitude: raw.longitude }
    : parseCoordinates(raw.googleMapsUrl);
  const phone = cleanPhone(raw.phone);
  const website = raw.website?.trim() || null;

  return {
    id: crypto.randomUUID(),
    source: 'google-maps',
    sourceUrl: raw.googleMapsUrl,
    googleMapsUrl: raw.googleMapsUrl,
    placeIdentifier: raw.placeIdentifier || null,
    businessName: raw.businessName.trim(),
    category: raw.category?.trim() || null,
    categories: [...new Set((raw.categories ?? []).map((item) => item.trim()).filter(Boolean))],
    phone,
    internationalPhone: phone && phone.startsWith('+') ? phone : null,
    website,
    emails: [],
    address: raw.address?.trim() || null,
    street: raw.street?.trim() || null,
    area: raw.area?.trim() || null,
    city: raw.city?.trim() || null,
    state: raw.state?.trim() || null,
    postalCode: raw.postalCode?.trim() || null,
    country: raw.country?.trim() || null,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    distanceMeters: null,
    distanceKm: null,
    geographicValidation: 'unverified',
    rating: raw.rating ?? null,
    reviewCount: raw.reviewCount ?? null,
    ratingBreakdown: raw.ratingBreakdown ?? null,
    photos: [...new Set((raw.photos ?? []).map((url) => url.trim()).filter(Boolean))],
    businessStatus: raw.businessStatus?.trim() || null,
    openingHours: raw.openingHours ?? [],
    priceLevel: raw.priceLevel ?? null,
    emailSource: null,
    emailConfidence: null,
    enrichmentStatus: 'not-requested',
    discoveredAt: timestamp,
    updatedAt: timestamp,
    searchId,
    discoveryCategories: discoveryCategory?.trim() ? [discoveryCategory.trim()] : [],
    searchLocation: searchLocation?.trim() || null,
    crmStatus: 'not-imported',
    crmLeadId: null,
    crmLeadNumber: null,
    crmError: null
  };
}

export function dedupeKey(lead: Pick<Lead, 'placeIdentifier' | 'googleMapsUrl' | 'businessName' | 'address' | 'phone' | 'website' | 'latitude' | 'longitude'>): string {
  if (lead.placeIdentifier) return `place:${normalizeText(lead.placeIdentifier)}`;
  const url = normalizeMapsPlaceUrl(lead.googleMapsUrl) || normalizeUrl(lead.googleMapsUrl);
  if (url) return `url:${url}`;
  const phone = normalizePhone(lead.phone);
  const name = normalizeText(lead.businessName);
  const address = normalizeText(lead.address);
  if (name || address || phone) return `fields:${name}|${address}|${phone}`;
  const domain = websiteDomain(lead.website);
  if (domain) return `domain:${domain}`;
  return `geo:${name}|${lead.latitude?.toFixed(4) ?? ''}|${lead.longitude?.toFixed(4) ?? ''}`;
}

/** Conservative duplicate check with a geographic fallback for the same business name. */
export function isSameLead(a: Pick<Lead, 'placeIdentifier' | 'googleMapsUrl' | 'businessName' | 'address' | 'phone' | 'website' | 'latitude' | 'longitude'>, b: Pick<Lead, 'placeIdentifier' | 'googleMapsUrl' | 'businessName' | 'address' | 'phone' | 'website' | 'latitude' | 'longitude'>): boolean {
  if (a.placeIdentifier && b.placeIdentifier) return normalizeText(a.placeIdentifier) === normalizeText(b.placeIdentifier);
  const aUrl = normalizeMapsPlaceUrl(a.googleMapsUrl) || normalizeUrl(a.googleMapsUrl);
  const bUrl = normalizeMapsPlaceUrl(b.googleMapsUrl) || normalizeUrl(b.googleMapsUrl);
  if (aUrl && bUrl && aUrl === bUrl) return true;
  const aPhone = normalizePhone(a.phone);
  const bPhone = normalizePhone(b.phone);
  if (aPhone && bPhone && aPhone === bPhone) return true;
  const sameName = normalizeText(a.businessName) === normalizeText(b.businessName);
  const sameAddress = Boolean(normalizeText(a.address)) && normalizeText(a.address) === normalizeText(b.address);
  if (sameName && sameAddress) return true;
  const aDomain = websiteDomain(a.website);
  const bDomain = websiteDomain(b.website);
  if (aDomain && bDomain && aDomain === bDomain && sameName) {
    if (a.latitude !== null && a.longitude !== null && b.latitude !== null && b.longitude !== null) {
      return haversineDistanceMeters({ latitude: a.latitude, longitude: a.longitude }, { latitude: b.latitude, longitude: b.longitude }) <= 250;
    }
    // A chain may share one domain across branches. Do not merge when both
    // records expose different addresses and coordinates cannot disambiguate.
    if (a.address && b.address) return sameAddress;
    return true;
  }
  if (!sameName || a.latitude === null || a.longitude === null || b.latitude === null || b.longitude === null) return false;
  return haversineDistanceMeters({ latitude: a.latitude, longitude: a.longitude }, { latitude: b.latitude, longitude: b.longitude }) <= 150;
}

export function mergeLead(existing: Lead, incoming: Lead): Lead {
  const merged = { ...existing };
  for (const key of ['category', 'phone', 'internationalPhone', 'website', 'address', 'street', 'area', 'city', 'state', 'postalCode', 'country', 'businessStatus', 'priceLevel', 'searchLocation'] as const) {
    if (!merged[key] && incoming[key]) merged[key] = incoming[key];
  }
  if (merged.rating === null && incoming.rating !== null) merged.rating = incoming.rating;
  if (merged.reviewCount === null && incoming.reviewCount !== null) merged.reviewCount = incoming.reviewCount;
  if (!merged.ratingBreakdown && incoming.ratingBreakdown) merged.ratingBreakdown = incoming.ratingBreakdown;
  if (merged.latitude === null && incoming.latitude !== null) merged.latitude = incoming.latitude;
  if (merged.longitude === null && incoming.longitude !== null) merged.longitude = incoming.longitude;
  if ((merged.geographicValidation ?? 'unverified') === 'unverified' && incoming.geographicValidation !== 'unverified') {
    merged.geographicValidation = incoming.geographicValidation;
    merged.distanceMeters = incoming.distanceMeters;
    merged.distanceKm = incoming.distanceKm;
  }
  merged.categories = [...new Set([...merged.categories, ...incoming.categories])];
  merged.discoveryCategories = [...new Set([...(merged.discoveryCategories ?? []), ...(incoming.discoveryCategories ?? [])])];
  merged.openingHours = [...new Set([...merged.openingHours, ...incoming.openingHours])];
  merged.photos = [...new Set([...(merged.photos ?? []), ...(incoming.photos ?? [])])];
  merged.updatedAt = nowIso();
  return merged;
}
