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
    if (catalogType.includedType) {
      const result = { includedType: catalogType.includedType };
      if (cleanKeyword) {
        result.textQuery = `${catalogType.name} ${cleanKeyword}`;
      }
      return result;
    }
    // Catalog type without a structured mapping → text search.
    const base = catalogType.textQuery || catalogType.name;
    return { textQuery: cleanKeyword ? `${base} ${cleanKeyword}` : base };
  }

  // Custom / unsupported type → sanitized text query.
  const cleanCustom = sanitizeCustomType(typeOrCustom);
  if (cleanCustom) {
    return { textQuery: cleanKeyword ? `${cleanCustom} ${cleanKeyword}` : cleanCustom };
  }
  // Nothing from the type, but a keyword alone can still drive a text search.
  if (cleanKeyword) {
    return { textQuery: cleanKeyword };
  }

  const err = new Error('A valid business type, custom type or keyword is required');
  err.code = 'INVALID_BUSINESS_TYPE';
  throw err;
}

export default {
  CATALOG,
  getType,
  isValidType,
  resolveProviderQuery,
  sanitizeCustomType,
};
