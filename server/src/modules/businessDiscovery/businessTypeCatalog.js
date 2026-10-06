/**
 * CRM → Google Places (New) business-type catalog for Module 15.
 *
 * Centralized, static mapping (design §6; lead_module.md §2, §4, §77). Each CRM
 * business type maps to EITHER a structured Google Places (New) **Table A**
 * `includedType` (preferred — used with `places:searchNearby`), OR a `textQuery`
 * fallback phrase (used with `places:searchText`) when Google has no exact
 * structured type. No fabricated Google types (design §4): if unsure, we use a
 * textQuery and document it.
 *
 * Mapping decisions / limitations worth noting (see also the module report):
 *  - "Medical Store" → `pharmacy`: the design (§6, §77) explicitly maps the CRM
 *    "Medical Store" category to Google's `pharmacy` as the closest structured
 *    type.
 *  - "Laboratory" → `medical_lab` and "Physiotherapy Center" → `physiotherapist`:
 *    Google's health Table A types; narrower than the generic CRM label.
 *  - "Salon" → `hair_salon`, "Beauty Center" → `beauty_salon`: disambiguated.
 *  - "Contractor" → `general_contractor`; "Construction Company" has no structured
 *    type → textQuery.
 *  - No structured Google type exists for: Catering, Clinic, Diagnostic Center,
 *    Medical Center, Marketing/Software/IT companies, College, Training/Language/
 *    Tutoring centers, Construction/Engineering companies, Architecture firms,
 *    Manufacturers and Factories → these use `textQuery`.
 */

const MAX_CUSTOM_TYPE_LENGTH = 80;

/**
 * CATALOG: groups → types. `includedType` is a valid Google Places (New) Table A
 * type; `textQuery` is the fallback phrase when none applies (exactly one of the
 * two is set per entry).
 */
export const CATALOG = Object.freeze([
  {
    group: 'Food & Hospitality',
    i18nKey: 'leadgen.group.foodHospitality',
    types: [
      { id: 'restaurant', name: 'Restaurant', icon: 'utensils', includedType: 'restaurant' },
      { id: 'cafe', name: 'Cafe', icon: 'coffee', includedType: 'cafe' },
      { id: 'coffee-shop', name: 'Coffee Shop', icon: 'coffee', includedType: 'coffee_shop' },
      { id: 'bakery', name: 'Bakery', icon: 'croissant', includedType: 'bakery' },
      { id: 'fast-food', name: 'Fast Food', icon: 'sandwich', includedType: 'fast_food_restaurant' },
      { id: 'hotel', name: 'Hotel', icon: 'bed-double', includedType: 'hotel' },
      { id: 'motel', name: 'Motel', icon: 'bed-double', includedType: 'motel' },
      { id: 'resort', name: 'Resort', icon: 'bed-double', includedType: 'resort_hotel' },
      { id: 'catering', name: 'Catering', icon: 'utensils', textQuery: 'catering service' },
    ],
  },
  {
    group: 'Healthcare',
    i18nKey: 'leadgen.group.healthcare',
    types: [
      { id: 'hospital', name: 'Hospital', icon: 'ambulance', includedType: 'hospital' },
      { id: 'clinic', name: 'Clinic', icon: 'stethoscope', textQuery: 'medical clinic' },
      // Design §6/§77: "Medical Store" → pharmacy (closest structured type).
      { id: 'medical-store', name: 'Medical Store', icon: 'pill', includedType: 'pharmacy' },
      { id: 'pharmacy', name: 'Pharmacy', icon: 'pill', includedType: 'pharmacy' },
      { id: 'dentist', name: 'Dentist', icon: 'stethoscope', includedType: 'dentist' },
      { id: 'dental-clinic', name: 'Dental Clinic', icon: 'stethoscope', includedType: 'dental_clinic' },
      { id: 'diagnostic-center', name: 'Diagnostic Center', icon: 'microscope', textQuery: 'diagnostic center' },
      { id: 'laboratory', name: 'Laboratory', icon: 'microscope', includedType: 'medical_lab' },
      { id: 'physiotherapy-center', name: 'Physiotherapy Center', icon: 'activity', includedType: 'physiotherapist' },
      { id: 'medical-center', name: 'Medical Center', icon: 'heart-pulse', textQuery: 'medical center' },
      { id: 'veterinary-clinic', name: 'Veterinary Clinic', icon: 'dog', includedType: 'veterinary_care' },
    ],
  },
  {
    group: 'Professional Services',
    i18nKey: 'leadgen.group.professionalServices',
    types: [
      { id: 'law-firm', name: 'Law Firm', icon: 'scale', includedType: 'lawyer' },
      { id: 'accountant', name: 'Accountant', icon: 'calculator', includedType: 'accounting' },
      { id: 'accounting-firm', name: 'Accounting Firm', icon: 'calculator', includedType: 'accounting' },
      { id: 'real-estate-agency', name: 'Real Estate Agency', icon: 'home', includedType: 'real_estate_agency' },
      { id: 'insurance-agency', name: 'Insurance Agency', icon: 'shield', includedType: 'insurance_agency' },
      { id: 'consulting-firm', name: 'Consulting Firm', icon: 'briefcase', includedType: 'consultant' },
      { id: 'marketing-agency', name: 'Marketing Agency', icon: 'megaphone', textQuery: 'marketing agency' },
      { id: 'software-company', name: 'Software Company', icon: 'code', textQuery: 'software company' },
      { id: 'it-company', name: 'IT Company', icon: 'monitor', textQuery: 'IT company' },
    ],
  },
  {
    group: 'Retail',
    i18nKey: 'leadgen.group.retail',
    types: [
      { id: 'supermarket', name: 'Supermarket', icon: 'shopping-cart', includedType: 'supermarket' },
      { id: 'grocery-store', name: 'Grocery Store', icon: 'shopping-cart', includedType: 'grocery_store' },
      { id: 'clothing-store', name: 'Clothing Store', icon: 'shirt', includedType: 'clothing_store' },
      { id: 'electronics-store', name: 'Electronics Store', icon: 'monitor', includedType: 'electronics_store' },
      { id: 'furniture-store', name: 'Furniture Store', icon: 'sofa', includedType: 'furniture_store' },
      { id: 'jewelry-store', name: 'Jewelry Store', icon: 'gem', includedType: 'jewelry_store' },
      { id: 'automobile-dealer', name: 'Automobile Dealer', icon: 'car', includedType: 'car_dealer' },
      { id: 'mobile-phone-store', name: 'Mobile Phone Store', icon: 'smartphone', includedType: 'cell_phone_store' },
    ],
  },
  {
    group: 'Personal Services',
    i18nKey: 'leadgen.group.personalServices',
    types: [
      { id: 'gym', name: 'Gym', icon: 'dumbbell', includedType: 'gym' },
      { id: 'fitness-center', name: 'Fitness Center', icon: 'dumbbell', includedType: 'fitness_center' },
      { id: 'salon', name: 'Salon', icon: 'scissors', includedType: 'hair_salon' },
      { id: 'barber', name: 'Barber', icon: 'scissors', includedType: 'barber_shop' },
      { id: 'spa', name: 'Spa', icon: 'sparkles', includedType: 'spa' },
      { id: 'beauty-center', name: 'Beauty Center', icon: 'sparkles', includedType: 'beauty_salon' },
      { id: 'car-wash', name: 'Car Wash', icon: 'car', includedType: 'car_wash' },
    ],
  },
  {
    group: 'Education',
    i18nKey: 'leadgen.group.education',
    types: [
      { id: 'school', name: 'School', icon: 'graduation-cap', includedType: 'school' },
      { id: 'college', name: 'College', icon: 'graduation-cap', textQuery: 'college' },
      { id: 'university', name: 'University', icon: 'graduation-cap', includedType: 'university' },
      { id: 'training-center', name: 'Training Center', icon: 'book-open', textQuery: 'training center' },
      { id: 'language-school', name: 'Language School', icon: 'languages', textQuery: 'language school' },
      { id: 'tutoring-center', name: 'Tutoring Center', icon: 'book-open', textQuery: 'tutoring center' },
    ],
  },
  {
    group: 'Construction / Industrial',
    i18nKey: 'leadgen.group.constructionIndustrial',
    types: [
      { id: 'construction-company', name: 'Construction Company', icon: 'hard-hat', textQuery: 'construction company' },
      { id: 'contractor', name: 'Contractor', icon: 'hard-hat', includedType: 'general_contractor' },
      { id: 'architecture-firm', name: 'Architecture Firm', icon: 'ruler', textQuery: 'architecture firm' },
      { id: 'engineering-company', name: 'Engineering Company', icon: 'wrench', textQuery: 'engineering company' },
      { id: 'manufacturer', name: 'Manufacturer', icon: 'factory', textQuery: 'manufacturer' },
      { id: 'factory', name: 'Factory', icon: 'factory', textQuery: 'factory' },
      { id: 'hardware-store', name: 'Hardware Store', icon: 'hammer', includedType: 'hardware_store' },
    ],
  },
]);

/**
 * Flat index of all catalog types by id, each enriched with `group` and a derived
 * `i18nKey` (`leadgen.type.<id-as-dot>` style keyed off the id). Built once.
 */
const TYPE_INDEX = (() => {
  const index = new Map();
  for (const groupEntry of CATALOG) {
    for (const type of groupEntry.types) {
      index.set(type.id, {
        ...type,
        group: groupEntry.group,
        i18nKey: `leadgen.type.${type.id.replace(/-/g, '_')}`,
      });
    }
  }
  return index;
})();

const OSM_TAGS_BY_TYPE = Object.freeze({
  restaurant: [{ key: 'amenity', value: 'restaurant' }],
  cafe: [{ key: 'amenity', value: 'cafe' }],
  'coffee-shop': [{ key: 'amenity', value: 'cafe' }, { key: 'shop', value: 'coffee' }],
  bakery: [{ key: 'shop', value: 'bakery' }],
  'fast-food': [{ key: 'amenity', value: 'fast_food' }],
  hotel: [{ key: 'tourism', value: 'hotel' }],
  motel: [{ key: 'tourism', value: 'motel' }],
  resort: [{ key: 'tourism', value: 'resort' }],
  catering: [{ key: 'craft', value: 'caterer' }, { key: 'amenity', value: 'catering' }],
  hospital: [{ key: 'amenity', value: 'hospital' }, { key: 'healthcare', value: 'hospital' }],
  clinic: [{ key: 'amenity', value: 'clinic' }, { key: 'healthcare', value: 'clinic' }],
  'medical-store': [{ key: 'amenity', value: 'pharmacy' }, { key: 'shop', value: 'chemist' }],
  pharmacy: [{ key: 'amenity', value: 'pharmacy' }],
  dentist: [{ key: 'amenity', value: 'dentist' }, { key: 'healthcare', value: 'dentist' }],
  'dental-clinic': [{ key: 'amenity', value: 'dentist' }, { key: 'healthcare', value: 'dentist' }],
  'diagnostic-center': [{ key: 'healthcare', value: 'diagnostic_centre' }, { key: 'healthcare', value: 'laboratory' }],
  laboratory: [{ key: 'healthcare', value: 'laboratory' }, { key: 'amenity', value: 'laboratory' }],
  'physiotherapy-center': [{ key: 'healthcare', value: 'physiotherapist' }],
  'medical-center': [{ key: 'amenity', value: 'clinic' }, { key: 'healthcare', value: 'centre' }],
  'veterinary-clinic': [{ key: 'amenity', value: 'veterinary' }],
  'law-firm': [{ key: 'office', value: 'lawyer' }],
  accountant: [{ key: 'office', value: 'accountant' }],
  'accounting-firm': [{ key: 'office', value: 'accountant' }],
  'real-estate-agency': [{ key: 'office', value: 'estate_agent' }, { key: 'shop', value: 'estate_agent' }],
  'insurance-agency': [{ key: 'office', value: 'insurance' }],
  'consulting-firm': [{ key: 'office', value: 'consulting' }, { key: 'office', value: 'consultant' }],
  'marketing-agency': [{ key: 'office', value: 'advertising_agency' }, { key: 'office', value: 'marketing' }],
  'software-company': [{ key: 'office', value: 'it' }, { key: 'office', value: 'software' }],
  'it-company': [{ key: 'office', value: 'it' }],
  supermarket: [{ key: 'shop', value: 'supermarket' }],
  'grocery-store': [{ key: 'shop', value: 'convenience' }, { key: 'shop', value: 'greengrocer' }],
  'clothing-store': [{ key: 'shop', value: 'clothes' }],
  'electronics-store': [{ key: 'shop', value: 'electronics' }],
  'furniture-store': [{ key: 'shop', value: 'furniture' }],
  'jewelry-store': [{ key: 'shop', value: 'jewelry' }, { key: 'shop', value: 'jewellery' }],
  'automobile-dealer': [{ key: 'shop', value: 'car' }, { key: 'shop', value: 'car_repair' }],
  'mobile-phone-store': [{ key: 'shop', value: 'mobile_phone' }],
  gym: [{ key: 'leisure', value: 'fitness_centre' }],
  'fitness-center': [{ key: 'leisure', value: 'fitness_centre' }],
  salon: [{ key: 'shop', value: 'hairdresser' }],
  barber: [{ key: 'shop', value: 'hairdresser' }],
  spa: [{ key: 'leisure', value: 'spa' }, { key: 'shop', value: 'beauty' }],
  'beauty-center': [{ key: 'shop', value: 'beauty' }],
  'car-wash': [{ key: 'amenity', value: 'car_wash' }],
  school: [{ key: 'amenity', value: 'school' }],
  college: [{ key: 'amenity', value: 'college' }],
  university: [{ key: 'amenity', value: 'university' }],
  'training-center': [{ key: 'amenity', value: 'training' }, { key: 'office', value: 'educational_institution' }],
  'language-school': [{ key: 'amenity', value: 'language_school' }, { key: 'amenity', value: 'school' }],
  'tutoring-center': [{ key: 'amenity', value: 'school' }, { key: 'office', value: 'educational_institution' }],
  'construction-company': [{ key: 'office', value: 'construction_company' }, { key: 'craft', value: 'builder' }],
  contractor: [{ key: 'craft', value: 'builder' }, { key: 'office', value: 'construction_company' }],
  'architecture-firm': [{ key: 'office', value: 'architect' }],
  'engineering-company': [{ key: 'office', value: 'engineer' }],
  manufacturer: [{ key: 'man_made', value: 'works' }, { key: 'industrial', value: 'factory' }],
  factory: [{ key: 'man_made', value: 'works' }, { key: 'industrial', value: 'factory' }],
  'hardware-store': [{ key: 'shop', value: 'hardware' }, { key: 'shop', value: 'doityourself' }],
});

/**
 * @param {string} id
 * @returns {object|undefined} the enriched catalog type (with `group`, `i18nKey`)
 *   or `undefined` when the id is unknown.
 */
export function getType(id) {
  if (typeof id !== 'string') return undefined;
  return TYPE_INDEX.get(id);
}

/** @param {string} id @returns {boolean} */
export function isValidType(id) {
  return typeof id === 'string' && TYPE_INDEX.has(id);
}

/**
 * Sanitize a free-text custom business type (design §78): trim, collapse
 * whitespace, strip control characters and characters that could be abused for
 * query/operator injection, and bound the length to {@link MAX_CUSTOM_TYPE_LENGTH}.
 *
 * @param {string} str
 * @returns {string|null} the cleaned value, or `null` when empty/invalid.
 */
export function sanitizeCustomType(str) {
  if (typeof str !== 'string') return null;
  const cleaned = str
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ') // control chars → space
    .replace(/[<>{}[\]\\|`$;]/g, ' ') // injection-risky punctuation → space
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CUSTOM_TYPE_LENGTH)
    .trim();
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Resolve a business type (catalog id OR custom free text) plus an optional
 * keyword into the provider query shape.
 *
 * Rules (design §3, §6):
 *  - Catalog type with `includedType`, no keyword → `{ includedType }` (the
 *    provider uses `searchNearby`).
 *  - Catalog type with `includedType` + keyword → `{ includedType, textQuery }`
 *    (the provider uses `searchText`, which accepts both, so the keyword is
 *    honored while still restricting to the structured type).
 *  - Catalog type with only `textQuery` → `{ textQuery }` (keyword appended).
 *  - Custom free text → `{ textQuery }` built from the sanitized text (+ keyword).
 *
 * @param {string} typeOrCustom - a catalog id or a custom business-type string.
 * @param {string} [keyword] - optional refinement (sanitized, bounded).
 * @returns {{ includedType?: string, textQuery?: string }}
 * @throws {Error} with `.code === 'INVALID_BUSINESS_TYPE'` when nothing usable
 *   can be derived.
 */
export function resolveProviderQuery(typeOrCustom, keyword) {
  const cleanKeyword = sanitizeCustomType(keyword);
  const catalogType = getType(typeOrCustom);

  if (catalogType) {
    const osmTags = OSM_TAGS_BY_TYPE[catalogType.id] || [];
    if (catalogType.includedType) {
      const result = { includedType: catalogType.includedType, typeId: catalogType.id, osmTags };
      if (cleanKeyword) {
        result.textQuery = `${catalogType.name} ${cleanKeyword}`;
      }
      return result;
    }
    // Catalog type without a structured mapping → text search.
    const base = catalogType.textQuery || catalogType.name;
    return { textQuery: cleanKeyword ? `${base} ${cleanKeyword}` : base, typeId: catalogType.id, osmTags };
  }

  // Custom / unsupported type → sanitized text query.
  const cleanCustom = sanitizeCustomType(typeOrCustom);
  if (cleanCustom) {
    return { textQuery: cleanKeyword ? `${cleanCustom} ${cleanKeyword}` : cleanCustom, typeId: null, osmTags: [] };
  }
  // Nothing from the type, but a keyword alone can still drive a text search.
  if (cleanKeyword) {
    return { textQuery: cleanKeyword, typeId: null, osmTags: [] };
  }

  const err = new Error('A valid business type, custom type or keyword is required');
  err.code = 'INVALID_BUSINESS_TYPE';
  throw err;
}

/**
 * Guard broad Google secondary-type matches for hierarchical picker categories.
 * For example, a shopping mall may expose `restaurant` as a secondary type; it
 * should not be presented as a restaurant. Restaurant/hotel/school subtypes are
 * accepted through their primary-type suffixes.
 */
export function matchesProviderType(business, includedType) {
  if (!includedType) return true;
  if (business?.source === 'OPENSTREETMAP' || business?.providerName === 'openstreetmap') return true;
  const primary = business?.primaryType || null;
  const types = Array.isArray(business?.types) ? business.types : [];
  if (!types.includes(includedType) && primary !== includedType) return false;
  if (includedType === 'restaurant') return primary === 'restaurant' || primary?.endsWith('_restaurant');
  if (includedType === 'hotel') return primary === 'hotel' || primary?.endsWith('_hotel');
  if (includedType === 'school') return primary === 'school' || primary?.endsWith('_school');
  return true;
}

export function resolveOsmTags(typeOrCustom) {
  const catalogType = getType(typeOrCustom);
  return catalogType ? [...(OSM_TAGS_BY_TYPE[catalogType.id] || [])] : [];
}

export default {
  CATALOG,
  getType,
  isValidType,
  resolveProviderQuery,
  resolveOsmTags,
  matchesProviderType,
  sanitizeCustomType,
};
