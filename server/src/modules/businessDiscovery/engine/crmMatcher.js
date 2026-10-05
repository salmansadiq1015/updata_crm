/**
 * CRM matcher for Business Discovery (Module 15).
 *
 * Classifies a discovered business against the EXISTING CRM (leads + customers)
 * using the dedup ladder (design §8):
 *   1. Google Place ID   → EXISTING (1.0)   strong
 *   2. Normalized phone   → EXISTING (0.95)  strong   (leads AND customers)
 *   3. Website domain     → EXISTING (0.9)   strong   (leads)
 *   4. Name + postal (+geo proximity < ~150 m) → POSSIBLE_DUPLICATE (0.6–0.8)  weak
 *   5. else               → NEW
 *
 * SCOPING: matching is GLOBAL / company-wide (single-tenant — a business is
 * either in the CRM or not, regardless of who added it). Every lookup runs
 * WITHOUT a `createdBy` filter.
 *
 * Strong identity (placeId / phone / website) marks EXISTING. Weak signals
 * (name + address ± geo) only ever reach POSSIBLE_DUPLICATE and are NEVER
 * auto-merged — a human must confirm (design §8).
 *
 * This module touches repositories/models (not pure), hence the singleton.
 *
 * References: LEAD_GENERATION_DESIGN.md §8 (dedup ladder), §9 (idempotency).
 */

import leadRepository from '../../crm/lead.repository.js';
import customerRepository from '../../crm/customer.repository.js';
import Lead from '../../crm/lead.model.js';
import Customer from '../../crm/customer.model.js';
import { normalizePhone } from './normalizer.js';
import { haversineMeters } from './geometry.js';
import { RESULT_MATCHING_STATUS, RESULT_MATCH_METHOD } from '../discoveryResult.model.js';

// Confidence constants mirror the repository ladder (lead.repository.findDuplicates).
const CONFIDENCE = Object.freeze({
  PLACE_ID: 1.0,
  PHONE: 0.95,
  WEBSITE: 0.9,
  NAME_ADDRESS_WITH_POSTAL: 0.75,
  NAME_ADDRESS: 0.6,
  GEO: 0.8,
});

// Methods that assert strong identity → EXISTING.
const STRONG_METHODS = new Set([
  RESULT_MATCH_METHOD.PLACE_ID,
  RESULT_MATCH_METHOD.PHONE,
  RESULT_MATCH_METHOD.WEBSITE,
]);

// Two coordinates closer than this confirm a weak name+address match (design §8).
const GEO_PROXIMITY_METERS = 150;

const hasValue = (v) => v !== undefined && v !== null && v !== '';

/** Pull the comparable fields out of a normalized business sub-doc. */
function extract(business, placeIdArg) {
  const b = business || {};
  const coords = Array.isArray(b.location?.coordinates) && b.location.coordinates.length >= 2
    ? b.location.coordinates
    : null;
  return {
    name: hasValue(b.name) ? b.name : null,
    normalizedName: hasValue(b.normalizedName) ? b.normalizedName : null,
    normalizedPhone: hasValue(b.normalizedPhone) ? b.normalizedPhone : null,
    websiteDomain: hasValue(b.websiteDomain) ? b.websiteDomain : null,
    postalCode: hasValue(b.address?.postalCode) ? b.address.postalCode : null,
    coords,
    placeId: placeIdArg ?? b.provider?.placeId ?? b.placeId ?? null,
  };
}

/**
 * Customers have no stored `normalizedPhone`, so we match an E.164 phone against
 * the raw `phone` / `mobile` columns via a small set of equivalent string forms
 * (E.164, digits-only, national). A fast, indexed-friendly exact match — not a
 * full normalization sweep (documented limitation; design §8).
 */
function phoneCandidates(e164) {
  if (!hasValue(e164)) return [];
  const set = new Set([e164]);
  const digits = String(e164).replace(/\D/g, '');
  if (digits) {
    set.add(digits);
    set.add(`+${digits}`);
  }
  const national = normalizePhone(e164).national;
  if (national) set.add(national);
  return [...set];
}

const withinGeo = (coords, location) => {
  const c = location?.coordinates;
  return !!coords && Array.isArray(c) && c.length >= 2 && haversineMeters(coords, c) <= GEO_PROXIMITY_METERS;
};

/**
 * Pure decision step shared by {@link classify} and {@link classifyBatch}.
 * Given the gathered signals, produce the classification result.
 */
function decide({
  strongLeadMatches = [],
  customerPhoneDoc = null,
  leadNameMatches = [],
  customerNameDocs = [],
  geoConfirmedLeadIds = [],
  postalCode = null,
}) {
  const matchedBy = [];
  let matchedLeadId = null;
  let matchedCustomerId = null;

  for (const m of strongLeadMatches) {
    if (!matchedLeadId) matchedLeadId = m.lead._id;
    matchedBy.push({ method: m.method, confidence: m.confidence });
  }
  if (customerPhoneDoc) {
    if (!matchedCustomerId) matchedCustomerId = customerPhoneDoc._id;
    matchedBy.push({ method: RESULT_MATCH_METHOD.PHONE, confidence: CONFIDENCE.PHONE });
  }
  const hasStrong = strongLeadMatches.length > 0 || !!customerPhoneDoc;

  const hasName = leadNameMatches.length > 0 || customerNameDocs.length > 0;
  if (hasName) {
    matchedBy.push({
      method: RESULT_MATCH_METHOD.NAME_ADDRESS,
      confidence: postalCode ? CONFIDENCE.NAME_ADDRESS_WITH_POSTAL : CONFIDENCE.NAME_ADDRESS,
    });
    if (!matchedLeadId && leadNameMatches.length) matchedLeadId = leadNameMatches[0].lead._id;
    if (!matchedCustomerId && customerNameDocs.length) matchedCustomerId = customerNameDocs[0]._id;
  }
  const hasGeo = geoConfirmedLeadIds.length > 0;
  if (hasGeo) {
    matchedBy.push({ method: RESULT_MATCH_METHOD.GEO, confidence: CONFIDENCE.GEO });
    if (!matchedLeadId) matchedLeadId = geoConfirmedLeadIds[0];
  }

  let status;
  if (hasStrong) status = RESULT_MATCHING_STATUS.EXISTING;
  else if (hasName || hasGeo) status = RESULT_MATCHING_STATUS.POSSIBLE_DUPLICATE;
  else status = RESULT_MATCHING_STATUS.NEW;

  const result = { status, matchedBy };
  if (matchedLeadId) result.matchedLeadId = matchedLeadId;
  if (matchedCustomerId) result.matchedCustomerId = matchedCustomerId;
  return result;
}

class CrmMatcher {
  /**
   * Find company-wide customers whose phone/mobile match any of the given E.164
   * numbers. Returns a Map keyed by the confirmed E.164 → customer doc.
   */
  async _customerPhoneMap(e164s) {
    const candidates = new Set();
    for (const e164 of e164s) {
      for (const c of phoneCandidates(e164)) candidates.add(c);
    }
    if (candidates.size === 0) return new Map();

    const list = [...candidates];
    const docs = await Customer.find({
      $or: [{ phone: { $in: list } }, { mobile: { $in: list } }],
    })
      .select('_id customerNumber name phone mobile postalCode')
      .lean();

    // Confirm by re-normalizing each candidate's stored number to E.164.
    const map = new Map();
    for (const doc of docs) {
      for (const raw of [doc.phone, doc.mobile]) {
        if (!hasValue(raw)) continue;
        const e = normalizePhone(raw).e164;
        if (e && !map.has(e)) map.set(e, doc);
      }
    }
    return map;
  }

  /**
   * Classify a single normalized business sub-doc against the CRM (GLOBAL).
   *
   * @param {object} business - normalized business sub-doc (name, normalizedName,
   *   normalizedPhone, websiteDomain, address.postalCode, location, provider.placeId).
   * @param {object} [opts]
   * @param {string} [opts.placeId] - provider place id, when passed alongside.
   * @returns {Promise<{ status: string, matchedLeadId?: any, matchedCustomerId?: any,
   *   matchedBy: Array<{ method: string, confidence: number }> }>}
   */
  async classify(business, { placeId: placeIdArg } = {}) {
    const { name, normalizedPhone, websiteDomain, postalCode, coords, placeId } = extract(business, placeIdArg);

    // GLOBAL lookups — no createdBy. The lead ladder (placeId/phone/website/name)
    // is one repository call; customer phone + customer name run alongside.
    const [leadMatches, customerPhoneMap, customerNameDocs] = await Promise.all([
      leadRepository.findDuplicates({ googlePlaceId: placeId, normalizedPhone, websiteDomain, name, postalCode }),
      normalizedPhone ? this._customerPhoneMap([normalizedPhone]) : Promise.resolve(new Map()),
      name ? customerRepository.findDuplicates(name, postalCode) : Promise.resolve([]),
    ]);

    const strongLeadMatches = leadMatches.filter((m) => STRONG_METHODS.has(m.method));
    const leadNameMatches = leadMatches.filter((m) => m.method === RESULT_MATCH_METHOD.NAME_ADDRESS);
    const customerPhoneDoc = normalizedPhone ? customerPhoneMap.get(normalizedPhone) || null : null;

    // Geo-confirm weak name matches: the repository's name rung does not return
    // the lead location, so fetch coordinates for just those candidates.
    let geoConfirmedLeadIds = [];
    if (coords && leadNameMatches.length) {
      const ids = leadNameMatches.map((m) => m.lead._id);
      const located = await Lead.find({ _id: { $in: ids } }).select('_id location').lean();
      geoConfirmedLeadIds = located.filter((l) => withinGeo(coords, l.location)).map((l) => l._id);
    }

    return decide({ strongLeadMatches, customerPhoneDoc, leadNameMatches, customerNameDocs, geoConfirmedLeadIds, postalCode });
  }

  /**
   * Classify a batch of businesses, aligned to the input order.
   *
   * Batching (avoids N+1): the strong rungs run as ONE query each across the
   * whole batch, feeding in-memory maps —
   *   - PLACE_ID : leadRepository.findByPlaceIds(allPlaceIds)
   *   - PHONE    : Lead.find({ normalizedPhone: $in }) + one customer phone sweep
   *   - WEBSITE  : Lead.find({ websiteDomain: $in })
   *   - NAME+GEO : Lead.find({ normalizedName: $in }) (selects location for geo)
   * The weak CUSTOMER name rung is regex-based and cannot be batched cheaply, so
   * it runs per business — but ONLY for businesses with no strong match (a strong
   * match already settles EXISTING), bounding it to the ambiguous subset.
   *
   * @param {Array<object>} businesses - normalized business sub-docs.
   * @param {object} [opts]
   * @param {Array<string>} [opts.placeIds] - place ids aligned to `businesses`.
   * @returns {Promise<Array<object>>} results aligned to `businesses`.
   */
  async classifyBatch(businesses = [], { placeIds } = {}) {
    if (!Array.isArray(businesses) || businesses.length === 0) return [];

    const rows = businesses.map((business, i) => extract(business, placeIds ? placeIds[i] : undefined));

    const uniq = (values) => [...new Set(values.filter(hasValue))];
    const allPlaceIds = uniq(rows.map((r) => r.placeId));
    const allPhones = uniq(rows.map((r) => r.normalizedPhone));
    const allDomains = uniq(rows.map((r) => r.websiteDomain));
    const allNames = uniq(rows.map((r) => r.normalizedName));

    // One query per strong rung across the whole batch.
    const [placeLeads, phoneLeads, websiteLeads, nameLeads, customerPhoneMap] = await Promise.all([
      allPlaceIds.length ? leadRepository.findByPlaceIds(allPlaceIds) : Promise.resolve([]),
      allPhones.length
        ? Lead.find({ normalizedPhone: { $in: allPhones } }).select('_id normalizedPhone').lean()
        : Promise.resolve([]),
      allDomains.length
        ? Lead.find({ websiteDomain: { $in: allDomains } }).select('_id websiteDomain').lean()
        : Promise.resolve([]),
      allNames.length
        ? Lead.find({ normalizedName: { $in: allNames } }).select('_id normalizedName address.postalCode location').lean()
        : Promise.resolve([]),
      allPhones.length ? this._customerPhoneMap(allPhones) : Promise.resolve(new Map()),
    ]);

    const placeMap = new Map();
    for (const l of placeLeads) {
      const pid = l.sourceMetadata?.googlePlaceId;
      if (pid && !placeMap.has(pid)) placeMap.set(pid, l);
    }
    const firstByKey = (list, keyPath) => {
      const map = new Map();
      for (const doc of list) {
        const key = keyPath(doc);
        if (hasValue(key) && !map.has(key)) map.set(key, doc);
      }
      return map;
    };
    const phoneMap = firstByKey(phoneLeads, (d) => d.normalizedPhone);
    const websiteMap = firstByKey(websiteLeads, (d) => d.websiteDomain);

    const nameMap = new Map();
    for (const l of nameLeads) {
      if (!hasValue(l.normalizedName)) continue;
      if (!nameMap.has(l.normalizedName)) nameMap.set(l.normalizedName, []);
      nameMap.get(l.normalizedName).push(l);
    }

    const out = new Array(businesses.length);
    for (let i = 0; i < businesses.length; i++) {
      const r = rows[i];

      const strongLeadMatches = [];
      if (r.placeId && placeMap.has(r.placeId)) {
        strongLeadMatches.push({ method: RESULT_MATCH_METHOD.PLACE_ID, confidence: CONFIDENCE.PLACE_ID, lead: placeMap.get(r.placeId) });
      }
      if (r.normalizedPhone && phoneMap.has(r.normalizedPhone)) {
        strongLeadMatches.push({ method: RESULT_MATCH_METHOD.PHONE, confidence: CONFIDENCE.PHONE, lead: phoneMap.get(r.normalizedPhone) });
      }
      if (r.websiteDomain && websiteMap.has(r.websiteDomain)) {
        strongLeadMatches.push({ method: RESULT_MATCH_METHOD.WEBSITE, confidence: CONFIDENCE.WEBSITE, lead: websiteMap.get(r.websiteDomain) });
      }
      const customerPhoneDoc = r.normalizedPhone ? customerPhoneMap.get(r.normalizedPhone) || null : null;

      // Weak lead name matches (+ geo) from the batched name query.
      const nameCandidates = r.normalizedName ? nameMap.get(r.normalizedName) || [] : [];
      const leadNameMatches = nameCandidates
        .filter((l) => !r.postalCode || l.address?.postalCode === r.postalCode)
        .map((l) => ({ method: RESULT_MATCH_METHOD.NAME_ADDRESS, confidence: CONFIDENCE.NAME_ADDRESS, lead: l }));
      const geoConfirmedLeadIds = r.coords
        ? leadNameMatches.filter((m) => withinGeo(r.coords, m.lead.location)).map((m) => m.lead._id)
        : [];

      const hasStrong = strongLeadMatches.length > 0 || !!customerPhoneDoc;
      // Customer name rung: regex, per-business, only when still ambiguous (a
      // strong match already settles EXISTING, so this stays bounded).
      const customerNameDocs = !hasStrong && r.name
        ? await customerRepository.findDuplicates(r.name, r.postalCode)
        : [];

      out[i] = decide({ strongLeadMatches, customerPhoneDoc, leadNameMatches, customerNameDocs, geoConfirmedLeadIds, postalCode: r.postalCode });
    }

    return out;
  }
}

const crmMatcher = new CrmMatcher();
export default crmMatcher;
export { CrmMatcher };
