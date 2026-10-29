import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Lead from './lead.model.js';
import LeadMerge from './leadMerge.model.js';
import LeadDuplicateCandidate, { pairKeyOf } from './leadDuplicateCandidate.model.js';
import {
  CHILD_COLLECTIONS, loadChildModel, planDescriptor, applyDescriptor, revertDescriptor,
} from './leadMerge.children.js';
import leadDuplicateService from './leadDuplicate.service.js';
import leadScoringService from './leadScoring.service.js';
import { normalizeName, normalizePhone, normalizeWebsiteDomain } from '../businessDiscovery/engine/normalizer.js';
import auditService from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';
import { AppError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';

/**
 * Lead merge — loser → survivor, history-preserving, resumable and undoable.
 *
 * One durable operation without multi-document transactions: a LeadMerge
 * journal with step checkpoints, where every step is idempotent, executed while
 * BOTH leads hold a short-lived merge lock. Steps:
 *   children        re-point every child row (communications, calls, SMS, …)
 *                   — ids recorded in the journal BEFORE each write
 *   survivor        apply the chosen field values, union tags, qualification
 *                   answers + history, contact stamps; add loser to mergedLeadIds
 *   loser           soft-delete with mergedInto
 *   children_final  second pass for rows written to the loser meanwhile
 *   candidates      resolve the duplicate pair(s)
 * A failure leaves status in_progress with lastError; resume() (or the same
 * merge request again, or the periodic sweep once the lock expired) finishes it.
 *
 * Do-not-contact is never lost: suppression / opt-out rows move with the lead,
 * phone-keyed suppressions stay keyed by number, and on a consent conflict the
 * stricter status is copied onto the survivor (see leadMerge.children.js).
 */
export const MERGEABLE_FIELDS = Object.freeze([
  'name', 'type', 'status', 'phone', 'mobile', 'email', 'website', 'address', 'location', 'providerMeta', 'social', 'assignedTo', 'notes',
]);
const DNC_FLAGS = ['doNotContact'];
const LOCK_MS = 2 * 60_000;
const STEP_ORDER = ['children', 'survivor', 'loser', 'children_final', 'candidates'];
const UNDO_ORDER = ['survivor', 'children', 'loser', 'candidates'];

const s = (v) => (v == null ? null : String(v));
const oid = (v) => (v instanceof mongoose.Types.ObjectId ? v : new mongoose.Types.ObjectId(String(v)));

function coded(message, status, code, details = []) {
  return new AppError(message, status, code, details);
}

export function isBlank(v) {
  if (v == null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (v instanceof Date || v instanceof mongoose.Types.ObjectId) return false;
  if (typeof v === 'object') return Object.values(v).every(isBlank);
  return false;
}

/** Stable comparison of stored values (key order, Dates, ObjectIds, empty values). */
export function canonical(v) {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString();
  if (v instanceof mongoose.Types.ObjectId || v?._bsontype === 'ObjectId') return String(v);
  if (Array.isArray(v)) return v.map(canonical);
  if (typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      const c = canonical(v[k]);
      if (c == null || (Array.isArray(c) && !c.length) || (typeof c === 'object' && !Array.isArray(c) && !Object.keys(c).length)) continue;
      out[k] = c;
    }
    return out;
  }
  return v;
}
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

export function defaultSelections(survivor, loser) {
  return Object.fromEntries(MERGEABLE_FIELDS.map((f) => [f, isBlank(survivor?.[f]) && !isBlank(loser?.[f]) ? 'loser' : 'survivor']));
}

/** Deterministic survivor patch from the two snapshots and the chosen winners. */
export function buildSurvivorPatch(survivor, loser, selections = {}) {
  const chosen = { ...defaultSelections(survivor, loser), ...selections };
  const patch = {};
  for (const field of MERGEABLE_FIELDS) {
    const sel = chosen[field];
    if (field === 'notes' && sel === 'both') {
      const parts = [survivor.notes, loser.notes].filter((n) => !isBlank(n));
      patch.notes = parts.length > 1
        ? `${parts[0]}\n\n— ${loser.leadNumber || 'merged lead'} —\n${parts[1]}`.slice(0, 5000)
        : (parts[0] ?? null);
    } else if (sel === 'loser') {
      patch[field] = loser[field] ?? null;
    }
  }
  if ('name' in patch) patch.normalizedName = patch.name ? normalizeName(patch.name) : null;
  if ('phone' in patch || 'mobile' in patch) {
    const phone = 'phone' in patch ? patch.phone : survivor.phone;
    const mobile = 'mobile' in patch ? patch.mobile : survivor.mobile;
    const source = phone || mobile || null;
    patch.normalizedPhone = source ? (normalizePhone(source).e164 ?? null) : null;
  }
  if ('website' in patch) patch.websiteDomain = patch.website ? normalizeWebsiteDomain(patch.website) : null;
  // Contact stamps: the most recent contact of either lead.
  if (loser.lastContactedAt && (!survivor.lastContactedAt || new Date(loser.lastContactedAt) > new Date(survivor.lastContactedAt))) {
    patch.lastContactedAt = loser.lastContactedAt;
    patch.lastContactChannel = loser.lastContactChannel ?? null;
  }
  // Stricter wins: a do-not-contact flag on either lead survives.
  for (const flag of DNC_FLAGS) if (loser[flag] === true && survivor[flag] !== true) patch[flag] = true;
  const survivorTags = new Set(survivor.tags || []);
  const addedTags = (loser.tags || []).filter((t) => !survivorTags.has(t));
  return { patch, addedTags, selections: chosen };
}

/** Which qualification answers of the loser should win over the survivor's. */
export function qualificationTakeovers(survivorFields = [], loserFields = []) {
  const byKey = new Map(survivorFields.map((f) => [f.fieldKey, f]));
  return loserFields.filter((lf) => {
    const sf = byKey.get(lf.fieldKey);
    if (!sf) return true;
    const la = lf.status === 'answered';
    const sa = sf.status === 'answered';
    if (la !== sa) return la;
    // Both (un)answered: the most recently confirmed one wins.
    return new Date(lf.updatedAt || 0) > new Date(sf.updatedAt || 0);
  });
}

async function readLead(id, { includeDeleted = false } = {}) {
  return Lead.findById(id).select('+qualification.history').setOptions({ includeDeleted }).lean();
}

function snapshot(lead) {
  // Mixed storage cannot hold keys starting with '$'; leads never have them.
  const { mergeLock: _lock, __v: _v, ...rest } = lead;
  return rest;
}

class LeadMergeService {
  // ── locks ────────────────────────────────────────────────────────────────
  async _acquire(leadId, mergeId, token, { allowDeleted = false } = {}) {
    const now = new Date();
    const res = await Lead.updateOne(
      {
        _id: leadId,
        ...(allowDeleted ? {} : { isDeleted: false }),
        $or: [{ mergeLock: null }, { mergeLock: { $exists: false } }, { 'mergeLock.until': { $lt: now } }, { 'mergeLock.token': token }],
      },
      { $set: { mergeLock: { mergeId, token, until: new Date(now.getTime() + LOCK_MS) } } },
      { timestamps: false },
    );
    return res.matchedCount === 1;
  }

  async _release(leadIds, token) {
    await Lead.updateMany({ _id: { $in: leadIds }, 'mergeLock.token': token }, { $set: { mergeLock: null } }, { timestamps: false });
  }

  async _lockBoth(survivorId, loserId, mergeId, token, opts = {}) {
    if (!(await this._acquire(survivorId, mergeId, token, opts))) {
      throw coded('Another merge is in progress for this lead; try again shortly', 409, 'MERGE_IN_PROGRESS', [{ field: 'survivorId', message: 'locked' }]);
    }
    if (!(await this._acquire(loserId, mergeId, token, opts))) {
      await this._release([survivorId], token);
      throw coded('Another merge is in progress for this lead; try again shortly', 409, 'MERGE_IN_PROGRESS', [{ field: 'loserId', message: 'locked' }]);
    }
  }

  // ── preview ──────────────────────────────────────────────────────────────
  _validatePair(survivor, loser, survivorId, loserId) {
    if (!survivor) throw new NotFoundError('Lead', survivorId);
    if (!loser) throw new NotFoundError('Lead', loserId);
    if (s(survivor._id) === s(loser._id)) throw new ValidationError('A lead cannot be merged into itself');
    if (loser.status === 'converted' || loser.convertedCustomerId) {
      throw coded('The converted lead must be the survivor', 409, 'LOSER_CONVERTED');
    }
  }

  async _planAll(survivorId, loserId, journal = {}) {
    const retained = {};
    const plans = [];
    for (const desc of CHILD_COLLECTIONS) {
      const Model = await loadChildModel(desc);
      if (!Model) continue;
      const existing = { retained: (journal[desc.key]?.retained || []).map((r) => r.id) };
      const plan = await planDescriptor(desc, Model, survivorId, loserId, retained, existing);
      retained[desc.key] = [...existing.retained, ...plan.retain.map((r) => r.id)];
      plans.push({ desc, Model, plan });
    }
    return plans;
  }

  /** Side-by-side compare + counts of history that would move (no writes). */
  async preview(survivorId, loserId) {
    const [survivor, loser] = await Promise.all([readLead(survivorId), readLead(loserId)]);
    this._validatePair(survivor, loser, survivorId, loserId);
    const plans = await this._planAll(survivor._id, loser._id);
    const counts = plans.map(({ desc, plan }) => ({
      key: desc.key,
      label: desc.label,
      move: desc.kind === 'array' ? (plan.replace?.length || 0) + (plan.pull?.length || 0) : plan.move.length,
      retained: plan.retain.length,
      consentUpgrades: plan.consentMerges.length,
    })).filter((c) => c.move || c.retained || c.consentUpgrades);
    const takeovers = qualificationTakeovers(survivor.qualification?.fields || [], loser.qualification?.fields || []);
    const defaults = defaultSelections(survivor, loser);
    const { qualification: _sq, ...survivorView } = survivor;
    const { qualification: _lq, ...loserView } = loser;
    return {
      survivor: { ...survivorView, qualification: { fields: survivor.qualification?.fields || [], historyCount: survivor.qualification?.history?.length || 0 } },
      loser: { ...loserView, qualification: { fields: loser.qualification?.fields || [], historyCount: loser.qualification?.history?.length || 0 } },
      fields: MERGEABLE_FIELDS.map((field) => ({
        field,
        survivorValue: survivor[field] ?? null,
        loserValue: loser[field] ?? null,
        same: same(survivor[field], loser[field]),
        defaultWinner: defaults[field],
      })),
      counts,
      totalToMove: counts.reduce((n, c) => n + c.move, 0),
      qualification: {
        takeoverKeys: takeovers.map((f) => f.fieldKey),
        historyToAdd: loser.qualification?.history?.length || 0,
      },
      tagsToAdd: (loser.tags || []).filter((t) => !(survivor.tags || []).includes(t)),
      dncPreserved: true,
    };
  }

  // ── merge ────────────────────────────────────────────────────────────────
  async merge({ survivorId, loserId, fieldSelections = {}, candidateId = null }, userId, meta = {}) {
    if (s(survivorId) === s(loserId)) throw new ValidationError('A lead cannot be merged into itself');

    // A merge that was interrupted for this exact pair is finished, not restarted.
    const pending = await LeadMerge.findOne({ survivorId, loserId, status: 'in_progress' }).select('_id').lean();
    if (pending) return this.resume(pending._id, userId, meta);
    const blocking = await LeadMerge.findOne({
      status: { $in: ['in_progress', 'undoing'] },
      $or: [{ survivorId: { $in: [survivorId, loserId] } }, { loserId: { $in: [survivorId, loserId] } }],
    }).select('_id').lean();
    if (blocking) {
      throw coded('An unfinished merge involves one of these leads; resume it first', 409, 'MERGE_PENDING', [{ field: 'mergeId', message: s(blocking._id) }]);
    }

    const mergeId = new mongoose.Types.ObjectId();
    const token = crypto.randomUUID();
    await this._lockBoth(survivorId, loserId, mergeId, token);
    let journal;
    try {
      // Snapshots are taken under the lock so nothing can change between read and record.
      const [survivor, loser] = await Promise.all([readLead(survivorId), readLead(loserId)]);
      this._validatePair(survivor, loser, survivorId, loserId);
      const { patch, addedTags, selections } = buildSurvivorPatch(survivor, loser, fieldSelections);
      journal = await LeadMerge.create({
        _id: mergeId,
        survivorId: survivor._id,
        loserId: loser._id,
        survivorName: survivor.name,
        loserName: loser.name,
        survivorNumber: survivor.leadNumber,
        loserNumber: loser.leadNumber,
        candidateId: candidateId || null,
        fieldSelections: selections,
        survivorBefore: snapshot(survivor),
        loserBefore: snapshot(loser),
        survivorPatch: patch,
        addedTags,
        mergedBy: userId,
      });
    } catch (err) {
      await this._release([survivorId, loserId], token);
      throw err;
    }
    return this._run(journal._id, token, userId, meta);
  }

  /** Finish an interrupted merge (idempotent; a completed merge is returned as is). */
  async resume(mergeId, userId, meta = {}) {
    const journal = await LeadMerge.findById(mergeId).lean();
    if (!journal) throw new NotFoundError('Lead merge', mergeId);
    if (journal.status !== 'in_progress') return this._serialize(journal);
    const token = crypto.randomUUID();
    await this._lockBoth(journal.survivorId, journal.loserId, journal._id, token, { allowDeleted: true });
    return this._run(journal._id, token, userId, meta);
  }

  async _markStep(mergeId, step) {
    await LeadMerge.updateOne({ _id: mergeId }, { $set: { [`steps.${step}`]: { status: 'done', at: new Date() } } });
  }

  async _run(mergeId, token, userId, meta) {
    let journal = await LeadMerge.findByIdAndUpdate(mergeId, { $inc: { attempts: 1 } }, { returnDocument: 'after' }).lean();
    const S = journal.survivorId;
    const L = journal.loserId;
    try {
      for (const step of STEP_ORDER) {
        if (journal.steps?.[step]?.status === 'done') continue;
        // Keep the locks alive across long steps.
        await this._acquire(S, journal._id, token, { allowDeleted: true });
        await this._acquire(L, journal._id, token, { allowDeleted: true });
        if (step === 'children' || step === 'children_final') await this._stepChildren(journal);
        else if (step === 'survivor') await this._stepSurvivor(journal);
        else if (step === 'loser') await this._stepLoser(journal);
        else if (step === 'candidates') await this._stepCandidates(journal);
        await this._markStep(journal._id, step);
        journal = await LeadMerge.findById(journal._id).lean();
      }
      const counts = this._counts(journal.children);
      journal = await LeadMerge.findByIdAndUpdate(journal._id, {
        $set: { status: 'completed', completedAt: new Date(), lastError: null, counts },
      }, { returnDocument: 'after' }).lean();
    } catch (err) {
      await LeadMerge.updateOne({ _id: mergeId }, { $set: { lastError: String(err?.message || err).slice(0, 1000) } });
      await this._release([S, L], token);
      logger.error('Lead merge step failed; resumable', { module: 'crm', action: 'leadMerge.run', mergeId: s(mergeId), error: { message: err?.message } });
      throw coded('The merge was interrupted and can be resumed', 500, 'MERGE_INTERRUPTED', [{ field: 'mergeId', message: s(mergeId) }]);
    }
    await this._release([S, L], token);

    auditService.logEvent({
      eventType: 'lead.merged',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        mergeId: s(journal._id), survivorId: s(S), loserId: s(L), survivorNumber: journal.survivorNumber, loserNumber: journal.loserNumber,
        counts: journal.counts, fieldSelections: journal.fieldSelections, attempts: journal.attempts,
      },
      module: 'lead',
    });
    logger.info('Leads merged', { module: 'crm', action: 'leadMerge.merge', mergeId: s(journal._id), survivorId: s(S), loserId: s(L) });
    await this._afterChange([S], 'merge');
    try { global.io?.to(`user:${s(userId)}`).emit('lead:merged', { mergeId: s(journal._id), survivorId: s(S), loserId: s(L) }); } catch { /* best-effort */ }
    return this._serialize(journal);
  }

  async _afterChange(leadIds, reason) {
    for (const id of leadIds) {
      try { await leadScoringService.recalculate(id, { reason }); } catch (err) {
        logger.warn('Rescore after merge failed', { module: 'crm', action: 'leadMerge.rescore', leadId: s(id), error: { message: err.message } });
      }
    }
    await leadDuplicateService.scheduleDetect(leadIds);
  }

  async _stepChildren(journal) {
    const S = journal.survivorId;
    const L = journal.loserId;
    const plans = await this._planAll(S, L, journal.children || {});
    for (const { desc, Model, plan } of plans) {
      const recorded = journal.children?.[desc.key] || {};
      const set = {};
      const addToSet = {};
      if (desc.kind === 'array') {
        if (plan.replace?.length) addToSet[`children.${desc.key}.replace`] = { $each: plan.replace };
        if (plan.pull?.length) addToSet[`children.${desc.key}.pull`] = { $each: plan.pull };
      } else {
        if (plan.move.length) addToSet[`children.${desc.key}.moved`] = { $each: plan.move };
        if (plan.retain.length) addToSet[`children.${desc.key}.retained`] = { $each: plan.retain };
        // A consent upgrade is recorded once, with the survivor row's ORIGINAL values.
        const knownConsent = new Set((recorded.consentMerges || []).map((c) => s(c.docId)));
        const newConsent = plan.consentMerges.filter((c) => !knownConsent.has(s(c.docId)));
        if (newConsent.length) addToSet[`children.${desc.key}.consentMerges`] = { $each: newConsent };
        const knownLedger = new Map((recorded.ledgerMerges || []).map((l) => [s(l.docId), l]));
        for (const lm of plan.ledgerMerges) {
          const prev = knownLedger.get(s(lm.docId));
          const events = [...(prev?.events || [])];
          const have = new Set(events.map((e) => s(e.touchId)));
          for (const e of lm.events) if (!have.has(s(e.touchId))) events.push(e);
          knownLedger.set(s(lm.docId), { docId: lm.docId, events });
        }
        if (plan.ledgerMerges.length) set[`children.${desc.key}.ledgerMerges`] = [...knownLedger.values()];
      }
      if (Object.keys(addToSet).length || Object.keys(set).length) {
        // Journal first (native driver: Mixed paths, real ObjectIds), then write.
        await LeadMerge.collection.updateOne({ _id: journal._id }, {
          ...(Object.keys(addToSet).length ? { $addToSet: addToSet } : {}),
          ...(Object.keys(set).length ? { $set: set } : {}),
        });
      }
      await applyDescriptor(desc, Model, S, L, plan);
    }
  }

  async _stepSurvivor(journal) {
    const S = journal.survivorId;
    const L = journal.loserId;
    const patch = journal.survivorPatch || {};
    await Lead.updateOne(
      { _id: S },
      {
        ...(Object.keys(patch).length ? { $set: patch } : {}),
        $addToSet: { mergedLeadIds: L, ...(journal.addedTags?.length ? { tags: { $each: journal.addedTags } } : {}) },
      },
      { runValidators: false },
    );

    const loserQ = journal.loserBefore?.qualification;
    if (!loserQ || (!(loserQ.fields || []).length && !(loserQ.history || []).length)) return;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await readLead(S, { includeDeleted: true });
      const currentQ = current.qualification || null;
      const fields = currentQ?.fields || [];
      const taken = qualificationTakeovers(fields, loserQ.fields || []);
      const historyIds = new Set((currentQ?.history || []).map((h) => s(h._id)));
      const addHistory = (loserQ.history || []).filter((h) => !historyIds.has(s(h._id)));
      if (taken.length || addHistory.length) {
        await LeadMerge.collection.updateOne({ _id: journal._id }, {
          $addToSet: {
            takenQualificationKeys: { $each: taken.map((f) => f.fieldKey) },
            addedHistoryIds: { $each: addHistory.filter((h) => h._id).map((h) => oid(h._id)) },
          },
        });
      } else {
        return;
      }
      const takenByKey = new Map(taken.map((f) => [f.fieldKey, f]));
      const nextFields = [
        ...fields.map((f) => takenByKey.get(f.fieldKey) || f),
        ...taken.filter((f) => !fields.some((cf) => cf.fieldKey === f.fieldKey)),
      ];
      const now = new Date();
      const filter = currentQ
        ? { _id: S, 'qualification.updatedAt': currentQ.updatedAt ?? null }
        : { _id: S, $or: [{ qualification: null }, { qualification: { $exists: false } }] };
      const update = currentQ
        ? {
          $set: { 'qualification.fields': nextFields, 'qualification.updatedAt': now },
          ...(addHistory.length ? { $push: { 'qualification.history': { $each: addHistory, $sort: { changedAt: 1 } } } } : {}),
        }
        : { $set: { qualification: { fields: nextFields, updatedAt: now, history: addHistory } } };
      const res = await Lead.updateOne(filter, update, { runValidators: false });
      if (res.matchedCount === 1) return;
      // A concurrent answer landed between read and write — re-read and retry.
    }
    throw new Error('Survivor qualification changed concurrently; retry the merge');
  }

  async _stepLoser(journal) {
    const now = new Date();
    await Lead.updateOne(
      { _id: journal.loserId },
      { $set: { isDeleted: true, deletedAt: now, mergedInto: journal.survivorId, mergedAt: now } },
      { runValidators: false },
    );
  }

  async _stepCandidates(journal) {
    const key = pairKeyOf(journal.survivorId, journal.loserId);
    await LeadDuplicateCandidate.updateOne({ pairKey: key }, { $set: { status: 'merged', mergeId: journal._id } });
    await LeadDuplicateCandidate.updateMany(
      { leadIds: journal.loserId, status: 'open', pairKey: { $ne: key } },
      { $set: { status: 'stale' } },
    );
  }

  _counts(children = {}) {
    const out = {};
    for (const [key, rec] of Object.entries(children || {})) {
      out[key] = {
        moved: (rec.moved?.length || 0) + (rec.replace?.length || 0) + (rec.pull?.length || 0),
        retained: rec.retained?.length || 0,
        consentUpgrades: rec.consentMerges?.length || 0,
      };
    }
    return out;
  }

  // ── undo ─────────────────────────────────────────────────────────────────
  async undo(mergeId, userId, meta = {}) {
    const journal = await LeadMerge.findById(mergeId).lean();
    if (!journal) throw new NotFoundError('Lead merge', mergeId);
    if (journal.status === 'undone') throw coded('This merge has already been undone', 409, 'ALREADY_UNDONE');
    if (!['completed', 'undoing'].includes(journal.status)) {
      throw coded('Only a completed merge can be undone; resume it first', 409, 'MERGE_NOT_COMPLETED');
    }
    const S = journal.survivorId;
    const L = journal.loserId;
    const token = crypto.randomUUID();
    await this._lockBoth(S, L, journal._id, token, { allowDeleted: true });
    try {
      if (journal.status === 'completed') {
        await this._assertUndoable(journal);
        await LeadMerge.updateOne({ _id: journal._id, status: 'completed' }, { $set: { status: 'undoing' } });
      }
      const result = { restored: {}, conflicts: [] };
      let current = await LeadMerge.findById(journal._id).lean();
      for (const step of UNDO_ORDER) {
        if (current.undoSteps?.[step]) continue;
        if (step === 'survivor') await this._undoSurvivor(current);
        else if (step === 'children') Object.assign(result, await this._undoChildren(current));
        else if (step === 'loser') {
          await Lead.updateOne({ _id: L }, { $set: { isDeleted: false, deletedAt: null, mergedInto: null, mergedAt: null } }, { runValidators: false });
        } else if (step === 'candidates') {
          await LeadDuplicateCandidate.updateOne({ pairKey: pairKeyOf(S, L), mergeId: journal._id }, { $set: { status: 'open', mergeId: null } });
        }
        await LeadMerge.updateOne({ _id: journal._id }, { $set: { [`undoSteps.${step}`]: new Date() } });
        current = await LeadMerge.findById(journal._id).lean();
      }
      await LeadMerge.updateOne({ _id: journal._id }, {
        $set: { status: 'undone', undoneAt: new Date(), undoneBy: userId, undoResult: result },
      });
      auditService.logEvent({
        eventType: 'lead.merge_undone',
        userId,
        ipAddress: meta.ipAddress || 'internal',
        userAgent: meta.userAgent,
        result: 'success',
        details: { mergeId: s(journal._id), survivorId: s(S), loserId: s(L), restored: result.restored, conflicts: result.conflicts },
        module: 'lead',
      });
      logger.info('Lead merge undone', { module: 'crm', action: 'leadMerge.undo', mergeId: s(journal._id) });
    } finally {
      await this._release([S, L], token);
    }
    await this._afterChange([S, L], 'merge_undo');
    return this._serialize(await LeadMerge.findById(journal._id).lean());
  }

  /** Undo is refused when it would clobber something that happened after the merge. */
  async _assertUndoable(journal) {
    const S = journal.survivorId;
    const L = journal.loserId;
    const [survivor, loser] = await Promise.all([readLead(S, { includeDeleted: true }), readLead(L, { includeDeleted: true })]);
    const conflicts = [];
    if (!survivor || survivor.isDeleted) conflicts.push({ field: 'survivor', message: 'The surviving lead was deleted or merged since' });
    if (!loser || s(loser.mergedInto) !== s(S)) conflicts.push({ field: 'loser', message: 'The merged lead was changed since' });
    const later = await LeadMerge.findOne({
      _id: { $ne: journal._id },
      createdAt: { $gt: journal.createdAt },
      status: { $in: ['in_progress', 'completed', 'undoing'] },
      $or: [{ survivorId: S }, { loserId: S }],
    }).select('_id').lean();
    if (later) conflicts.push({ field: 'mergeId', message: `A later merge (${s(later._id)}) involves the surviving lead; undo it first` });
    if (survivor) {
      for (const [field, value] of Object.entries(journal.survivorPatch || {})) {
        if (field === 'lastContactedAt' || field === 'lastContactChannel') continue;
        if (!same(survivor[field], value)) conflicts.push({ field, message: 'Changed after the merge' });
      }
      const loserFields = new Map((journal.loserBefore?.qualification?.fields || []).map((f) => [f.fieldKey, f]));
      const currentFields = new Map((survivor.qualification?.fields || []).map((f) => [f.fieldKey, f]));
      for (const key of journal.takenQualificationKeys || []) {
        if (!same(currentFields.get(key), loserFields.get(key))) conflicts.push({ field: `qualification.${key}`, message: 'Answer changed after the merge' });
      }
    }
    if (conflicts.length) throw coded('This merge can no longer be undone safely', 409, 'UNDO_CONFLICT', conflicts);
  }

  async _undoSurvivor(journal) {
    const S = journal.survivorId;
    const before = journal.survivorBefore || {};
    const restore = {};
    for (const field of Object.keys(journal.survivorPatch || {})) {
      if (field === 'lastContactedAt' || field === 'lastContactChannel') continue;
      restore[field] = before[field] ?? null;
    }
    await Lead.updateOne(
      { _id: S },
      {
        ...(Object.keys(restore).length ? { $set: restore } : {}),
        $pull: { mergedLeadIds: journal.loserId, ...(journal.addedTags?.length ? { tags: { $in: journal.addedTags } } : {}) },
      },
      { runValidators: false },
    );
    const keys = journal.takenQualificationKeys || [];
    const histIds = journal.addedHistoryIds || [];
    if (!keys.length && !histIds.length) return;
    const current = await readLead(S, { includeDeleted: true });
    const beforeFields = new Map((before.qualification?.fields || []).map((f) => [f.fieldKey, f]));
    const nextFields = (current.qualification?.fields || [])
      .map((f) => (keys.includes(f.fieldKey) ? beforeFields.get(f.fieldKey) || null : f))
      .filter(Boolean);
    await Lead.updateOne(
      { _id: S },
      {
        $set: { 'qualification.fields': nextFields },
        ...(histIds.length ? { $pull: { 'qualification.history': { _id: { $in: histIds.map(oid) } } } } : {}),
      },
      { runValidators: false },
    );
  }

  async _undoChildren(journal) {
    const restored = {};
    const conflicts = [];
    // Children before parents is irrelevant here: every row is re-pointed by id.
    for (const desc of CHILD_COLLECTIONS) {
      const record = journal.children?.[desc.key];
      if (!record) continue;
      const Model = await loadChildModel(desc);
      if (!Model) continue;
      const r = await revertDescriptor(desc, Model, journal.survivorId, journal.loserId, record);
      restored[desc.key] = r.restored;
      conflicts.push(...r.conflicts);
    }
    return { restored, conflicts };
  }

  // ── reads ────────────────────────────────────────────────────────────────
  _serialize(journal) {
    if (!journal) return null;
    const { survivorBefore, loserBefore, children, ...rest } = journal;
    return {
      ...rest,
      id: s(journal._id),
      counts: journal.counts && Object.keys(journal.counts).length ? journal.counts : this._counts(children),
      survivorBefore: survivorBefore ? { leadNumber: survivorBefore.leadNumber, name: survivorBefore.name } : null,
      loserBefore: loserBefore ? { leadNumber: loserBefore.leadNumber, name: loserBefore.name } : null,
    };
  }

  async list({ limit = 20, cursor = null, status = null, leadId = null } = {}) {
    const filter = {};
    if (status) filter.status = status;
    if (leadId) filter.$or = [{ survivorId: leadId }, { loserId: leadId }];
    if (cursor) filter._id = { $lt: cursor };
    const docs = await LeadMerge.find(filter).sort({ _id: -1 }).limit(limit + 1)
      .select('-survivorBefore -loserBefore')
      .populate({ path: 'mergedBy', select: 'firstName lastName email', options: { includeDeleted: true } })
      .populate({ path: 'undoneBy', select: 'firstName lastName email', options: { includeDeleted: true } })
      .lean();
    const hasNext = docs.length > limit;
    const page = hasNext ? docs.slice(0, limit) : docs;
    return {
      data: page.map((d) => this._serialize(d)),
      pagination: { hasNext, nextCursor: hasNext ? s(page[page.length - 1]._id) : null, limit },
    };
  }

  async getById(mergeId) {
    const journal = await LeadMerge.findById(mergeId).lean();
    if (!journal) throw new NotFoundError('Lead merge', mergeId);
    return this._serialize(journal);
  }

  /** Periodic recovery: finish merges whose process died (lock expired). */
  async recoverStale({ olderThanMs = LOCK_MS } = {}) {
    const stale = await LeadMerge.find({ status: 'in_progress', updatedAt: { $lt: new Date(Date.now() - olderThanMs) } })
      .select('_id mergedBy').limit(20).lean();
    let resumed = 0;
    for (const m of stale) {
      try { await this.resume(m._id, m.mergedBy, { ipAddress: 'internal' }); resumed += 1; } catch (err) {
        logger.warn('Stale lead merge could not be resumed', { module: 'crm', action: 'leadMerge.recover', mergeId: s(m._id), error: { message: err.message } });
      }
    }
    return { candidates: stale.length, resumed };
  }
}

const leadMergeService = new LeadMergeService();
export default leadMergeService;
