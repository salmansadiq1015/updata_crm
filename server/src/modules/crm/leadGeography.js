import crypto from 'crypto';

/**
 * Canonical, hierarchy-aware geography for CRM leads.
 *
 * Provider/import address strings remain available on `address`, but filter and
 * relationship identity is derived here. IDs always include their geographic
 * parent, so two Springfields (or two identically named neighbourhoods) never
 * collapse across countries/cities. Similar names are not merged unless their
 * country and parent relationship agree.
 */

function clean(value, max = 255) {
  if (value === null || value === undefined) return null;
  const text = String(value).normalize('NFC').replace(/\s+/gu, ' ').trim();
  return text ? text.slice(0, max) : null;
}

export function normalizeGeographyKey(value) {
  return (clean(value) ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .replace(/[’'`´]/gu, '')
    .replace(/&/gu, ' and ')
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

const COUNTRY_ALIASES = new Map();
const KNOWN_COUNTRY_CODES = new Set();

function addCountryAlias(value, code, { overwrite = false } = {}) {
  const key = normalizeGeographyKey(value);
  if (key && (overwrite || !COUNTRY_ALIASES.has(key))) COUNTRY_ALIASES.set(key, code);
}

// Build a broad ISO-3166 name lookup from the runtime's ICU data. This avoids a
// finite home-grown country list while still refusing unknown/free-form text.
for (const locale of ['en', 'fr', 'de', 'es', 'it', 'pt', 'ar', 'ur']) {
  try {
    const names = new Intl.DisplayNames([locale], { type: 'region' });
    for (let a = 65; a <= 90; a += 1) {
      for (let b = 65; b <= 90; b += 1) {
        const code = String.fromCharCode(a, b);
        const name = names.of(code);
        if (name && name !== code && !/^unknown region$/i.test(name)) {
          KNOWN_COUNTRY_CODES.add(code);
          addCountryAlias(name, code);
        }
      }
    }
  } catch {
    // A minimal-ICU deployment still has the explicit aliases below and accepts
    // all two-letter codes. Failure here must never prevent server startup.
  }
}

[
  ['UK', 'GB'], ['U.K.', 'GB'], ['England', 'GB'], ['Scotland', 'GB'], ['Wales', 'GB'],
  ['USA', 'US'], ['U.S.A.', 'US'], ['America', 'US'], ['UAE', 'AE'],
  ['South Korea', 'KR'], ['North Korea', 'KP'], ['Russia', 'RU'],
  ['Türkiye', 'TR'], ['Czech Republic', 'CZ'], ['Ivory Coast', 'CI'],
  ['DR Congo', 'CD'], ['Democratic Republic of the Congo', 'CD'],
  ['Republic of the Congo', 'CG'], ['Bolivia', 'BO'], ['Venezuela', 'VE'],
  ['Tanzania', 'TZ'], ['Iran', 'IR'], ['Syria', 'SY'], ['Laos', 'LA'],
  ['Moldova', 'MD'], ['Vietnam', 'VN'], ['Brunei', 'BN'],
  ['Palestine', 'PS'], ['Kosovo', 'XK'], ['Taiwan', 'TW'],
].forEach(([name, code]) => addCountryAlias(name, code, { overwrite: true }));

// ICU also exposes a handful of retired region codes (for example FX =
// Metropolitan France). Pin common modern ISO identities after that generated
// lookup so persisted IDs never depend on a runtime's legacy aliases.
[
  ['France', 'FR'], ['Germany', 'DE'], ['Pakistan', 'PK'], ['India', 'IN'],
  ['United Kingdom', 'GB'], ['United States', 'US'], ['Switzerland', 'CH'],
  ['Canada', 'CA'], ['Australia', 'AU'], ['United Arab Emirates', 'AE'],
].forEach(([name, code]) => addCountryAlias(name, code, { overwrite: true }));

/** "Pakistan" / "pk" / localized ISO country names → "PK"; unknown → null. */
export function normalizeCountryCode(value) {
  const country = clean(value, 120);
  if (!country) return null;
  const alias = COUNTRY_ALIASES.get(normalizeGeographyKey(country));
  if (alias) return alias;
  if (/^[a-z]{2}$/iu.test(country)) {
    const code = country.toUpperCase();
    return KNOWN_COUNTRY_CODES.has(code) || code === 'XK' ? code : null;
  }
  return null;
}

export function countryNameForCode(code) {
  const normalized = normalizeCountryCode(code);
  if (!normalized) return null;
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(normalized) ?? normalized;
  } catch {
    return normalized;
  }
}

const LATIN_LETTER = /\p{Script=Latin}/u;
const ANY_LETTER = /\p{L}/u;

/**
 * Bilingual provider labels ("Mohammédia المحمدية", "Bni Yakhlef ⴱⵏⵉ ⵉⵅⵍⴼ بني يخلف",
 * "Lahore لاہور") are the same place written twice. Keep the Latin-script name
 * so one city never splits into an English and a mixed-script filter option.
 * A name written ONLY in another script is returned unchanged (it is repaired
 * from coordinates instead — see needsGeoRepair).
 */
export function preferLatinScript(value) {
  const text = clean(value, 255);
  if (!text || !LATIN_LETTER.test(text)) return text;
  const kept = text
    .split(' ')
    .filter((token) => !ANY_LETTER.test(token) || LATIN_LETTER.test(token))
    .join(' ')
    .replace(/\(\s*\)|\[\s*\]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/^[\s,;:·/|–—-]+|[\s,;:·/|–—-]+$/gu, '')
    .trim();
  return (kept.match(/\p{Script=Latin}/gu) ?? []).length >= 2 ? kept : text;
}

/** True when a name has letters but none of them are Latin (e.g. "لاہور"). */
export function isNonLatinOnly(value) {
  const text = clean(value, 255);
  return Boolean(text && ANY_LETTER.test(text) && !LATIN_LETTER.test(text));
}

function displayName(value) {
  const text = preferLatinScript(clean(value, 120));
  if (!text) return null;
  const letters = text.match(/\p{L}/gu) ?? [];
  if (!letters.length) return text;
  const allLower = text === text.toLocaleLowerCase('en');
  const allUpper = text === text.toLocaleUpperCase('en');
  if (!allLower && !allUpper) return text;
  return text.toLocaleLowerCase('en').replace(/(^|[\s\-/(])\p{L}/gu, (match) => match.toLocaleUpperCase('en'));
}

function stableId(prefix, ...parts) {
  const digest = crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
  return `${prefix}:${digest}`;
}

function ordinal(number) {
  const n = Number(number);
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

const ORDINAL = '(\\d{1,3})(?:st|nd|rd|th|er|e|eme|ème)?';
const ARRONDISSEMENT_PATTERNS = [
  new RegExp(`^(.+?)\\s+${ORDINAL}\\s+arrondissement$`, 'iu'),
  new RegExp(`^${ORDINAL}\\s+arrondissement(?:\\s+(?:of|de|du|d[’']))\\s+(.+)$`, 'iu'),
];

function parseArrondissement(value, countryCode, allowBare = false) {
  const text = clean(value, 120);
  if (!text) return null;

  let match = text.match(ARRONDISSEMENT_PATTERNS[0]);
  if (match) return { city: displayName(match[1]), number: Number(match[2]) };

  match = text.match(ARRONDISSEMENT_PATTERNS[1]);
  if (match) return { city: displayName(match[2]), number: Number(match[1]) };

  // Common French compact form, e.g. "Paris 10e". Country context is required
  // so an ordinary city ending in a number is never reclassified globally.
  if (countryCode === 'FR') {
    match = text.match(/^(.+?)\s+(\d{1,2})(?:er|e|eme|ème)$/iu);
    if (match) return { city: displayName(match[1]), number: Number(match[2]) };
  }

  if (allowBare) {
    match = text.match(new RegExp(`^${ORDINAL}\\s+arrondissement$`, 'iu'));
    if (match) return { city: null, number: Number(match[1]) };
  }
  return null;
}

function removeCountrySuffix(value, countryCode) {
  const text = clean(value, 120);
  if (!text) return { value: null, countryCode, conflict: false };

  const candidates = [
    /^(.*?),\s*([^,]+)$/u,
    /^(.*?)\s*\(([^()]+)\)$/u,
    /^(.*?)\s+[–—-]\s+([^–—-]+)$/u,
  ];
  for (const pattern of candidates) {
    const match = text.match(pattern);
    if (!match) continue;
    const suffixCode = normalizeCountryCode(match[2]);
    if (!suffixCode) continue;
    if (countryCode && suffixCode !== countryCode) {
      return { value: text, countryCode, conflict: true };
    }
    return { value: clean(match[1], 120), countryCode: countryCode ?? suffixCode, conflict: false };
  }
  // "Lahore Pakistan" — a space-separated country suffix. Only stripped when it
  // equals the lead's KNOWN country, so a real place such as "New Mexico" (US)
  // is never truncated to "New".
  if (countryCode) {
    const words = text.split(' ');
    for (let take = Math.min(3, words.length - 1); take >= 1; take -= 1) {
      const head = words.slice(0, -take).join(' ');
      if (normalizeCountryCode(words.slice(-take).join(' ')) === countryCode
        && (head.match(/\p{L}/gu) ?? []).length >= 3) {
        return { value: clean(head, 120), countryCode, conflict: false };
      }
    }
  }
  return { value: text, countryCode, conflict: false };
}

function removePostalPrefix(value) {
  const text = clean(value, 120);
  if (!text) return null;
  // Provider city fields occasionally contain "75011 Paris". Only remove a
  // short leading postal token when the remainder clearly contains a place name.
  const match = text.match(/^(?:\d[\dA-Z-]{1,10}|[A-Z]{1,3}-?\d[A-Z0-9-]{0,8})\s+([\p{L}][\p{L}\p{M}'’ .-]{1,100})$/iu);
  return match ? clean(match[1], 120) : text;
}

const STREET_LIKE = /(^\s*\d+[A-Z]?\s+)|\b(street|st\.?|road|rd\.?|avenue|ave\.?|boulevard|blvd\.?|rue|strasse|straße|lane|ln\.?|drive|dr\.?|route|highway|hwy\.?|chemin)\b/iu;
const POSTAL_ONLY = /^(?=[A-Z0-9\s-]{3,12}$)(?=.*\d)[A-Z0-9][A-Z0-9\s-]+$/iu;

function inferAreaType(value) {
  const key = normalizeGeographyKey(value);
  if (/\barrondissement\b/u.test(key)) return 'arrondissement';
  if (/\bborough\b/u.test(key)) return 'borough';
  if (/\bdistrict\b/u.test(key)) return 'district';
  if (/\bward\b/u.test(key)) return 'district';
  if (/\bsuburb\b/u.test(key)) return 'neighborhood';
  if (/\b(neighborhood|neighbourhood|quarter)\b/u.test(key)) return 'neighborhood';
  return 'neighborhood';
}

// Scraper/UI artefacts and building-level fragments that land in a city/area
// field ("A Rosewood Hotel · Visited link", "Immeuble Haj Yemmou", "5Th Floor",
// "Bd de Palestine", "CENTER 13 carrefour"). Never a locality name.
const NOT_A_PLACE = /visited link|\s·\s|\b(bd|av|immeuble|r[ée]sidence|floor|plot|[ée]tage|au dessus|carrefour)\b|\bcent(?:er|re)\s+\d/iu;

export function isPlausiblePlaceName(value) {
  const text = clean(value, 120);
  if (!text || POSTAL_ONLY.test(text) || STREET_LIKE.test(text) || NOT_A_PLACE.test(text)) return false;
  return (text.match(/\p{L}/gu) ?? []).length >= 2;
}

/**
 * A stored city/area that should be re-derived from the lead's coordinates:
 * written only in a non-Latin script, or not a plausible place name at all.
 */
export function needsGeoRepair(value) {
  const text = clean(value, 120);
  if (!text) return false;
  return isNonLatinOnly(text) || !isPlausiblePlaceName(preferLatinScript(text));
}

/**
 * Return a canonical address while preserving all non-geographic address data.
 * Ambiguous values are retained in the visible fields and marked for review;
 * they do not receive an areaId and therefore cannot pollute canonical filters.
 */
export function canonicalizeLeadAddress(address = {}, options = {}) {
  const source = clean(options.source, 60) ?? clean(address?.geography?.source, 60) ?? 'unknown';
  const issues = [];
  // Migrations and trusted provider adapters may supply verified country
  // evidence. `countryVerified: false` deliberately removes an inherited or
  // otherwise untrusted country instead of allowing it to pollute canonical
  // filters. The raw lead is recoverable through the migration backup.
  let countryCode = options.countryVerified === false
    ? null
    : normalizeCountryCode(options.verifiedCountryCode ?? address.country ?? address.countryCode);
  if (options.countryVerified === false) issues.push('UNVERIFIED_COUNTRY');

  const strippedCity = removeCountrySuffix(address.city, countryCode);
  countryCode = strippedCity.countryCode;
  if (strippedCity.conflict) issues.push('CITY_COUNTRY_CONFLICT');

  let cityName = displayName(removePostalPrefix(strippedCity.value));
  let areaName = displayName(address.area);
  let areaType = null;

  // A provider can put an administrative subdivision in its city field. Move
  // the subdivision down one level and retain the real parent city.
  const cityArrondissement = parseArrondissement(cityName, countryCode);
  if (cityArrondissement) {
    if (areaName && normalizeGeographyKey(areaName) !== normalizeGeographyKey(cityName)) {
      issues.push('AREA_CONFLICT');
    } else {
      areaName = `${ordinal(cityArrondissement.number)} Arrondissement`;
      areaType = 'arrondissement';
    }
    cityName = cityArrondissement.city;
  }

  const strippedArea = removeCountrySuffix(areaName, countryCode);
  if (strippedArea.conflict) issues.push('AREA_COUNTRY_CONFLICT');
  areaName = displayName(strippedArea.value);

  const areaArrondissement = parseArrondissement(areaName, countryCode, true);
  if (areaArrondissement) {
    if (areaArrondissement.city) {
      if (cityName && normalizeGeographyKey(areaArrondissement.city) !== normalizeGeographyKey(cityName)) {
        issues.push('AREA_CITY_CONFLICT');
      } else if (!cityName) cityName = areaArrondissement.city;
    }
    areaName = `${ordinal(areaArrondissement.number)} Arrondissement`;
    areaType = 'arrondissement';
  }

  // A city copied into the provider's area field is not a neighbourhood.
  if (areaName && cityName && normalizeGeographyKey(areaName) === normalizeGeographyKey(cityName)) {
    areaName = null;
    areaType = null;
  }

  if (cityName && !isPlausiblePlaceName(cityName)) {
    issues.push('INVALID_CITY');
    cityName = null;
  }

  const invalidArea = areaName && !areaType && !isPlausiblePlaceName(areaName);
  if (invalidArea) issues.push('AMBIGUOUS_AREA');
  if (areaName && !areaType && !invalidArea) areaType = inferAreaType(areaName);

  const countryId = countryCode ? `country:${countryCode}` : null;
  const cityKey = normalizeGeographyKey(cityName);
  const hasCityConflict = issues.some((issue) => issue.startsWith('CITY_'));
  const cityId = countryId && cityKey && !hasCityConflict ? stableId('city', countryCode, cityKey) : null;
  const areaKey = normalizeGeographyKey(areaName);
  const hasAreaConflict = issues.some((issue) => issue.startsWith('AREA_'));
  const areaId = cityId && areaKey && areaType && !invalidArea && !hasAreaConflict
    ? stableId('area', countryCode, cityId, areaType, areaKey)
    : null;

  if (cityName && !countryCode) issues.push('CITY_WITHOUT_COUNTRY');
  if (areaName && !cityId) issues.push('AREA_WITHOUT_CANONICAL_CITY');

  const reviewRequired = issues.length > 0;
  const countryName = countryNameForCode(countryCode);
  const geography = {
    countryId,
    countryCode,
    countryName,
    cityId,
    cityName,
    areaId,
    areaName: areaId ? areaName : null,
    parentLocationId: areaId ? cityId : cityId ? countryId : null,
    locationType: areaId ? areaType : cityId ? 'city' : countryId ? 'country' : null,
    source,
    externalPlaceId: clean(options.externalPlaceId ?? address?.geography?.externalPlaceId, 255),
    confidence: reviewRequired ? 'ambiguous' : countryId || cityId || areaId ? 'canonical' : 'unresolved',
    reviewRequired,
    issues: [...new Set(issues)],
  };

  return {
    ...address,
    country: countryCode,
    city: cityName,
    // Preserve an ambiguous raw area for human review, but only canonical areas
    // are copied into geography.areaName / exposed by filter-options.
    area: areaName,
    geography,
  };
}

const tupleKey = (...values) => JSON.stringify(values.map((value) => value ?? null));

function preferLabel(current, candidate) {
  if (!candidate) return current;
  if (!current) return candidate;
  const score = (text) => {
    const accents = text.normalize('NFD') !== text.normalize('NFD').replace(/\p{M}+/gu, '') ? 1 : 0;
    const cased = text !== text.toLocaleLowerCase('en') && text !== text.toLocaleUpperCase('en') ? 2 : 0;
    return cased + accents;
  };
  return score(candidate) > score(current) ? candidate : current;
}

/**
 * Build the Country → City → Area filter facets from the RAW stored address
 * values (one row per distinct {country, city, area} with its lead count).
 *
 * Every raw value is canonicalized with the same function used on write, then
 * merged by canonical identity, so spelling/case/accent/script variants
 * ("Mohammedia" / "Mohammédia المحمدية", "Lahore" / "Lahore, Pakistan") are ONE
 * option. A city whose country is unknown is folded into the single known-
 * country city of the same name (when exactly one exists) so no lead drops out
 * of the filter. Identically named places in different countries/cities stay
 * separate and are labelled with their parent to tell them apart.
 *
 * Returns option metadata plus, per option id, the minimal raw-value matchers
 * that select exactly the leads counted under it. Because identity is derived
 * from the raw values at query time, stale stored IDs can never split options.
 */
export function buildGeographyFacets(rows = []) {
  const entries = rows.map((row) => {
    const canonical = canonicalizeLeadAddress(
      { country: row.country ?? null, city: row.city ?? null, area: row.area ?? null },
      { source: 'facet' },
    );
    const geo = canonical.geography;
    const cityName = canonical.city;
    const areaOk = canonical.area
      && !geo.issues.some((issue) => issue === 'AMBIGUOUS_AREA' || issue.startsWith('AREA_') && issue !== 'AREA_WITHOUT_CANONICAL_CITY');
    return {
      raw: { country: row.country ?? null, city: row.city ?? null, area: row.area ?? null },
      count: Number(row.count) || 0,
      countryCode: geo.countryCode,
      cityName,
      cityKey: normalizeGeographyKey(cityName),
      areaName: areaOk ? canonical.area : null,
      areaKey: areaOk ? normalizeGeographyKey(canonical.area) : '',
      areaType: areaOk ? (geo.locationType && geo.locationType !== 'city' && geo.locationType !== 'country' ? geo.locationType : inferAreaType(canonical.area)) : null,
    };
  });

  // Fold country-less cities into the unique known country that has that city.
  const countriesByCity = new Map();
  for (const entry of entries) {
    if (!entry.cityKey || !entry.countryCode) continue;
    if (!countriesByCity.has(entry.cityKey)) countriesByCity.set(entry.cityKey, new Set());
    countriesByCity.get(entry.cityKey).add(entry.countryCode);
  }
  for (const entry of entries) {
    if (entry.countryCode || !entry.cityKey) continue;
    const known = countriesByCity.get(entry.cityKey);
    if (known?.size === 1) {
      [entry.countryCode] = known;
      entry.folded = true;
    }
  }

  const countries = new Map();
  const cities = new Map();
  const areas = new Map();
  const matchers = new Map();
  const addMatcher = (id, matcher) => {
    if (!matchers.has(id)) matchers.set(id, new Map());
    matchers.get(id).set(tupleKey(...Object.values(matcher)), matcher);
  };
  const assignments = new Map();

  for (const entry of entries) {
    const { raw } = entry;
    const assignment = { countryId: null, cityId: null, areaId: null };
    if (entry.countryCode) {
      const countryId = `country:${entry.countryCode}`;
      assignment.countryId = countryId;
      if (!countries.has(countryId)) {
        countries.set(countryId, { id: countryId, value: countryNameForCode(entry.countryCode) ?? entry.countryCode, code: entry.countryCode });
      }
      // A folded (country-less) row joins the country only through its city.
      addMatcher(countryId, entry.folded ? { country: raw.country, city: raw.city } : { country: raw.country });
    }
    if (entry.cityKey) {
      const cityId = stableId('city', entry.countryCode ?? '', entry.cityKey);
      assignment.cityId = cityId;
      const existing = cities.get(cityId);
      cities.set(cityId, {
        id: cityId,
        value: preferLabel(existing?.value, entry.cityName),
        countryId: assignment.countryId,
        countryCode: entry.countryCode,
        country: entry.countryCode ? countryNameForCode(entry.countryCode) : null,
      });
      addMatcher(cityId, { country: raw.country, city: raw.city });

      if (entry.areaKey) {
        const areaId = stableId('area', entry.countryCode ?? '', cityId, entry.areaType ?? 'neighborhood', entry.areaKey);
        assignment.areaId = areaId;
        const existingArea = areas.get(areaId);
        areas.set(areaId, {
          id: areaId,
          value: preferLabel(existingArea?.value, entry.areaName),
          type: entry.areaType,
          cityId,
          countryId: assignment.countryId,
          countryCode: entry.countryCode,
          country: entry.countryCode ? countryNameForCode(entry.countryCode) : null,
        });
        addMatcher(areaId, { country: raw.country, city: raw.city, area: raw.area });
      }
    }
    assignments.set(tupleKey(raw.country, raw.city, raw.area), assignment);
  }

  for (const area of areas.values()) area.city = cities.get(area.cityId)?.value ?? null;

  return {
    countries,
    cities,
    areas,
    /** option id → raw {country, city[, area]} matchers selecting its leads */
    matchers: new Map([...matchers].map(([id, set]) => [id, [...set.values()]])),
    /** raw tuple key → the option ids it counts towards */
    assignments,
    tupleKey,
  };
}

/**
 * Turn per-tuple lead counts into the cascaded option lists. Labels gain their
 * parent only when the same name would otherwise appear twice in one list.
 */
export function countGeographyFacets(facets, scopedRows = [], { countryId = null, cityId = null } = {}) {
  const counts = new Map();
  const bump = (id, n) => { if (id) counts.set(id, (counts.get(id) ?? 0) + n); };
  for (const row of scopedRows) {
    const assignment = facets.assignments.get(facets.tupleKey(row.country, row.city, row.area));
    if (!assignment) continue;
    const n = Number(row.count) || 0;
    bump(assignment.countryId, n);
    if (!countryId || assignment.countryId === countryId) bump(assignment.cityId, n);
    if ((!countryId || assignment.countryId === countryId) && (!cityId || assignment.cityId === cityId)) bump(assignment.areaId, n);
  }
  const withCounts = (map) => [...map.values()]
    .map((option) => ({ ...option, count: counts.get(option.id) ?? 0 }))
    .filter((option) => option.count > 0 && option.value);
  const disambiguate = (options, parentLabel) => {
    const byName = new Map();
    for (const option of options) {
      const key = normalizeGeographyKey(option.value);
      byName.set(key, (byName.get(key) ?? 0) + 1);
    }
    return options.map((option) => {
      const parent = byName.get(normalizeGeographyKey(option.value)) > 1 ? parentLabel(option) : null;
      return parent ? { ...option, value: `${option.value} · ${parent}` } : option;
    });
  };
  const byValue = (a, b) => a.value.localeCompare(b.value);

  const countries = withCounts(facets.countries).sort(byValue);
  const cities = disambiguate(
    withCounts(facets.cities).filter((city) => !countryId || city.countryId === countryId),
    (city) => city.country ?? 'Unknown country',
  ).sort(byValue);
  const areas = disambiguate(
    withCounts(facets.areas)
      .filter((area) => (!countryId || area.countryId === countryId) && (!cityId || area.cityId === cityId)),
    (area) => area.city ?? area.country,
  ).sort(byValue);
  return { countries, cities, areas };
}
