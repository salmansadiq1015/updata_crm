import Lead from './lead.model.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';

// Build a regex where each letter also matches its accented variants, e.g.
// "mull" → "[mM][uüùûú][lL][lL]" so it matches "Müller". With $options:'i'
// this gives accent + case insensitive search (mirrors customer.repository).
const ACCENT_GROUPS = [
  'aäàâáå', 'oöòôó', 'uüùûú', 'eèêéë', 'iìîíï', 'cç', 'nñ', 'sß',
];
const ACCENT_MAP = {};
for (const group of ACCENT_GROUPS) {
  const cls = `[${group}]`;
  for (const ch of group) ACCENT_MAP[ch] = cls;
}

function accentSafeRegex(term) {
  let result = '';
  for (const ch of term) {
    const lower = ch.toLowerCase();
    if (ACCENT_MAP[lower]) result += ACCENT_MAP[lower];
    else if (/[.*+?^${}()|[\]\\]/.test(ch)) result += `\\${ch}`;
    else result += ch;
  }
  return result;
}

const ALLOWED_FILTERS = {
  status: 'exact',
  assignedTo: 'objectId',
  source: 'exact',
  type: 'exact',
};

const ALLOWED_SORT_FIELDS = ['createdAt', 'name', 'status', '_id'];

const DUPLICATE_SELECT = '_id leadNumber name status source normalizedPhone websiteDomain address sourceMetadata';

// Referenced users come back display-only: enough to name a person (the e-mail
// is the fallback), never the whole user document.
const USER_REF_SELECT = 'firstName lastName email';

// createdBy (provenance) and assignedTo (ownership) resolve to the user. The
// User model hides soft-deleted accounts from every find unless `includeDeleted`
// is set, so without it a lead would stop naming the person who created it once
// that account is removed, and one assigned to them would read as unassigned.
const POPULATE = [
  { path: 'createdBy', select: USER_REF_SELECT, options: { includeDeleted: true } },
  { path: 'assignedTo', select: USER_REF_SELECT, options: { includeDeleted: true } },
];

function combineFilters(...filters) {
  const active = filters.filter((filter) => filter && Object.keys(filter).length > 0);
  if (active.length === 0) return {};
  if (active.length === 1) return active[0];
  return { $and: active };
}

class LeadRepository {
  async create(data) {
    const lead = new Lead(data);
    return lead.save();
  }

  async getById(id, { createdBy } = {}) {
    const filter = { _id: id };
    if (createdBy) filter.createdBy = createdBy;
    return Lead.findOne(filter).populate(POPULATE).lean();
  }

  async list({
    cursor,
    limit = 25,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    filters = {},
    search,
    createdBy,
  } = {}) {
    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';

    // `city` is a friendly API filter name, while the stored field is nested.
    // Pull it out before buildFilter so an arbitrary client key can never be
    // forwarded to MongoDB. Values originate from the validated query (or the
    // server-generated filter-options response) and are matched exactly.
    const { city, ...flatFilters } = filters;

    const baseFilter = {
      ...(createdBy ? { createdBy } : {}),
      ...buildFilter(flatFilters, ALLOWED_FILTERS),
    };
    const placeFilter = city ? {
      $or: [
        { 'address.city': city },
        { 'sourceMetadata.discoveryLocation.city': city },
        { 'sourceMetadata.discoveryLocation.name': city },
        { 'sourceMetadata.discoveryLocation.formattedAddress': city },
      ],
    } : {};

    let searchFilter = {};
    if (search) {
      const pattern = accentSafeRegex(search);
      const regex = { $regex: pattern, $options: 'i' };
      searchFilter = {
        $or: [
          { name: regex },
          { leadNumber: regex },
          { email: regex },
          { phone: regex },
          { 'address.city': regex },
          { 'sourceMetadata.discoveryLocation.name': regex },
          { 'sourceMetadata.discoveryLocation.city': regex },
          { 'sourceMetadata.discoveryLocation.formattedAddress': regex },
        ],
      };
    }

    const filter = combineFilters(
      baseFilter,
      placeFilter,
      searchFilter,
      buildCursorQuery(cursor, safeSortBy, sortOrder),
    );

    const docs = await Lead.find(filter)
      .sort(buildCursorSort(safeSortBy, sortOrder))
      .limit(limit + 1)
      .select('-__v')
      .populate(POPULATE)
      .lean();

    return buildCursorResponse(docs, limit, safeSortBy);
  }

  /**
   * Database-backed values for list filters. Aggregation middleware does not
   * run Mongoose's soft-delete `find` hook, so `isDeleted:false` is explicit.
   * Places are grouped by city (the actual list filter) and include all canton
   * codes found for that city plus a lead count for a useful, honest menu.
   */
  async getFilterOptions() {
    const [facets] = await Lead.aggregate([
      { $match: { isDeleted: false } },
      {
        $facet: {
          places: [
            {
              $project: {
                place: {
                  $switch: {
                    branches: [
                      {
                        case: { $gt: [{ $strLenCP: { $ifNull: ['$sourceMetadata.discoveryLocation.city', ''] } }, 0] },
                        then: '$sourceMetadata.discoveryLocation.city',
                      },
                      {
                        case: { $gt: [{ $strLenCP: { $ifNull: ['$sourceMetadata.discoveryLocation.name', ''] } }, 0] },
                        then: '$sourceMetadata.discoveryLocation.name',
                      },
                      {
                        case: { $gt: [{ $strLenCP: { $ifNull: ['$sourceMetadata.discoveryLocation.formattedAddress', ''] } }, 0] },
                        then: '$sourceMetadata.discoveryLocation.formattedAddress',
                      },
                      {
                        case: { $gt: [{ $strLenCP: { $ifNull: ['$address.city', ''] } }, 0] },
                        then: '$address.city',
                      },
                    ],
                    default: null,
                  },
                },
                canton: '$address.canton',
              },
            },
            { $match: { place: { $type: 'string', $ne: '' } } },
            {
              $group: {
                _id: '$place',
                count: { $sum: 1 },
                cantons: { $addToSet: '$canton' },
              },
            },
            { $sort: { _id: 1 } },
          ],
          types: [
            { $match: { type: { $in: ['business', 'private'] } } },
            { $group: { _id: '$type', count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    return {
      places: (facets?.places ?? []).map((place) => ({
        city: place._id,
        cantons: (place.cantons ?? []).filter(Boolean).sort(),
        count: place.count,
      })),
      types: (facets?.types ?? []).map((type) => ({ value: type._id, count: type.count })),
    };
  }

  async update(id, data, { createdBy } = {}) {
    const filter = { _id: id };
    if (createdBy) filter.createdBy = createdBy;
    // Populated like getById/list: the client replaces its cached lead with this
    // response, so an unpopulated one would drop the creator's name from the UI.
    return Lead.findOneAndUpdate(filter, data, {
      returnDocument: 'after',
      runValidators: true,
    }).populate(POPULATE).lean();
  }

  async softDelete(id, { createdBy } = {}) {
    const filter = { _id: id };
    if (createdBy) filter.createdBy = createdBy;
    return Lead.findOneAndUpdate(
      filter,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }

  /**
   * Dedup ladder (highest confidence first): placeId → phone → website →
   * name(+postal). Returns an ordered, de-duplicated list of
   * { method, confidence, lead } candidates. Scoped by createdBy when given.
   */
  async findDuplicates({
    name,
    postalCode,
    normalizedPhone,
    websiteDomain,
    googlePlaceId,
    createdBy,
  } = {}) {
    const scope = createdBy ? { createdBy } : {};
    const seen = new Set();
    const matches = [];

    const push = (docs, method, confidence) => {
      for (const doc of docs) {
        const key = String(doc._id);
        if (seen.has(key)) continue;
        seen.add(key);
        matches.push({ method, confidence, lead: doc });
      }
    };

    if (googlePlaceId) {
      const docs = await Lead.find({
        ...scope,
        source: 'google_places',
        'sourceMetadata.googlePlaceId': googlePlaceId,
      }).select(DUPLICATE_SELECT).limit(10).lean();
      push(docs, 'PLACE_ID', 1.0);
    }

    if (normalizedPhone) {
      const docs = await Lead.find({ ...scope, normalizedPhone })
        .select(DUPLICATE_SELECT).limit(10).lean();
      push(docs, 'PHONE', 0.95);
    }

    if (websiteDomain) {
      const docs = await Lead.find({ ...scope, websiteDomain })
        .select(DUPLICATE_SELECT).limit(10).lean();
      push(docs, 'WEBSITE', 0.9);
    }

    if (name) {
      const nameFilter = { ...scope, name: { $regex: accentSafeRegex(name), $options: 'i' } };
      if (postalCode) nameFilter['address.postalCode'] = postalCode;
      const docs = await Lead.find(nameFilter).select(DUPLICATE_SELECT).limit(10).lean();
      push(docs, 'NAME_ADDRESS', postalCode ? 0.75 : 0.6);
    }

    return matches;
  }

  /**
   * Bulk insert leads, ordered:false so one bad row does not abort the batch.
   * Returns per-row outcome: created docs plus captured write errors (e.g. the
   * unique partial googlePlaceId index → duplicate-key, mapped to SKIPPED by the
   * import service).
   */
  async bulkCreate(docs = []) {
    if (!docs.length) {
      return { created: [], errors: [], insertedCount: 0, failedCount: 0 };
    }

    try {
      const inserted = await Lead.insertMany(docs, { ordered: false });
      return { created: inserted, errors: [], insertedCount: inserted.length, failedCount: 0 };
    } catch (err) {
      // ordered:false → partial success. Mongoose exposes insertedDocs and
      // writeErrors on the thrown error.
      const created = err.insertedDocs || [];
      const writeErrors = err.writeErrors
        || err.result?.result?.writeErrors
        || [];
      const errors = writeErrors.map((writeError) => {
        const info = writeError.err || writeError;
        return {
          index: info.index,
          code: info.code,
          message: info.errmsg || info.message || 'Insert failed',
          placeId: info.op?.sourceMetadata?.googlePlaceId ?? null,
        };
      });
      return { created, errors, insertedCount: created.length, failedCount: errors.length };
    }
  }

  async findByPlaceIds(placeIds = [], { createdBy } = {}) {
    if (!placeIds.length) return [];
    const filter = {
      source: 'google_places',
      'sourceMetadata.googlePlaceId': { $in: placeIds },
    };
    if (createdBy) filter.createdBy = createdBy;
    return Lead.find(filter)
      .select('_id leadNumber name status source sourceMetadata.googlePlaceId')
      .lean();
  }
}

const leadRepository = new LeadRepository();
export default leadRepository;
