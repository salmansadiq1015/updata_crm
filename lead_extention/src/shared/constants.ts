export const DB_NAME = 'lead-finder-local';
export const DB_VERSION = 1;
export const DEFAULT_MAX_RESULTS = 500;
export const MAX_SAFE_ITERATIONS = 400;
export const DISCOVERY_SCROLL_DELAY_MS = 850;
export const MAX_PAGE_BYTES = 800_000;
export const MAX_RADIUS_KM = 500;

// User-configurable pause applied between Maps "requests" (each new area/tile
// and each query variation — the throttle-sensitive navigations), NOT between
// every in-feed scroll. A larger value trades speed for fewer rate-limit
// errors, connection resets, and terminated feeds. The pause also grows
// adaptively when Google throttles a feed and decays back on success.
export const MIN_REQUEST_DELAY_MS = 5_000; // 5 seconds
export const MAX_REQUEST_DELAY_MS = 300_000; // 5 minutes
export const DEFAULT_REQUEST_DELAY_MS = 10_000; // 10 seconds
// Backoff ceiling: adaptive throttling never multiplies the base delay beyond
// this, so a sweep keeps making progress even under sustained throttling.
export const MAX_THROTTLE_BACKOFF = 6;
export const REQUEST_DELAY_OPTIONS = [
  { ms: 5_000, label: '5 seconds' },
  { ms: 10_000, label: '10 seconds' },
  { ms: 15_000, label: '15 seconds' },
  { ms: 30_000, label: '30 seconds' },
  { ms: 60_000, label: '1 minute' },
  { ms: 120_000, label: '2 minutes' },
  { ms: 300_000, label: '5 minutes' },
] as const;

// Adaptive area-sweep tuning.
// A single Maps feed tops out near ~120 cards; a tile that reaches this many
// distinct cards is treated as "capped" and split into four smaller tiles.
export const TILE_SPLIT_THRESHOLD = 100;
// Never subdivide below this tile size — at street scale a residual cap is
// accepted rather than spawning an unbounded number of tiles.
export const MIN_TILE_SPAN_KM = 0.35;
// Safety ceiling on quadtree depth and total tiles scanned per sweep.
export const MAX_TILE_DEPTH = 6;
export const DEFAULT_MAX_AREA_TILES = 400;
// Area radius used when the user leaves the radius filter unset.
export const DEFAULT_SWEEP_RADIUS_KM = 5;

export const RADIUS_OPTIONS = [0.5, 1, 2, 5, 10, 20, 30, 50] as const;

export const BUSINESS_TYPE_PRESETS = [
  'Hotel', 'Restaurant', 'Cafe', 'Dentist', 'Doctor', 'Pharmacy',
  'Beauty Salon', 'Gym', 'Real Estate Agency', 'Law Firm', 'School',
  'Auto Repair Shop', 'Retail Store', 'Construction Company',
  'Travel Agency', 'Software Company',
] as const;

export const CSV_HEADERS = [
  'Business Name',
  'Category',
  'Phone',
  'International Phone',
  'Email',
  'Website',
  'Address',
  'Street',
  'Area',
  'City',
  'State',
  'Postal Code',
  'Country',
  'Latitude',
  'Longitude',
  'Distance KM',
  'Rating',
  'Review Count',
  'Business Status',
  'Opening Hours',
  'Google Maps URL',
  'Source',
  'Email Source',
  'Email Confidence',
  'Discovered At',
  'Search Categories'
] as const;

// The editable column order used by the CRM import template, plus the extra
// columns (area, coordinates, searchLocation) the CRM's importer recognises by
// header name. They let the CSV fallback route carry the same coordinate +
// search-location signals the structured endpoint sends, so a city/country the
// scrape missed is still reverse-geocoded / filled on the server.
export const CRM_IMPORT_HEADERS = [
  'name', 'type', 'status', 'street', 'addressSupplement', 'area', 'postalCode',
  'city', 'canton', 'country', 'phone', 'mobile', 'email', 'website', 'notes', 'tags',
  'latitude', 'longitude', 'searchLocation'
] as const;
