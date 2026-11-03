import type { RawBusinessRecord, SearchRecord } from './types';
import { normalizePhone, normalizeText, normalizeUrl } from './utils';

export const DISCOVERY_BATCH_SIZE = 25;
export const CRM_BATCH_SIZE = 25;
export const REQUIRED_STABLE_END_ROUNDS = 3;
export const CHECKPOINT_VERSION = 2;

/**
 * A deterministic key that survives Maps virtual-list reordering and SPA
 * navigation. DOM indexes are intentionally never part of this identity.
 */
export function resultKeyForRecord(record: RawBusinessRecord): string {
  if (record.placeIdentifier) return `place:${normalizeText(record.placeIdentifier)}`;
  const mapsUrl = normalizeMapsPlaceUrl(record.googleMapsUrl);
  if (mapsUrl) return `maps:${mapsUrl}`;
  const name = normalizeText(record.businessName);
  const phone = normalizePhone(record.phone);
  const address = normalizeText(record.address);
  if (name && (phone || address)) return `contact:${name}|${phone}|${address}`;
  const domain = websiteDomain(record.website);
  if (name && domain) return `domain:${name}|${domain}`;
  return `fallback:${name}|${record.latitude?.toFixed(5) ?? ''}|${record.longitude?.toFixed(5) ?? ''}`;
}

export function normalizeMapsPlaceUrl(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const url = new URL(value, 'https://www.google.com');
    const parameter = ['query_place_id', 'place_id', 'ftid', 'cid']
      .map((name) => url.searchParams.get(name))
      .find(Boolean);
    if (parameter) return `id:${normalizeText(parameter)}`;
    const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)/i);
    const placeToken = value.match(/!(?:1s|16s)([^!]+)/)?.[1];
    if (placeToken) {
      let decoded = placeToken;
      try { decoded = decodeURIComponent(placeToken); } catch { /* retain the stable raw token */ }
      return `id:${normalizeText(decoded)}`;
    }
    if (placeMatch) {
      const coordinates = value.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
      const geo = coordinates ? `|${Number(coordinates[1]).toFixed(5)},${Number(coordinates[2]).toFixed(5)}` : '';
      let decodedPlace = placeMatch[1].replace(/\+/g, ' ');
      try { decodedPlace = decodeURIComponent(decodedPlace); } catch { /* retain the URL-safe name */ }
      return `name:${normalizeText(decodedPlace)}${geo}`;
    }
    return normalizeUrl(value);
  } catch {
    return normalizeUrl(value);
  }
}

export function websiteDomain(value: string | null | undefined): string {
  if (!value) return '';
  try { return new URL(value.startsWith('http') ? value : `https://${value}`).hostname.replace(/^www\./i, '').toLowerCase(); }
  catch { return ''; }
}

export function splitIntoBatches<T>(items: readonly T[], size: number): T[][] {
  const safeSize = Math.max(1, Math.floor(size));
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += safeSize) batches.push(items.slice(index, index + safeSize));
  return batches;
}

export function resumeQueryIndex(search: SearchRecord, queryCount: number): number {
  return Math.min(Math.max(0, search.queryIndex ?? 0), Math.max(0, queryCount - 1));
}

export function normalizeLegacyCheckpoint(search: SearchRecord, timestamp = new Date().toISOString()): boolean {
  if (search.processedCount !== undefined) return false;
  const processed = new Set(search.processedResultKeys ?? []).size || search.uniqueCount || 0;
  search.processedCount = processed;
  search.discoveredCount = processed;
  search.currentResultIndex = processed;
  search.duplicateCount ??= 0;
  search.updatedAt = timestamp;
  return true;
}

export function upgradeCheckpoint(search: SearchRecord, canonicalLeadKeys: string[], timestamp = new Date().toISOString()): boolean {
  const normalized = normalizeLegacyCheckpoint(search, timestamp);
  if ((search.checkpointVersion ?? 0) >= CHECKPOINT_VERSION) return normalized;
  const canonical = [...new Set(canonicalLeadKeys.filter(Boolean))];
  if (canonical.length) {
    search.processedResultKeys = canonical;
    search.processedCount = canonical.length;
    search.discoveredCount = canonical.length;
    search.currentResultIndex = canonical.length;
    search.uniqueCount = canonical.length;
  }
  search.currentBatchSize = 0;
  search.stableRounds = 0;
  search.checkpointVersion = CHECKPOINT_VERSION;
  search.updatedAt = timestamp;
  return true;
}

export function shouldCompleteResultState(input: {
  newlyProcessed: number;
  scrollChanged: boolean;
  atEnd: boolean;
  endConfirmed: boolean;
  stableRounds: number;
}): boolean {
  return input.newlyProcessed === 0
    && !input.scrollChanged
    && input.endConfirmed
    && input.stableRounds >= REQUIRED_STABLE_END_ROUNDS;
}
