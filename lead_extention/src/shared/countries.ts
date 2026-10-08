// A pragmatic allow-list of country names, used ONLY to stop non-address text
// (e.g. a Google Maps "PRESS CONFERENCE" section header / chip) from being
// captured as a lead's country. It does NOT need to be exhaustive: an unlisted
// country simply yields null here, and the CRM then resolves the real country
// from the lead's coordinates on import. Never guess — a wrong country is worse
// than none.
const COUNTRY_NAMES = new Set([
  'switzerland', 'schweiz', 'suisse', 'svizzera',
  'france', 'germany', 'deutschland', 'austria', 'österreich', 'osterreich',
  'italy', 'italia', 'liechtenstein', 'luxembourg', 'monaco',
  'pakistan', 'india', 'bangladesh', 'sri lanka', 'nepal', 'bhutan', 'maldives',
  'united kingdom', 'uk', 'great britain', 'england', 'scotland', 'wales', 'northern ireland', 'ireland',
  'united states', 'united states of america', 'usa', 'america', 'canada',
  'australia', 'new zealand',
  'spain', 'españa', 'espana', 'portugal', 'netherlands', 'the netherlands', 'belgium',
  'denmark', 'norway', 'sweden', 'finland', 'iceland',
  'poland', 'czechia', 'czech republic', 'slovakia', 'hungary', 'romania', 'bulgaria',
  'greece', 'croatia', 'slovenia', 'serbia', 'bosnia and herzegovina', 'albania', 'north macedonia',
  'ukraine', 'belarus', 'lithuania', 'latvia', 'estonia', 'moldova', 'cyprus', 'malta',
  'turkey', 'türkiye', 'turkiye',
  'united arab emirates', 'uae', 'saudi arabia', 'qatar', 'kuwait', 'bahrain', 'oman',
  'jordan', 'lebanon', 'palestine', 'egypt', 'morocco', 'tunisia', 'algeria', 'libya',
  'israel', 'iraq', 'iran', 'afghanistan', 'yemen', 'syria',
  'china', 'japan', 'south korea', 'korea', 'north korea', 'taiwan', 'hong kong', 'macau',
  'singapore', 'malaysia', 'indonesia', 'thailand', 'vietnam', 'philippines', 'cambodia', 'laos', 'myanmar', 'brunei',
  'south africa', 'nigeria', 'kenya', 'ghana', 'ethiopia', 'tanzania', 'uganda', 'rwanda',
  'mexico', 'brazil', 'argentina', 'chile', 'colombia', 'peru', 'ecuador', 'uruguay', 'paraguay', 'bolivia', 'venezuela',
  'russia', 'russian federation', 'kazakhstan', 'uzbekistan', 'azerbaijan', 'georgia', 'armenia',
]);

/**
 * Return the country token when it is a plausible country name, else null.
 * Google Maps renders the country as a full name in the last address segment,
 * so we validate against known names; anything else (a stray UI label, a POI
 * chip, a region) is dropped rather than stored as the country.
 */
export function plausibleCountry(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return null;
  return COUNTRY_NAMES.has(trimmed.toLocaleLowerCase('en')) ? trimmed : null;
}
