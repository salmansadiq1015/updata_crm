import Lead, { LEAD_STATUS } from './lead.model.js';
import LeadFollowUp, { FOLLOW_UP_OPEN_STATUSES } from './leadFollowUp.model.js';
import { normalizeName } from '../businessDiscovery/engine/normalizer.js';
import { businessIdentityKeys, googleIdentityKeys, identityAfterPatch, sameBusinessIdentity } from './leadIdentity.js';
import {
  buildCursorQuery,
  buildCursorSort,
  buildCursorResponse,
} from '../../shared/utils/pagination.js';
import { buildFilter } from '../../shared/utils/queryBuilder.js';
import { currentLeadAccessFilter } from '../../shared/security/requestAccessContext.js';
import { buildGeographyFacets, canonicalizeLeadAddress, countGeographyFacets } from './leadGeography.js';
import { cachedLeadAggregate } from './leadCache.js';

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

function normalizedExactTextFilter(path, value) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) return {};
  const pattern = normalized.split(' ').map(accentSafeRegex).join('\\s+');
  return { [path]: { $regex: `^\\s*${pattern}\\s*$`, $options: 'i' } };
}

const ALLOWED_FILTERS = {
  status: 'exact',
  slaStatus: 'exact',
  assignedTo: 'objectId',
  source: 'exact',
  type: 'exact',
};

// scoreValue: denormalized lead score (-1 = unscored) — see leadScoring.service.
const ALLOWED_SORT_FIELDS = ['createdAt', 'name', 'status', '_id', 'scoreValue'];

const DUPLICATE_SELECT = '_id leadNumber name status source normalizedPhone websiteDomain address sourceMetadata';

// Lightweight projection for the map: everything the map markers / sidebar list /
// preview popover and their quick actions need, and nothing heavy (no notes,
// enrichment arrays, discovery geometry or __v). The detail drawer still fetches
// the full lead by id when a lead is opened.
const MAP_SELECT = [
  '_id', 'leadNumber', 'name', 'type', 'status', 'source',
  'address', 'phone', 'mobile', 'email', 'website', 'websiteDomain',
  'location', 'providerMeta', 'assignedTo', 'sourceMetadata.googlePlaceId',
  'tags', 'createdAt', 'convertedCustomerId', 'convertedAt',
].join(' ');

// Hard ceiling on how many leads one map request returns. Clustering keeps the
// canvas responsive well beyond this; the ceiling only bounds payload + memory.
const MAP_HARD_CAP = 5000;

// A lead counts as "mapped" when its GeoJSON Point actually has coordinates.
// location defaults to undefined (the sub-document is absent until a point is
// set), so testing coordinates[0] cleanly splits located from unlocated leads.
const HAS_COORDINATES = { 'location.coordinates.0': { $exists: true } };
const NO_COORDINATES = { 'location.coordinates.0': { $exists: false } };

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

// One row per distinct raw place tuple shown in the table.
const GEO_TUPLE_GROUP = {
  $group: {
    _id: { country: '$address.country', city: '$address.city', area: '$address.area' },
    count: { $sum: 1 },
  },
};
const tupleRow = (row) => ({
  country: row._id?.country ?? null,
  city: row._id?.city ?? null,
  area: row._id?.area ?? null,
  count: row.count,
});
// Match a stored raw value byte-for-byte. A plain string would be cast through
// the schema's `trim` setter, so a legacy "lahore " could never be selected;
// an anchored regex bypasses query casting. null matches missing/null.
const exactStoredValue = (value) => (
  typeof value === 'string'
    ? { $regex: `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$` }
    : null
);
// A selection that resolves to no stored place must select no leads.
const MATCH_NOTHING = { _id: { $exists: false } };

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

  /**
   * Just the provider snapshot of a single (live) lead — used by the extension
   * re-import to decide which providerMeta fields are still empty and can be
   * backfilled. Soft-deleted leads are excluded by the find hook.
   */
  async getProviderMeta(id) {
    return Lead.findById(id).select('_id providerMeta source sourceMetadata address notes').lean();
  }

  /** Minimal snapshot used to safely canonicalize a partial address PATCH. */
  async getAddressSnapshot(id) {
    return Lead.findById(id).select('_id address source').lean();
  }

  /**
   * Build the shared lead query from the list/map filters: createdBy scope (when
   * given — leads are company-wide so the service passes none), the whitelisted
   * exact filters, the address geography matches, and the accent-safe search.
   * Returned as a single combined filter, WITHOUT any cursor clause, so both the
   * cursor list and the (cursorless) map query can reuse it.
   */
  buildListFilter({
    filters = {}, search, searchUserIds = [], createdBy,
  } = {}) {
    // Geography and businessType are friendly API filter names, while the
    // stored fields are nested. Pull them out before buildFilter so arbitrary
    // client keys can never reach MongoDB. Geography maps exactly to the three
    // fields displayed in the Leads table — no discovery-location fallback.
    // countryId/cityId/areaId are resolved asynchronously by buildDatasetFilter.
    const {
      countryId: _countryId, cityId: _cityId, areaId: _areaId, country, city, area, businessType, scoreBand, ...flatFilters
    } = filters;

    const baseFilter = {
      ...(createdBy ? { createdBy } : {}),
      ...buildFilter(flatFilters, ALLOWED_FILTERS),
    };
    // Rolling-deployment compatibility for former label-based clients: resolve
    // those labels through the same canonicalizer before comparing to the now
    // normalized visible fields. New clients always use the IDs below.
    const normalizedLegacy = canonicalizeLeadAddress({ country, city, area }, { source: 'filter' });
    const countryFilter = normalizedExactTextFilter('address.country', normalizedLegacy.country ?? country);
    const cityFilter = normalizedExactTextFilter('address.city', normalizedLegacy.city ?? city);
    const areaFilter = normalizedExactTextFilter('address.area', normalizedLegacy.area ?? area);
    // Business category (e.g. "Chinese restaurant") lives on sourceMetadata, not
    // the lead `type` (business/private). Exact match on the stored value the
    // filter-options facet surfaced.
    const businessTypeFilter = businessType ? { 'sourceMetadata.businessType': businessType } : {};
    // Score band (lead quality). 'unscored' also covers leads never scored.
    const scoreBandFilter = scoreBand
      ? { 'score.band': scoreBand === 'unscored' ? { $in: ['unscored', null] } : scoreBand }
      : {};

    let searchFilter = {};
    if (search) {
      const pattern = accentSafeRegex(search);
      const regex = { $regex: pattern, $options: 'i' };
      // Match everything a user reasonably expects to search by: the business
      // name/number, contact fields, the whole address (street/area/city/region/
      // country), the business category, tags, and the discovery location.
      const or = [
        { name: regex },
        { leadNumber: regex },
        { email: regex },
        { phone: regex },
        { mobile: regex },
        { 'address.street': regex },
        { 'address.area': regex },
        { 'address.city': regex },
        { 'address.region': regex },
        { 'address.country': regex },
        { 'sourceMetadata.businessType': regex },
        { tags: regex },
        { 'sourceMetadata.discoveryLocation.name': regex },
        { 'sourceMetadata.discoveryLocation.city': regex },
        { 'sourceMetadata.discoveryLocation.formattedAddress': regex },
      ];
      // Leads whose assignee / creator name (or email) matches the term — the
      // service pre-resolves the user ids since the user is a populated ref, not
      // a field this regex can reach.
      if (Array.isArray(searchUserIds) && searchUserIds.length) {
        or.push({ assignedTo: { $in: searchUserIds } });
        or.push({ createdBy: { $in: searchUserIds } });
      }
      searchFilter = { $or: or };
    }

    return combineFilters(
      baseFilter,
      countryFilter,
      cityFilter,
      areaFilter,
      businessTypeFilter,
      scoreBandFilter,
      searchFilter,
      currentLeadAccessFilter(), // governance: team-scoped lead access ({} in company mode)
    );
  }

  async list({
    cursor,
    limit = 25,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    filters = {},
    search,
    searchUserIds = [],
    createdBy,
  } = {}) {
    const safeSortBy = ALLOWED_SORT_FIELDS.includes(sortBy) ? sortBy : 'createdAt';

    const datasetFilter = await this.buildDatasetFilter({
      filters, search, searchUserIds, createdBy,
    });
    const filter = combineFilters(
      datasetFilter,
      buildCursorQuery(cursor, safeSortBy, sortOrder),
    );

    // Total matching rows (independent of the cursor) so the UI can show an
    // honest "page X of Y". countDocuments does NOT run Mongoose's soft-delete
    // `find` hook, so isDeleted:false is explicit (mirrors listForMap). The
    // count is the expensive half of a page (it visits every match), and it is
    // identical on every page of one filter, so it is cached per filter under
    // the lead write generation (any lead write invalidates it).
    const countFilter = combineFilters({ isDeleted: false }, datasetFilter);
    const [docs, total] = await Promise.all([
      Lead.find(filter)
        .sort(buildCursorSort(safeSortBy, sortOrder))
        .limit(limit + 1)
        .select('-__v')
        .populate(POPULATE)
        .lean(),
      cachedLeadAggregate('count', countFilter, () => Lead.countDocuments(countFilter)),
    ]);

    const response = buildCursorResponse(docs, limit, safeSortBy);
    response.pagination.total = total;
    return response;
  }

  /**
   * All leads matching the list filters, for the map view. Returns lightweight
   * projected docs (MAP_SELECT) with located leads first so the markers survive
   * the cap even when there are also many unlocated leads, plus honest counts so
   * the UI can show "X mapped / Y missing location". Not cursor-paginated: the
   * map needs the whole filtered set at once to fit bounds + cluster + sync the
   * list. `limited` tells the UI the set was truncated at the hard cap.
   */
  async listForMap({
    filters = {}, search, searchUserIds = [], limit = MAP_HARD_CAP,
  } = {}) {
    const cap = Math.min(Math.max(1, Number(limit) || MAP_HARD_CAP), MAP_HARD_CAP);
    // `isDeleted:false` is explicit: countDocuments does NOT run Mongoose's
    // soft-delete `pre(/^find/)` hook, so without it the counts would include
    // soft-deleted leads while the find()s (which do run the hook) exclude them —
    // leaving total/withLocation inconsistent with the returned leads.
    const filter = combineFilters({ isDeleted: false }, await this.buildDatasetFilter({ filters, search, searchUserIds }));
    const locatedFilter = combineFilters(filter, HAS_COORDINATES);

    const [total, withLocation, locatedDocs] = await Promise.all([
      Lead.countDocuments(filter),
      Lead.countDocuments(locatedFilter),
      Lead.find(locatedFilter)
        .sort({ createdAt: -1 })
        .limit(cap)
        .select(MAP_SELECT)
        .lean(),
    ]);

    // Fill any remaining budget with unlocated leads so the sidebar's "Location
    // unavailable" section can list them without a second round-trip.
    const remaining = cap - locatedDocs.length;
    const unlocatedDocs = remaining > 0
      ? await Lead.find(combineFilters(filter, NO_COORDINATES))
        .sort({ createdAt: -1 })
        .limit(remaining)
        .select(MAP_SELECT)
        .lean()
      : [];

    const leads = [...locatedDocs, ...unlocatedDocs];
    return {
      leads,
      total,
      withLocation,
      withoutLocation: Math.max(total - withLocation, 0),
      limited: total > leads.length,
    };
  }

  /**
   * Country → City → Area facets for EVERY live lead, derived at query time
   * from the raw address.country/city/area values shown in the table (see
   * buildGeographyFacets). One aggregation row per distinct place tuple — the
   * cost scales with the number of distinct places, not leads.
   */
  async geographyFacets() {
    // Every geography-filtered list page and every filter-options call needs
    // this index, and it changes only when a lead is written: cache the raw
    // tuple rows (plain JSON — the built index holds Maps) per write generation.
    const rows = await cachedLeadAggregate('geo-tuples', null, async () => (
      (await Lead.aggregate([{ $match: { isDeleted: false } }, GEO_TUPLE_GROUP])).map(tupleRow)
    ));
    return buildGeographyFacets(rows);
  }

  /**
   * Resolve canonical countryId/cityId/areaId selections to the exact raw
   * address values they cover. An unknown id matches nothing (never "all").
   */
  async buildGeographyFilter({ countryId, cityId, areaId } = {}, facets = null) {
    const ids = [countryId, cityId, areaId].filter((id) => typeof id === 'string' && id);
    if (!ids.length) return {};
    const index = facets ?? await this.geographyFacets();
    return combineFilters(...ids.map((id) => {
      const matchers = index.matchers.get(id);
      if (!matchers?.length) return MATCH_NOTHING;
      const clauses = matchers.map((matcher) => Object.fromEntries(
        Object.entries(matcher).map(([field, value]) => [`address.${field}`, exactStoredValue(value)]),
      ));
      return clauses.length === 1 ? clauses[0] : { $or: clauses };
    }));
  }

  /** buildListFilter + the asynchronously resolved canonical geography. */
  async buildDatasetFilter({ filters = {}, ...rest } = {}, facets = null) {
    return combineFilters(
      this.buildListFilter({ filters, ...rest }),
      await this.buildGeographyFilter(filters, facets),
    );
  }

  /**
   * Database-backed values for list filters. Aggregation middleware does not
   * run Mongoose's soft-delete `find` hook, so `isDeleted:false` is explicit.
   * Geographic options are canonical and de-duplicated (one Paris, one Lahore,
   * arrondissements as areas of Paris); cities are scoped to the selected
   * country and areas to the selected city so the client can cascade.
   */
  async getFilterOptions({ filters = {}, search, searchUserIds = [] } = {}) {
    const {
      countryId, cityId, areaId: _areaId, ...nonGeographicFilters
    } = filters;
    const base = combineFilters(
      { isDeleted: false },
      this.buildListFilter({
        filters: nonGeographicFilters,
        search,
        searchUserIds,
      }),
    );

    const [geography, facets] = await Promise.all([
      this.geographyFacets(),
      cachedLeadAggregate('facets', base, async () => (await Lead.aggregate([
        {
          $facet: {
            places: [
              { $match: base },
              GEO_TUPLE_GROUP,
            ],
            types: [
              { $match: base },
              { $match: { type: { $in: ['business', 'private'] } } },
              { $group: { _id: '$type', count: { $sum: 1 } } },
              { $sort: { _id: 1 } },
            ],
            businessTypes: [
              { $match: base },
              { $match: { 'sourceMetadata.businessType': { $type: 'string', $ne: '' } } },
              { $group: { _id: '$sourceMetadata.businessType', count: { $sum: 1 } } },
              { $sort: { count: -1, _id: 1 } },
            ],
          },
        },
      ]))[0] ?? null),
    ]);

    const { countries, cities, areas } = countGeographyFacets(
      geography,
      (facets?.places ?? []).map(tupleRow),
      { countryId, cityId },
    );

    return {
      countries,
      cities,
      areas,
      types: (facets?.types ?? []).map((type) => ({ value: type._id, count: type.count })),
      businessTypes: (facets?.businessTypes ?? []).map((bt) => ({ value: bt._id, count: bt.count })),
    };
  }

  /**
   * Header KPIs for the Leads page, over the same visible set as the list
   * (live leads + governance access filter; leads are company-wide). One
   * $group pass over the leads plus one grouped pass over today's open
   * follow-ups; cached ≤ 60 s under the lead/follow-up write generation.
   *
   * - newThisWeek: created in the last 7 days (rolling, timezone-free)
   * - hot: score.band === 'hot' (top band of leadScoring.engine SCORE_BANDS)
   * - unassigned: no assignedTo
   * - withoutPhone: neither phone nor mobile
   * - slaOverdue: slaStatus === 'overdue' (the toolbar's "Response overdue" filter)
   * - followUpsDueToday: open/snoozed follow-ups with nextDueAt before the end
   *   of today (server timezone) — overdue ones included — on visible leads
   */
  async stats(now = new Date()) {
    const access = currentLeadAccessFilter();
    return cachedLeadAggregate('stats', { access }, () => this.computeStats(now, access), { ttlSeconds: 60 });
  }

  async computeStats(now = new Date(), access = currentLeadAccessFilter()) {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const endOfToday = new Date(now);
    endOfToday.setHours(24, 0, 0, 0);
    const sumIf = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });
    const blank = (path) => ({ $in: [{ $ifNull: [path, ''] }, ['']] });
    const accessMatch = Object.keys(access).length ? [access] : [];

    const [statusRows, dueRows] = await Promise.all([
      Lead.aggregate([
        { $match: combineFilters({ isDeleted: false }, ...accessMatch) },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            newThisWeek: sumIf({ $gte: ['$createdAt', weekAgo] }),
            hot: sumIf({ $eq: ['$score.band', 'hot'] }),
            unassigned: sumIf({ $eq: [{ $ifNull: ['$assignedTo', null] }, null] }),
            withoutPhone: sumIf({ $and: [blank('$phone'), blank('$mobile')] }),
            slaOverdue: sumIf({ $eq: ['$slaStatus', 'overdue'] }),
          },
        },
      ]),
      LeadFollowUp.aggregate([
        { $match: { status: { $in: FOLLOW_UP_OPEN_STATUSES }, nextDueAt: { $lt: endOfToday } } },
        { $group: { _id: '$leadId', count: { $sum: 1 } } },
      ]),
    ]);

    const byStatus = Object.fromEntries(Object.values(LEAD_STATUS).map((status) => [status, 0]));
    const totals = { total: 0, newThisWeek: 0, hot: 0, unassigned: 0, withoutPhone: 0, slaOverdue: 0 };
    for (const row of statusRows) {
      if (row._id) byStatus[row._id] = (byStatus[row._id] ?? 0) + row.count;
      totals.total += row.count;
      totals.newThisWeek += row.newThisWeek;
      totals.hot += row.hot;
      totals.unassigned += row.unassigned;
      totals.withoutPhone += row.withoutPhone;
      totals.slaOverdue += row.slaOverdue;
    }
    return {
      ...totals,
      byStatus,
      followUpsDueToday: await this.countOnVisibleLeads(dueRows, accessMatch),
      generatedAt: now.toISOString(),
    };
  }

  /**
   * Sum `count` over [{ _id: leadId, count }] rows whose lead is live and
   * visible — chunked indexed `_id $in` reads (a per-row $lookup sub-pipeline
   * was ~100× slower on 10k leads).
   */
  async countOnVisibleLeads(rows, accessMatch = []) {
    let total = 0;
    for (let i = 0; i < rows.length; i += 5000) {
      const part = rows.slice(i, i + 5000);
      // eslint-disable-next-line no-await-in-loop
      const live = await Lead.find(combineFilters({ _id: { $in: part.map((row) => row._id) }, isDeleted: { $ne: true } }, ...accessMatch))
        .setOptions({ includeDeleted: true })
        .select('_id').lean();
      const ids = new Set(live.map((doc) => String(doc._id)));
      for (const row of part) if (ids.has(String(row._id))) total += row.count;
    }
    return total;
  }

  async update(id, data, { createdBy } = {}) {
    const filter = { _id: id };
    if (createdBy) filter.createdBy = createdBy;
    const changed = Object.keys(data.$set ?? data);
    if (changed.some((path) => /^(name|type|source|address|providerMeta|sourceMetadata|notes)(\.|$)/.test(path))) {
      const current = await Lead.findOne(filter).select('name type source address providerMeta.mapsUrl sourceMetadata notes').lean();
      if (current) {
        const keys = identityAfterPatch(current, data);
        data = data.$set ? { ...data, $set: { ...data.$set, businessIdentityKeys: keys } } : { ...data, businessIdentityKeys: keys };
      }
    }
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
   * Soft-delete many leads in a SINGLE updateMany (company-wide, like softDelete).
   * First resolves which ids are actually deletable (exist + not already deleted)
   * via one indexed _id lookup, so the result reports per-id truthfully; then one
   * updateMany flips them. No N+1 — two queries regardless of id count.
   * (`updateMany` is NOT covered by the soft-delete `pre(/^find/)` hook, so the
   * `isDeleted:false` guard is explicit.)
   */
  async bulkSoftDelete(ids = []) {
    if (!ids.length) return { deletedIds: [], matchedCount: 0, modifiedCount: 0 };
    const deletable = await Lead.find(
      { _id: { $in: ids }, isDeleted: false },
      { _id: 1 },
    ).lean();
    const deletableIds = deletable.map((doc) => String(doc._id));
    if (!deletableIds.length) return { deletedIds: [], matchedCount: 0, modifiedCount: 0 };
    const result = await Lead.updateMany(
      { _id: { $in: deletableIds }, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date() } },
    );
    return {
      deletedIds: deletableIds,
      matchedCount: result.matchedCount ?? result.n ?? deletableIds.length,
      modifiedCount: result.modifiedCount ?? result.nModified ?? deletableIds.length,
    };
  }

  /**
   * Assign (or unassign, with `assignedTo = null`) many leads in ONE updateMany.
   * Same two-query shape as bulkSoftDelete so the result reports per-id truthfully.
   */
  async bulkAssign(ids = [], assignedTo = null) {
    if (!ids.length) return { updatedIds: [], matchedCount: 0, modifiedCount: 0 };
    const existing = await Lead.find(
      { _id: { $in: ids }, isDeleted: false },
      { _id: 1 },
    ).lean();
    const updatableIds = existing.map((doc) => String(doc._id));
    if (!updatableIds.length) return { updatedIds: [], matchedCount: 0, modifiedCount: 0 };
    const result = await Lead.updateMany(
      { _id: { $in: updatableIds }, isDeleted: false },
      { $set: { assignedTo: assignedTo || null } },
    );
    return {
      updatedIds: updatableIds,
      matchedCount: result.matchedCount ?? result.n ?? updatableIds.length,
      modifiedCount: result.modifiedCount ?? result.nModified ?? updatableIds.length,
    };
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
        $or: [{ 'sourceMetadata.googlePlaceId': googlePlaceId }, { businessIdentityKeys: { $in: googleIdentityKeys({ sourceMetadata: { googlePlaceId } }) } }],
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

  /** Confirm import identity across extension, provider and legacy CSV sources. */
  async findImportDuplicates(lead) {
    const keys = businessIdentityKeys(lead);
    const clauses = [];
    if (keys.length) clauses.push({ businessIdentityKeys: { $in: keys } });
    if (lead.sourceMetadata?.googlePlaceId) clauses.push({ 'sourceMetadata.googlePlaceId': lead.sourceMetadata.googlePlaceId });
    const select = '_id leadNumber name type source sourceMetadata address location providerMeta.mapsUrl notes businessIdentityKeys';
    const matches = (candidates) => candidates.filter((candidate) => sameBusinessIdentity(lead, candidate))
      .map((candidate) => ({ method: 'BUSINESS_IDENTITY', confidence: 1, lead: candidate }));
    // Resolve indexed identities first: a large chain's name matches must not
    // crowd the actual place out of a bounded legacy fallback query.
    if (clauses.length) {
      const exact = matches(await Lead.find({ $or: clauses }).select(select).limit(100).lean());
      if (exact.length) return exact;
    }
    // Before the backfill runs, a legacy import may only have its Maps URL in
    // notes. Locate exact-name candidates and compare their actual evidence.
    if (!lead.name) return [];
    const candidates = await Lead.find({ name: { $regex: `^${accentSafeRegex(lead.name.trim())}$`, $options: 'i' } })
      .select(select)
      .sort({ createdAt: 1, _id: 1 }).limit(100).lean();
    return matches(candidates);
  }

  /** Batch equivalent of findImportDuplicates, preserving strict branch identity. */
  async findImportDuplicatesBatch(leads = []) {
    if (!leads.length) return [];
    const keys = [...new Set(leads.flatMap(businessIdentityKeys))];
    const placeIds = [...new Set(leads.map((lead) => lead.sourceMetadata?.googlePlaceId).filter(Boolean))];
    const clauses = [];
    if (keys.length) clauses.push({ businessIdentityKeys: { $in: keys } });
    if (placeIds.length) clauses.push({ 'sourceMetadata.googlePlaceId': { $in: placeIds } });
    const select = '_id leadNumber name type source sourceMetadata address location providerMeta notes businessIdentityKeys';
    const exact = clauses.length ? await Lead.find({ $or: clauses }).select(select).lean() : [];
    const byKey = new Map();
    for (const candidate of exact) {
      for (const key of [...businessIdentityKeys(candidate), ...googleIdentityKeys(candidate)]) {
        byKey.set(key, [...(byKey.get(key) || []), candidate]);
      }
    }
    const result = leads.map((lead) => {
      const candidates = new Map(businessIdentityKeys(lead).flatMap((key) => byKey.get(key) || []).map((candidate) => [String(candidate._id), candidate]));
      return [...candidates.values()].filter((candidate) => sameBusinessIdentity(lead, candidate));
    });
    const names = [...new Set(leads.filter((_lead, index) => !result[index].length).map((lead) => lead.name?.trim()).filter(Boolean))];
    if (names.length) {
      // Both branches can use lead_import_name_lookup: normal imports use an
      // exact normalized-name $in, while only unnormalized legacy rows need
      // accent-aware raw-name matching. Never scan all current leads by regex.
      const legacy = await Lead.find({ $or: [
        { normalizedName: { $in: [...new Set(names.map(normalizeName))] } },
        { normalizedName: null, $or: names.map((name) => ({ name: { $regex: `^${accentSafeRegex(name)}$`, $options: 'i' } })) },
      ] }).select(select).sort({ createdAt: 1, _id: 1 }).lean();
      const byName = new Map();
      for (const candidate of legacy) {
        const name = normalizeName(candidate.name);
        byName.set(name, [...(byName.get(name) || []), candidate]);
      }
      leads.forEach((lead, index) => {
        if (!result[index].length) result[index] = (byName.get(normalizeName(lead.name)) || []).filter((candidate) => sameBusinessIdentity(lead, candidate));
      });
    }
    return result.map((matches) => matches.map((lead) => ({ method: 'BUSINESS_IDENTITY', confidence: 1, lead })));
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
      const inserted = await Lead.insertMany(docs, { ordered: false, throwOnValidationError: true });
      return { created: inserted, errors: [], insertedCount: inserted.length, failedCount: 0 };
    } catch (err) {
      // ordered:false → partial success. Mongoose exposes insertedDocs and
      // writeErrors on the thrown error.
      const created = err.insertedDocs || (err.results || []).filter((item) => item && !(item instanceof Error) && item._id);
      const validationErrors = err.validationErrors || (err.results || []).filter((item) => item instanceof Error && item.index !== undefined);
      if (!err.writeErrors?.length && !err.result?.result?.writeErrors?.length && !validationErrors.length) throw err;
      const writeErrors = err.writeErrors
        || err.result?.result?.writeErrors
        || [];
      const errors = [...writeErrors, ...validationErrors].map((writeError) => {
        const info = writeError.err || writeError;
        return {
          index: writeError.index ?? info.index,
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
      $or: [
        { 'sourceMetadata.googlePlaceId': { $in: placeIds } },
        { businessIdentityKeys: { $in: placeIds.flatMap((googlePlaceId) => googleIdentityKeys({ sourceMetadata: { googlePlaceId } })) } },
      ],
    };
    if (createdBy) filter.createdBy = createdBy;
    const matches = await Lead.find(filter)
      .select('_id leadNumber name status source sourceMetadata businessIdentityKeys')
      .lean();
    return matches.flatMap((lead) => placeIds.filter((id) => id === lead.sourceMetadata?.googlePlaceId
      || googleIdentityKeys({ sourceMetadata: { googlePlaceId: id } }).some((key) => lead.businessIdentityKeys?.includes(key)))
      .map((id) => ({ ...lead, sourceMetadata: { ...lead.sourceMetadata, googlePlaceId: id } })));
  }
}

const leadRepository = new LeadRepository();
export default leadRepository;
