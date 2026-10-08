import {
  CATALOG,
  getType,
  resolveOsmTags,
} from '../businessDiscovery/businessTypeCatalog.js';

/**
 * Shared business-type label normalizer used by EVERY import path (server
 * discovery + Chrome extension). Turns a raw provider category — an OSM tag
 * value (`restaurant`, `fast_food`, `hairdresser`), a Google Places (New)
 * `includedType` (`fast_food_restaurant`), a catalog id (`fast-food`), a legacy
 * comma-joined list of catalog ids, or free-text Maps category ("Hair salon") —
 * into ONE clean, human-readable label drawn from the catalog ("Fast Food",
 * "Restaurant", "Pharmacy").
 *
 * This is the single source of truth so the CRM and the extension never show a
 * different type for the same business. It REUSES `businessTypeCatalog.js`
 * (the CRM↔provider mapping) rather than duplicating category knowledge, and it
 * NEVER guesses a category that is not derivable — unknown input is only cleaned
 * up (humanized), never invented.
 */

const dehyphen = (value) => String(value).toLowerCase().replace(/[-\s]+/g, '_');

// catalog id (and a few spellings) → clean name, e.g. "fast-food" → "Fast Food".
const ID_TO_NAME = new Map();
// Google Places (New) includedType → clean name, e.g. "fast_food_restaurant".
const INCLUDED_TYPE_TO_NAME = new Map();
// OSM tag VALUE → clean name, e.g. "fast_food" → "Fast Food".
const OSM_VALUE_TO_NAME = new Map();

(() => {
  const allTypes = CATALOG.flatMap((group) => group.types);

  for (const type of allTypes) {
    ID_TO_NAME.set(type.id, type.name);
    ID_TO_NAME.set(dehyphen(type.id), type.name);

    if (type.includedType) {
      // Prefer the type whose id matches the includedType (e.g. `pharmacy` over
      // `medical-store`, which both map to Google `pharmacy`).
      const idMatches = dehyphen(type.id) === type.includedType;
      if (idMatches || !INCLUDED_TYPE_TO_NAME.has(type.includedType)) {
        INCLUDED_TYPE_TO_NAME.set(type.includedType, type.name);
      }
    }
  }

  // Two passes over the OSM tags so a type's CANONICAL (first) tag value wins
  // over values it merely also matches (e.g. `motel`/`resort` are not absorbed
  // into "Hotel" just because the Hotel type also queries them). Both passes are
  // first-wins, so the earlier catalog type owns a shared value (e.g. Salon over
  // Barber for `hairdresser`).
  for (const type of allTypes) {
    const [canonical] = resolveOsmTags(type.id);
    if (canonical?.value && !OSM_VALUE_TO_NAME.has(canonical.value)) {
      OSM_VALUE_TO_NAME.set(canonical.value, type.name);
    }
  }
  for (const type of allTypes) {
    for (const tag of resolveOsmTags(type.id)) {
      if (tag?.value && !OSM_VALUE_TO_NAME.has(tag.value)) {
        OSM_VALUE_TO_NAME.set(tag.value, type.name);
      }
    }
  }
})();

/** Title-case a raw token, turning separators into spaces. */
function humanize(value) {
  const cleaned = String(value).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase('en'));
}

/**
 * Normalize ANY raw provider category into a clean business-type label.
 * @param {*} raw - OSM tag value / Google includedType / catalog id / joined
 *   list / free-text category.
 * @returns {string|null} a clean label, or null when nothing usable was given.
 */
export function normalizeBusinessType(raw) {
  if (raw == null) return null;
  // Legacy discovery stored businessType as comma/pipe-joined catalog ids; the
  // first token is the primary category.
  const first = String(raw).split(/[,|]/)[0]?.replace(/\s+/g, ' ').trim();
  if (!first) return null;

  // Accept a namespaced OSM tag ("amenity=restaurant") by taking the value.
  const value = first.includes('=') ? first.split('=').pop().trim() : first;

  // Only a single machine token (no spaces — an OSM tag value, a Google
  // includedType, or a catalog id) is remapped to a catalog name. An
  // already-human provider label ("Hair salon", "Indian restaurant") is kept
  // as-is and merely tidied, since it is often MORE specific than the catalog.
  if (!/\s/.test(value)) {
    const key = value.toLowerCase();
    const underscored = dehyphen(value);
    const mapped = ID_TO_NAME.get(key)
      ?? ID_TO_NAME.get(underscored)
      ?? INCLUDED_TYPE_TO_NAME.get(underscored)
      ?? OSM_VALUE_TO_NAME.get(underscored);
    return mapped ?? humanize(value);
  }

  // An already-cased human label ("IT Company", "Indian restaurant") is kept
  // verbatim; an all-lowercase spaced label is tidy-cased.
  return /[A-Z]/.test(value) ? value : humanize(value);
}

/** Resolve a clean label from a list of catalog ids (fallback for discovery). */
export function labelFromCatalogIds(ids = []) {
  for (const id of Array.isArray(ids) ? ids : []) {
    const type = getType(id);
    if (type?.name) return type.name;
  }
  return null;
}

export default { normalizeBusinessType, labelFromCatalogIds };
