import mongoose from 'mongoose';
import Lead from './lead.model.js';
import LeadDuplicateCandidate, { pairKeyOf } from './leadDuplicateCandidate.model.js';
import { normalizeName } from '../businessDiscovery/engine/normalizer.js';
import queueManager from '../../shared/queue/QueueManager.js';
import auditService from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError.js';

/**
 * Duplicate candidate detection + review queue.
 *
 * Detection is deterministic and evidence-based: two leads are a candidate pair
 * when they share an exact recorded key — provider place id, normalized phone,
 * e-mail, website domain, normalized name + postal code, or normalized name at
 * (practically) the same coordinates. Each pair carries every matching reason;
 * confidence combines them (1 − Π(1 − cᵢ)).
 *
 * A value shared by more than MAX_GROUP leads (a call-centre number, a franchise
 * domain) is not evidence of duplication and is skipped.
 */
export const LEAD_DUPLICATES_QUEUE = 'lead-duplicates';

export const METHOD_CONFIDENCE = Object.freeze({
  PLACE_ID: 1, PHONE: 0.95, EMAIL: 0.9, WEBSITE: 0.9, NAME_POSTAL: 0.75, NAME_NEARBY: 0.7,
});
const MAX_GROUP = 25;
const NEARBY_METERS = 150;
const EARTH_RADIUS_M = 6378100;
// Hosting / social domains many unrelated businesses share.
const SHARED_DOMAINS = new Set([
  'facebook.com', 'instagram.com', 'google.com', 'sites.google.com', 'business.site', 'wa.me', 'linktr.ee',
  'linkedin.com', 'twitter.com', 'x.com', 'tiktok.com', 'youtube.com', 'wix.com', 'wixsite.com', 'jimdo.com',
  'squarespace.com', 'yelp.com', 'tripadvisor.com', 'booking.com', 'local.ch', 'search.ch',
]);

const LEAD_SUMMARY_SELECT = [
  '_id', 'leadNumber', 'name', 'status', 'source', 'type', 'phone', 'mobile', 'email', 'website', 'address',
  'providerMeta.rating', 'providerMeta.reviewCount', 'sourceMetadata.businessType', 'sourceMetadata.googlePlaceId',
  'tags', 'assignedTo', 'createdBy', 'lastContactedAt', 'score', 'createdAt', 'updatedAt', 'convertedCustomerId',
].join(' ');

const s = (v) => (v == null ? null : String(v));
const nameKey = (lead) => lead.normalizedName || (lead.name ? normalizeName(lead.name) : null);

export function combineConfidence(reasons = []) {
  const miss = reasons.reduce((acc, r) => acc * (1 - r.confidence), 1);
  return Math.min(0.999, Math.round((1 - miss) * 1000) / 1000);
}

/** The match keys of one lead, each with the Mongo filter that finds its twins. */
export function matchKeys(lead) {
  const keys = [];
  const placeId = lead.sourceMetadata?.googlePlaceId;
  if (placeId) keys.push({ method: 'PLACE_ID', value: placeId, filter: { 'sourceMetadata.googlePlaceId': placeId } });
  if (lead.normalizedPhone) keys.push({ method: 'PHONE', value: lead.normalizedPhone, filter: { normalizedPhone: lead.normalizedPhone } });
  const email = lead.email ? String(lead.email).trim().toLowerCase() : null;
  if (email) keys.push({ method: 'EMAIL', value: email, filter: { email } });
  if (lead.websiteDomain && !SHARED_DOMAINS.has(String(lead.websiteDomain).toLowerCase())) {
    keys.push({ method: 'WEBSITE', value: lead.websiteDomain, filter: { websiteDomain: lead.websiteDomain } });
  }
  const nk = nameKey(lead);
  if (nk && lead.address?.postalCode) {
    keys.push({ method: 'NAME_POSTAL', value: `${nk}|${lead.address.postalCode}`, filter: { normalizedName: nk, 'address.postalCode': lead.address.postalCode } });
  }
  const coords = lead.location?.coordinates;
  if (nk && Array.isArray(coords) && coords.length === 2) {
    keys.push({
      method: 'NAME_NEARBY',
      value: `${nk}@${coords[1].toFixed(4)},${coords[0].toFixed(4)}`,
      filter: { normalizedName: nk, location: { $geoWithin: { $centerSphere: [coords, NEARBY_METERS / EARTH_RADIUS_M] } } },
    });
  }
  return keys;
}

class LeadDuplicateService {
  /** Upsert pairs; a dismissed pair stays dismissed, a stale one reopens. */
  async _upsertPairs(pairs, now = new Date()) {
    if (!pairs.size) return { upserted: 0 };
    const ops = [];
    for (const [pairKey, { ids, reasons }] of pairs) {
      const sorted = [...reasons.values()].sort((a, b) => b.confidence - a.confidence || a.method.localeCompare(b.method));
      ops.push({
        updateOne: {
          filter: { pairKey },
          update: {
            $setOnInsert: { pairKey, leadIds: ids, detectedAt: now, status: 'open' },
            $set: { reasons: sorted, confidence: combineConfidence(sorted), lastSeenAt: now },
          },
          upsert: true,
        },
      });
    }
    const res = await LeadDuplicateCandidate.bulkWrite(ops, { ordered: false });
    await LeadDuplicateCandidate.updateMany({ pairKey: { $in: [...pairs.keys()] }, status: 'stale' }, { $set: { status: 'open' } });
    return { upserted: res.upsertedCount || 0 };
  }

  _addPair(pairs, a, b, method, value) {
    if (s(a) === s(b)) return;
    const key = pairKeyOf(a, b);
    if (!pairs.has(key)) {
      const ids = [s(a), s(b)].sort().map((x) => new mongoose.Types.ObjectId(x));
      pairs.set(key, { ids, reasons: new Map() });
    }
    const entry = pairs.get(key);
    if (!entry.reasons.has(method)) entry.reasons.set(method, { method, value: value == null ? null : String(value).slice(0, 300), confidence: METHOD_CONFIDENCE[method] });
  }

  /** Detect candidates for specific leads (on create / import / after a merge). */
  async detectForLeads(leadIds = []) {
    const now = new Date();
    const leads = await Lead.find({ _id: { $in: leadIds } }).lean();
    const pairs = new Map();
    for (const lead of leads) {
      for (const key of matchKeys(lead)) {
        const twins = await Lead.find({ ...key.filter, _id: { $ne: lead._id } }).select('_id').limit(MAX_GROUP).lean();
        if (twins.length >= MAX_GROUP) continue; // too common to be evidence
        for (const twin of twins) this._addPair(pairs, lead._id, twin._id, key.method, key.value);
      }
    }
    const result = await this._upsertPairs(pairs, now);
    // Pairs of these leads that no longer match anything recorded are stale.
    await LeadDuplicateCandidate.updateMany(
      { leadIds: { $in: leads.map((l) => l._id) }, status: 'open', lastSeenAt: { $lt: now } },
      { $set: { status: 'stale' } },
    );
    return { leads: leads.length, pairs: pairs.size, ...result };
  }

  /** Full scan across all live leads (periodic job / manual "scan now"). */
  async scanAll() {
    const now = new Date();
    const live = { isDeleted: false };
    const nameExpr = { $ifNull: ['$normalizedName', { $toLower: '$name' }] };
    const groupings = [
      { method: 'PLACE_ID', match: { 'sourceMetadata.googlePlaceId': { $nin: [null, ''] } }, id: '$sourceMetadata.googlePlaceId' },
      { method: 'PHONE', match: { normalizedPhone: { $nin: [null, ''] } }, id: '$normalizedPhone' },
      { method: 'EMAIL', match: { email: { $nin: [null, ''] } }, id: { $toLower: '$email' } },
      { method: 'WEBSITE', match: { websiteDomain: { $nin: [null, '', ...SHARED_DOMAINS] } }, id: '$websiteDomain' },
      { method: 'NAME_POSTAL', match: { name: { $nin: [null, ''] }, 'address.postalCode': { $nin: [null, ''] } }, id: { n: nameExpr, p: '$address.postalCode' } },
      {
        method: 'NAME_NEARBY',
        match: { name: { $nin: [null, ''] }, 'location.coordinates.0': { $exists: true } },
        // ~110 m cells; a pair straddling a cell edge is found by per-lead detection instead.
        id: { n: nameExpr, lat: { $round: [{ $arrayElemAt: ['$location.coordinates', 1] }, 3] }, lng: { $round: [{ $arrayElemAt: ['$location.coordinates', 0] }, 3] } },
      },
    ];
    const pairs = new Map();
    let skippedGroups = 0;
    for (const g of groupings) {
      const groups = await Lead.aggregate([
        { $match: { ...live, ...g.match } },
        { $group: { _id: g.id, ids: { $push: '$_id' }, n: { $sum: 1 } } },
        { $match: { n: { $gt: 1 } } },
      ]).allowDiskUse(true);
      for (const group of groups) {
        if (group.n > MAX_GROUP) { skippedGroups += 1; continue; }
        const value = typeof group._id === 'object' && group._id ? Object.values(group._id).join('|') : group._id;
        for (let i = 0; i < group.ids.length; i += 1) {
          for (let j = i + 1; j < group.ids.length; j += 1) this._addPair(pairs, group.ids[i], group.ids[j], g.method, value);
        }
      }
    }
    const result = await this._upsertPairs(pairs, now);
    const stale = await LeadDuplicateCandidate.updateMany({ status: 'open', lastSeenAt: { $lt: now } }, { $set: { status: 'stale' } });
    logger.info('Lead duplicate scan finished', { module: 'crm', action: 'leadDuplicates.scanAll', pairs: pairs.size, skippedGroups, stale: stale.modifiedCount });
    return { pairs: pairs.size, skippedGroups, staled: stale.modifiedCount || 0, ...result };
  }

  /**
   * Review queue: open pairs grouped into connected components (A~B, B~C → one
   * group), strongest first. Pairs whose leads are no longer live are hidden.
   */
  async listGroups({ minConfidence = 0, limit = 50 } = {}) {
    const pairs = await LeadDuplicateCandidate.find({ status: 'open', confidence: { $gte: minConfidence } })
      .sort({ confidence: -1, _id: 1 }).limit(2000).lean();
    const ids = [...new Set(pairs.flatMap((p) => p.leadIds.map(s)))];
    const leads = await Lead.find({ _id: { $in: ids } }).select(LEAD_SUMMARY_SELECT).lean();
    const byId = new Map(leads.map((l) => [s(l._id), l]));
    const livePairs = pairs.filter((p) => p.leadIds.every((id) => byId.has(s(id))));

    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra < rb ? rb : ra, ra < rb ? ra : rb); };
    for (const p of livePairs) for (const id of p.leadIds) if (!parent.has(s(id))) parent.set(s(id), s(id));
    for (const p of livePairs) union(s(p.leadIds[0]), s(p.leadIds[1]));

    const groups = new Map();
    for (const p of livePairs) {
      const root = find(s(p.leadIds[0]));
      if (!groups.has(root)) groups.set(root, { id: root, leadIds: new Set(), pairs: [], confidence: 0 });
      const g = groups.get(root);
      p.leadIds.forEach((id) => g.leadIds.add(s(id)));
      g.pairs.push({ id: s(p._id), leadIds: p.leadIds.map(s), reasons: p.reasons, confidence: p.confidence, detectedAt: p.detectedAt });
      g.confidence = Math.max(g.confidence, p.confidence);
    }
    const all = [...groups.values()]
      .map((g) => ({ ...g, leads: [...g.leadIds].sort().map((id) => byId.get(id)), leadIds: undefined }))
      .sort((a, b) => b.confidence - a.confidence || b.leads.length - a.leads.length || a.id.localeCompare(b.id));
    return { groups: all.slice(0, limit), total: all.length, openPairs: livePairs.length };
  }

  async dismiss(candidateId, userId, { reason = null } = {}, meta = {}) {
    const candidate = await LeadDuplicateCandidate.findById(candidateId);
    if (!candidate) throw new NotFoundError('Duplicate candidate', candidateId);
    if (candidate.status === 'merged') throw new ConflictError('This pair was already merged');
    candidate.status = 'dismissed';
    candidate.dismissedBy = userId;
    candidate.dismissedAt = new Date();
    candidate.dismissReason = reason || null;
    await candidate.save();
    auditService.logEvent({
      eventType: 'lead.duplicate_dismissed',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { candidateId: s(candidate._id), leadIds: candidate.leadIds.map(s), reason: reason || null },
      module: 'lead',
    });
    return candidate.toObject();
  }

  async reopen(candidateId, userId, meta = {}) {
    const candidate = await LeadDuplicateCandidate.findOneAndUpdate(
      { _id: candidateId, status: 'dismissed' },
      { $set: { status: 'open', dismissedBy: null, dismissedAt: null, dismissReason: null } },
      { returnDocument: 'after' },
    ).lean();
    if (!candidate) throw new NotFoundError('Dismissed duplicate candidate', candidateId);
    auditService.logEvent({
      eventType: 'lead.duplicate_reopened', userId, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent,
      result: 'success', details: { candidateId: s(candidate._id) }, module: 'lead',
    });
    return candidate;
  }

  /** Fire-and-forget detection for new leads; the periodic scan is the safety net. */
  async scheduleDetect(leadIds = []) {
    const ids = leadIds.map(s).filter(Boolean);
    if (!ids.length) return false;
    try {
      await queueManager.addJob(LEAD_DUPLICATES_QUEUE, 'detect-leads', { leadIds: ids }, { removeOnComplete: true, removeOnFail: 100 });
      return true;
    } catch (err) {
      logger.debug('Lead duplicate detection not queued', { module: 'crm', action: 'leadDuplicates.schedule', error: { message: err.message } });
      return false;
    }
  }

  async scheduleScan() {
    try {
      await queueManager.addJob(LEAD_DUPLICATES_QUEUE, 'scan-all', {}, { jobId: 'lead-duplicates-scan', removeOnComplete: true, removeOnFail: 20 });
      return true;
    } catch (err) {
      logger.warn('Lead duplicate scan not queued', { module: 'crm', action: 'leadDuplicates.scheduleScan', error: { message: err.message } });
      return false;
    }
  }
}

const leadDuplicateService = new LeadDuplicateService();
export default leadDuplicateService;
