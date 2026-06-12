import { SWISS_PLZ_DIRECTORY } from './swissPlz.data.js';

const STREET_SUFFIX_MAP = {
  str: 'Strasse',
  'str.': 'Strasse',
  strasse: 'Strasse',
 straße: 'Strasse',
  gasse: 'Gasse',
  weg: 'Weg',
  platz: 'Platz',
  allee: 'Allee',
  rue: 'Rue',
  avenue: 'Avenue',
  via: 'Via',
  vicolo: 'Vicolo',
};

/**
 * Parse and validate Swiss addresses from free text.
 */
class SwissPlzService {
  /**
   * @param {string} text - Address utterance or entity value
   * @returns {{
   *   street: string|null,
   *   houseNumber: string|null,
   *   postalCode: string|null,
   *   city: string|null,
   *   canton: string|null,
   *   line2: string|null,
   *   isValid: boolean,
   *   validationErrors: string[],
   * }}
   */
  parseAddress(text) {
    const validationErrors = [];
    if (!text?.trim()) {
      return {
        street: null, houseNumber: null, postalCode: null, city: null, canton: null,
        line2: null, isValid: false, validationErrors: ['empty_address'],
      };
    }

    let working = text.trim().replace(/\s+/g, ' ');
    let line2 = null;

    const coMatch = working.match(/\b(c\/o|co\.?|bei)\s+([^,]+)/i);
    if (coMatch) {
      line2 = coMatch[0].trim();
      working = working.replace(coMatch[0], '').replace(/,\s*,/g, ',').trim();
    }

    const aptMatch = working.match(/\b(wohnung|apt\.?|apartment|appartement)\s*(\d+[a-z]?)/i);
    if (aptMatch) {
      line2 = line2 ? `${line2}, ${aptMatch[0]}` : aptMatch[0];
      working = working.replace(aptMatch[0], '').trim();
    }

    const plzMatch = working.match(/\b([1-9]\d{3})\b/);
    const postalCode = plzMatch ? plzMatch[1] : null;

    let city = null;
    let canton = null;
    if (postalCode) {
      const plzEntry = SWISS_PLZ_DIRECTORY[Number(postalCode)];
      if (plzEntry) {
        city = plzEntry.city;
        canton = plzEntry.canton;
      } else {
        validationErrors.push('unknown_plz');
      }

      const afterPlz = working.slice(working.indexOf(postalCode) + 4).replace(/^[\s,]+/, '');
      if (afterPlz && !city) {
        city = this._normalizeCity(afterPlz.split(',')[0].trim());
      } else if (afterPlz && city) {
        const spokenCity = this._normalizeCity(afterPlz.split(',')[0].trim());
        if (spokenCity && !this._citiesMatch(spokenCity, city)) {
          validationErrors.push('plz_city_mismatch');
        }
      }
    }

    const beforePlz = postalCode
      ? working.slice(0, working.indexOf(postalCode)).replace(/,\s*$/, '').trim()
      : working;

    let street = null;
    let houseNumber = null;
    const streetMatch = beforePlz.match(/^(.+?)\s+(\d+[a-zA-Z]?(-\d+)?)$/);
    if (streetMatch) {
      street = this._normalizeStreet(streetMatch[1].trim());
      houseNumber = streetMatch[2];
    } else if (beforePlz) {
      street = this._normalizeStreet(beforePlz);
    }

    const isValid = !!(street && postalCode && city && canton && validationErrors.length === 0);

    return {
      street,
      houseNumber,
      postalCode,
      city,
      canton,
      line2,
      isValid,
      validationErrors,
    };
  }

  validatePlzCity(postalCode, city) {
    const entry = SWISS_PLZ_DIRECTORY[Number(postalCode)];
    if (!entry) return { valid: false, reason: 'unknown_plz' };
    if (!this._citiesMatch(city, entry.city)) {
      return { valid: false, reason: 'plz_city_mismatch', expectedCity: entry.city, canton: entry.canton };
    }
    return { valid: true, canton: entry.canton, city: entry.city };
  }

  getCantonForPlz(postalCode) {
    return SWISS_PLZ_DIRECTORY[Number(postalCode)]?.canton || null;
  }

  _normalizeStreet(street) {
    if (!street) return null;
    return street.split(' ').map((part, i, arr) => {
      const lower = part.toLowerCase();
      if (i === arr.length - 1 && STREET_SUFFIX_MAP[lower]) {
        return STREET_SUFFIX_MAP[lower];
      }
      if (i === arr.length - 1 && /(str\.?|str)$/i.test(part)) {
        const base = part.replace(/str\.?$/i, '');
        return `${base}Strasse`;
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }).join(' ');
  }

  _normalizeCity(city) {
    if (!city) return null;
    return city
      .replace(/zuerich/gi, 'Zürich')
      .replace(/zurich/gi, 'Zürich')
      .replace(/genf/gi, 'Genève')
      .replace(/geneve/gi, 'Genève')
      .replace(/bern/gi, 'Bern')
      .replace(/basel/gi, 'Basel')
      .replace(/luzern/gi, 'Luzern')
      .trim();
  }

  _citiesMatch(a, b) {
    if (!a || !b) return false;
    const na = a.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    const nb = b.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    return na === nb || na.includes(nb) || nb.includes(na);
  }
}

const swissPlzService = new SwissPlzService();
export default swissPlzService;
