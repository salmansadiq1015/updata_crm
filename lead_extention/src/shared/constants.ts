export const DB_NAME = 'lead-finder-local';
export const DB_VERSION = 1;
export const DEFAULT_MAX_RESULTS = 500;
export const MAX_SAFE_ITERATIONS = 400;
export const DISCOVERY_SCROLL_DELAY_MS = 850;
export const MAX_PAGE_BYTES = 800_000;
export const MAX_RADIUS_KM = 500;

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
  'Discovered At'
] as const;

// This is the exact editable column order used by the existing CRM import
// template. Extension exports can therefore be imported without remapping.
export const CRM_IMPORT_HEADERS = [
  'name', 'type', 'status', 'street', 'addressSupplement', 'postalCode',
  'city', 'canton', 'country', 'phone', 'mobile', 'email', 'website', 'notes', 'tags'
] as const;
