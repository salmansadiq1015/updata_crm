import mongoose from 'mongoose';
import logger from '../../shared/logger/index.js';

/**
 * Every collection that points at a lead, and how a merge moves it.
 *
 * Kinds:
 *  - ref    (default) a single lead reference field. Moved by re-pointing the
 *           field from loser → survivor, by recorded _id (so undo replays
 *           exactly that set and never touches the survivor's own rows).
 *  - array  a lead id inside an array (campaign membership). The loser id is
 *           replaced in place, or pulled when the survivor is already listed.
 *
 * Options:
 *  - uniqueWith  fields that, together with the lead field, form a unique index.
 *                A loser row whose tuple already exists on the survivor cannot
 *                be moved; it is RETAINED on the (soft-deleted) loser — the
 *                timeline still reads it through survivor.mergedLeadIds.
 *  - consent     on such a conflict the STRICTER consent status is copied onto
 *                the survivor's row (a do-not-contact is never lost); the
 *                survivor row's previous values are recorded for undo.
 *  - ledger      (contact-policy ledger, unique per lead) the loser's recent
 *                touch events are appended to the survivor's ledger so
 *                frequency caps keep counting them.
 *  - parent      rows that belong to a parent row that was retained stay with
 *                it (e.g. SMS messages of a retained conversation).
 *
 * Modules that are absent in a deployment are skipped (dynamic import).
 * ORDER MATTERS: parents precede their children.
 */
export const CHILD_COLLECTIONS = Object.freeze([
  { key: 'leadCommunications', label: 'Communications', path: './leadCommunication.model.js', field: 'leadId' },
  { key: 'contactLogEntries', label: 'Contact log entries', path: './contactLog.model.js', field: 'leadId' },
  { key: 'callRecipients', label: 'AI call campaign recipients', path: '../aiCalling/campaignRecipient.model.js', field: 'leadId', uniqueWith: ['campaignId'] },
  { key: 'callRecords', label: 'AI calls', path: '../aiCalling/callRecord.model.js', field: 'leadId', parent: { key: 'callRecipients', field: 'recipientId' } },
  { key: 'callTransitions', label: 'AI call status transitions', path: '../aiCalling/leadCallEvent.model.js', exportName: 'LeadCallTransition', field: 'leadId' },
  { key: 'linkSessions', label: 'SMS-link assistant sessions', path: '../linkAssistant/linkSession.model.js', field: 'leadId', parent: { key: 'callRecipients', field: 'recipientId' } },
  { key: 'callConsents', label: 'Call consents', path: '../aiCalling/callConsent.model.js', field: 'leadId', uniqueWith: ['createdBy', 'phoneHash'], consent: { revoked: 3, denied: 2, granted: 1 } },
  { key: 'callSuppressions', label: 'Do-not-call entries', path: '../aiCalling/callSuppression.model.js', field: 'leadId' },
  { key: 'simSmsConversations', label: 'SIM SMS conversations', path: '../simSms/simSmsConversation.model.js', field: 'leadId', uniqueWith: ['campaignId'] },
  { key: 'simSmsMessages', label: 'SIM SMS messages', path: '../simSms/simSmsMessage.model.js', field: 'leadId', parent: { key: 'simSmsConversations', field: 'conversationId' } },
  { key: 'smsAnswerReviews', label: 'SMS answer reviews', path: '../simSms/smsAnswerReview.model.js', field: 'leadId', parent: { key: 'simSmsConversations', field: 'conversationId' } },
  { key: 'smsRecoveryItems', label: 'SMS recovery items', path: '../simSms/recoveryItem.model.js', field: 'leadId', parent: { key: 'simSmsConversations', field: 'conversationId' } },
  { key: 'simCallTasks', label: 'SIM call tasks', path: '../simCall/simCallTask.model.js', field: 'leadId', uniqueWith: ['campaignId'] },
  { key: 'simCallEvents', label: 'SIM call events', path: '../simCall/simCallEvent.model.js', field: 'leadId', parent: { key: 'simCallTasks', field: 'taskId' } },
  { key: 'messageRecipients', label: 'Message campaign recipients', path: '../messaging/messageRecipient.model.js', field: 'leadId', uniqueWith: ['campaignId'] },
  { key: 'messageDeliveryEvents', label: 'Message delivery events', path: '../messaging/deliveryEvent.model.js', field: 'leadId', parent: { key: 'messageRecipients', field: 'recipientId' } },
  { key: 'channelConsents', label: 'Channel consents', path: '../messaging/consent.model.js', field: 'leadId', uniqueWith: ['channel'], consent: { revoked: 3, denied: 2, granted: 1, unknown: 0 } },
  { key: 'messageSuppressions', label: 'Message suppressions', path: '../messaging/suppression.model.js', field: 'leadId' },
  { key: 'optOutEvents', label: 'Opt-out events', path: '../linkAssistant/optOutEvent.model.js', field: 'leadId' },
  { key: 'discoveryImports', label: 'Discovery results (imported)', path: '../businessDiscovery/discoveryResult.model.js', field: 'import.leadId' },
  { key: 'discoveryMatches', label: 'Discovery results (matched)', path: '../businessDiscovery/discoveryResult.model.js', field: 'matching.matchedLeadId' },
  { key: 'contactTouches', label: 'Contact-policy touches', path: '../contactPolicy/contactPolicy.models.js', exportName: 'ContactTouch', field: 'leadId' },
  { key: 'contactLedgers', label: 'Contact-policy ledger', path: '../contactPolicy/contactPolicy.models.js', exportName: 'ContactLedger', field: 'leadId', uniqueWith: [], ledger: true },
  { key: 'contactPolicyDenials', label: 'Contact-policy denials', path: '../contactPolicy/contactPolicy.models.js', exportName: 'ContactPolicyDenial', field: 'leadId', uniqueWith: ['source', 'campaignId'] },
  { key: 'followUps', label: 'Follow-ups', path: './leadFollowUp.model.js', field: 'leadId' },
  { key: 'leadEvents', label: 'Timeline events', path: './leadEvent.model.js', field: 'leadId' },
  { key: 'callCampaignLeads', label: 'AI call campaign lead lists', path: '../aiCalling/callCampaign.model.js', field: 'leadIds', kind: 'array' },
  { key: 'messageCampaignLeads', label: 'Message campaign lead lists', path: '../messaging/campaign.model.js', field: 'leadIds', kind: 'array' },
  { key: 'enrichmentJobLeads', label: 'Enrichment job lead lists', path: './leadEnrichmentJob.model.js', field: 'leadIds', kind: 'array' },
].map((d) => Object.freeze(d)));

const modelCache = new Map();

/** Resolve a descriptor's model, or null when its module is not deployed. */
export async function loadChildModel(desc) {
  const cacheKey = `${desc.path}#${desc.exportName || 'default'}`;
  if (modelCache.has(cacheKey)) return modelCache.get(cacheKey);
  let Model = null;
  try {
    const mod = await import(desc.path);
    Model = (desc.exportName ? mod[desc.exportName] : mod.default) || null;
  } catch (err) {
    const notDeployed = err?.code === 'ERR_MODULE_NOT_FOUND' || /Cannot find module/i.test(String(err?.message));
    if (!notDeployed) {
      logger.warn('Lead merge: child model failed to load', { module: 'crm', action: 'leadMerge.loadModel', path: desc.path, error: { message: err.message } });
    }
    Model = null;
  }
  modelCache.set(cacheKey, Model);
  return Model;
}

const oid = (v) => (v instanceof mongoose.Types.ObjectId ? v : new mongoose.Types.ObjectId(String(v)));
const s = (v) => (v == null ? null : String(v));
const get = (doc, path) => path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), doc);

/**
 * Plan one move pass for a descriptor (pure read). Returns the ids to move,
 * rows to retain (+why), consent upgrades and ledger appends. `retained` is the
 * map of retained ids so far (parents first), keyed by descriptor key.
 */
export async function planDescriptor(desc, Model, survivorId, loserId, retained = {}, existing = {}) {
  const plan = { move: [], retain: [], consentMerges: [], ledgerMerges: [] };
  if (desc.kind === 'array') {
    const docs = await Model.find({ [desc.field]: oid(loserId) }).setOptions({ includeDeleted: true })
      .select(`_id ${desc.field}`).lean();
    plan.replace = docs.filter((d) => !(d[desc.field] || []).some((x) => s(x) === s(survivorId))).map((d) => d._id);
    plan.pull = docs.filter((d) => (d[desc.field] || []).some((x) => s(x) === s(survivorId))).map((d) => d._id);
    return plan;
  }

  const projection = ['_id', desc.field, ...(desc.uniqueWith || []), ...(desc.parent ? [desc.parent.field] : []), ...(desc.consent ? ['status', 'evidence', 'source', 'capturedAt', 'expiresAt', 'revokedAt', 'changedBy'] : []), ...(desc.ledger ? ['events'] : [])];
  const loserDocs = await Model.find({ [desc.field]: oid(loserId) }).setOptions({ includeDeleted: true })
    .select([...new Set(projection)].join(' ')).lean();
  const alreadyRetained = new Set((existing.retained || []).map(s));
  let candidates = loserDocs.filter((d) => !alreadyRetained.has(s(d._id)));

  if (desc.parent) {
    const parentRetained = new Set((retained[desc.parent.key] || []).map(s));
    const [stay, go] = [[], []];
    for (const d of candidates) (parentRetained.has(s(get(d, desc.parent.field))) ? stay : go).push(d);
    plan.retain.push(...stay.map((d) => ({ id: d._id, reason: 'parent_retained' })));
    candidates = go;
  }

  if (desc.uniqueWith && candidates.length) {
    const survivorDocs = await Model.find({ [desc.field]: oid(survivorId) }).setOptions({ includeDeleted: true })
      .select([...new Set(projection)].join(' ')).lean();
    const tupleOf = (d) => JSON.stringify((desc.uniqueWith || []).map((f) => s(get(d, f))));
    const survivorByTuple = new Map(survivorDocs.map((d) => [tupleOf(d), d]));
    const go = [];
    for (const d of candidates) {
      const twin = survivorByTuple.get(tupleOf(d));
      if (!twin) { go.push(d); continue; }
      plan.retain.push({ id: d._id, reason: 'unique_conflict' });
      if (desc.consent) {
        const rank = (st) => desc.consent[st] ?? 0;
        if (rank(d.status) > rank(twin.status)) {
          plan.consentMerges.push({
            docId: twin._id,
            fromId: d._id,
            before: { status: twin.status ?? null, evidence: twin.evidence ?? '', source: twin.source ?? null, capturedAt: twin.capturedAt ?? null, expiresAt: twin.expiresAt ?? null, revokedAt: twin.revokedAt ?? null },
            after: { status: d.status, evidence: d.evidence ?? '', source: d.source ?? null, capturedAt: d.capturedAt ?? null, expiresAt: d.expiresAt ?? null, revokedAt: d.revokedAt ?? null },
          });
        }
      }
      if (desc.ledger) {
        const have = new Set((twin.events || []).map((e) => s(e.touchId)));
        const add = (d.events || []).filter((e) => !have.has(s(e.touchId)));
        if (add.length) plan.ledgerMerges.push({ docId: twin._id, events: add });
      }
    }
    candidates = go;
  }

  plan.move = candidates.map((d) => d._id);
  return plan;
}

/** Apply a planned move for one descriptor. Every write is conditional → idempotent. */
export async function applyDescriptor(desc, Model, survivorId, loserId, plan) {
  const S = oid(survivorId);
  const L = oid(loserId);
  if (desc.kind === 'array') {
    if (plan.replace?.length) {
      await Model.updateMany(
        { _id: { $in: plan.replace }, [desc.field]: L },
        { $set: { [`${desc.field}.$[x]`]: S } },
        { arrayFilters: [{ x: L }], timestamps: false, strict: false },
      );
    }
    if (plan.pull?.length) {
      await Model.updateMany({ _id: { $in: plan.pull } }, { $pull: { [desc.field]: L } }, { timestamps: false, strict: false });
    }
    return;
  }
  if (plan.move.length) {
    await Model.updateMany({ _id: { $in: plan.move }, [desc.field]: L }, { $set: { [desc.field]: S } }, { timestamps: false, strict: false });
  }
  for (const cm of plan.consentMerges || []) {
    await Model.updateOne({ _id: cm.docId }, { $set: cm.after }, { strict: false });
  }
  for (const lm of plan.ledgerMerges || []) {
    // Only the touches not already present (a retried pass must not double count).
    const doc = await Model.findById(lm.docId).select('events').lean();
    const have = new Set((doc?.events || []).map((e) => s(e.touchId)));
    const add = lm.events.filter((e) => !have.has(s(e.touchId)));
    if (add.length) await Model.updateOne({ _id: lm.docId }, { $push: { events: { $each: add } } });
  }
}

/** Reverse one descriptor's recorded moves. Returns how many rows went back. */
export async function revertDescriptor(desc, Model, survivorId, loserId, record = {}) {
  const S = oid(survivorId);
  const L = oid(loserId);
  let restored = 0;
  const conflicts = [];
  if (desc.kind === 'array') {
    if (record.replace?.length) {
      const r = await Model.updateMany(
        { _id: { $in: record.replace.map(oid) }, [desc.field]: S },
        { $set: { [`${desc.field}.$[x]`]: L } },
        { arrayFilters: [{ x: S }], timestamps: false, strict: false },
      );
      restored += r.modifiedCount || 0;
    }
    if (record.pull?.length) {
      const r = await Model.updateMany({ _id: { $in: record.pull.map(oid) } }, { $addToSet: { [desc.field]: L } }, { timestamps: false, strict: false });
      restored += r.modifiedCount || 0;
    }
    return { restored, conflicts };
  }
  if (record.moved?.length) {
    const r = await Model.updateMany({ _id: { $in: record.moved.map(oid) }, [desc.field]: S }, { $set: { [desc.field]: L } }, { timestamps: false, strict: false });
    restored += r.modifiedCount || 0;
  }
  for (const cm of record.consentMerges || []) {
    const current = await Model.findById(cm.docId).select('status').lean();
    // Put the survivor's own consent back only if nobody changed it since.
    if (current && current.status === cm.after.status) {
      await Model.updateOne({ _id: cm.docId }, { $set: cm.before }, { strict: false });
    } else if (current) {
      conflicts.push({ collection: desc.key, docId: s(cm.docId), reason: 'consent_changed_since_merge' });
    }
  }
  for (const lm of record.ledgerMerges || []) {
    const ids = (lm.events || []).map((e) => e.touchId);
    if (ids.length) await Model.updateOne({ _id: lm.docId }, { $pull: { events: { touchId: { $in: ids } } } });
  }
  return { restored, conflicts };
}
