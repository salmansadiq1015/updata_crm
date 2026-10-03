// Area-size estimation + formatting for the wizard UI. The store's `AreaDraft`
// does not carry `areaSqKm` (the backend computes the authoritative value), so
// the UI estimates it from the draft geometry to show an at-a-glance size and
// an honest "large area" coverage note before a search is run.

import type { AreaDraft } from '../state/lead-gen-store';

const M_PER_DEG_LAT = 111_320;

/** Rough area in km² for any draft shape; null when the draft has no geometry. */
export function areaDraftSqKm(area: AreaDraft | null | undefined): number | null {
  if (!area) return null;

  if (area.type === 'radius' && area.radiusMeters && area.radiusMeters > 0 && !area.geometry) {
    return Math.PI * (area.radiusMeters / 1000) ** 2;
  }

  const ring = area.geometry?.coordinates?.[0];
  if (ring && ring.length >= 4) {
    // Shoelace on the [lng,lat] ring, projected equirectangularly about its mean
    // latitude. Good enough for a city-scale "how big is this" readout.
    const meanLat = (ring.reduce((sum, point) => sum + (point[1] ?? 0), 0) / ring.length) * (Math.PI / 180);
    const mPerDegLng = M_PER_DEG_LAT * Math.cos(meanLat);
    let acc = 0;
    for (let i = 0; i < ring.length - 1; i += 1) {
      const [lng1, lat1] = ring[i];
      const [lng2, lat2] = ring[i + 1];
      acc += lng1 * mPerDegLng * (lat2 * M_PER_DEG_LAT) - lng2 * mPerDegLng * (lat1 * M_PER_DEG_LAT);
    }
    const sqm = Math.abs(acc) / 2;
    return sqm / 1_000_000;
  }

  if (area.type === 'radius' && area.radiusMeters && area.radiusMeters > 0) {
    return Math.PI * (area.radiusMeters / 1000) ** 2;
  }

  if (area.bounds) {
    const { north, south, east, west } = area.bounds;
    const meanLat = ((north + south) / 2) * (Math.PI / 180);
    const height = Math.abs(north - south) * M_PER_DEG_LAT;
    const width = Math.abs(east - west) * M_PER_DEG_LAT * Math.cos(meanLat);
    return (height * width) / 1_000_000;
  }

  return null;
}

/** Localised "12.5 km²" (or "850 m²" for tiny areas); null when unknown. */
export function formatAreaSize(area: AreaDraft | null | undefined, locale?: string): string | null {
  const sqKm = areaDraftSqKm(area);
  if (sqKm == null || !Number.isFinite(sqKm)) return null;
  const nf = (digits: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: digits });
  if (sqKm < 0.1) {
    return `${nf(0).format(Math.round(sqKm * 1_000_000))} m²`;
  }
  return `${nf(sqKm < 10 ? 1 : 0).format(sqKm)} km²`;
}

/** Areas beyond this estimate are split into several Google searches. */
export const LARGE_AREA_SQ_KM = 50;

export function isLargeArea(area: AreaDraft | null | undefined): boolean {
  const sqKm = areaDraftSqKm(area);
  return sqKm != null && sqKm > LARGE_AREA_SQ_KM;
}

/** True once the draft is complete enough to start a discovery session. */
export function isAreaReady(area: AreaDraft | null | undefined): boolean {
  if (!area || !area.type) return false;
  if (area.type === 'radius') return Boolean(area.radiusMeters && area.radiusMeters > 0);
  return Boolean(area.geometry || area.bounds);
}
