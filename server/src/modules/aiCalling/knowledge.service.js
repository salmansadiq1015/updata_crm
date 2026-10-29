import { KnowledgeEntry, KnowledgeVersion } from './knowledge.model.js';
import CallingAgent from './callingAgent.model.js';
import CallRecord from './callRecord.model.js';
import auditService from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { buildKnowledgeSection, diffKnowledgeVersions } from './engine/knowledgeCompliance.js';

const CONTENT_FIELDS = ['type', 'title', 'content', 'price', 'allowedPromises', 'forbiddenClaims', 'variants', 'tags'];
const pick = (obj, keys) => Object.fromEntries(keys.filter(k => obj[k] !== undefined).map(k => [k, obj[k]]));

function log(eventType, actor, details, meta = {}) {
  auditService.logEvent({
    eventType: `ai_calling.knowledge.${eventType}`, module: 'ai-calling', userId: actor, result: 'success',
    ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, details,
  });
}

/**
 * Approved business knowledge: entries, approval, immutable published versions,
 * rollback, and the version an agent speaks from. Company-wide (single-tenant):
 * authoring needs ai-calling:write, approving/publishing/rolling back ai-calling:admin.
 */
class KnowledgeService {
  async list({ status, type, search, page = 1, limit = 50 } = {}) {
    const filter = {};
    if (status) filter.status = status;
    else filter.status = { $ne: 'archived' };
    if (type) filter.type = type;
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ title: rx }, { content: rx }, { tags: rx }];
    }
    const [data, total, latest] = await Promise.all([
      KnowledgeEntry.find(filter).sort({ updatedAt: -1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
      KnowledgeEntry.countDocuments(filter),
      this.latestVersion(),
    ]);
    const published = new Map((latest?.entries || []).map(e => [String(e.entryId), e.revision]));
    return {
      data: {
        entries: data.map(e => ({ ...e, publishedRevision: published.get(String(e._id)) ?? null, inLatestVersion: published.has(String(e._id)) })),
        latestVersion: latest ? { _id: latest._id, version: latest.version, publishedAt: latest.publishedAt, entryCount: latest.entries.length } : null,
      },
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async get(id) {
    const entry = await KnowledgeEntry.findById(id).lean();
    if (!entry) throw new NotFoundError('KnowledgeEntry', id);
    return entry;
  }

  _validate(data) {
    if (data.type === 'pricing' && !(data.price && data.price.amount != null) && !String(data.content || '').trim()) {
      throw new ValidationError('A pricing entry needs a price or a description of the pricing');
    }
    if (data.price?.amount != null && !data.price.currency) throw new ValidationError('Give the currency for the price');
  }

  async create(input, actor, meta) {
    const data = pick(input, CONTENT_FIELDS);
    this._validate(data);
    const entry = await KnowledgeEntry.create({ ...data, status: 'draft', createdBy: actor, updatedBy: actor });
    log('created', actor, { entryId: String(entry._id) }, meta);
    return entry.toObject();
  }

  /** Any content edit returns the entry to draft (it must be approved again before it can be published). */
  async update(id, input, actor, meta) {
    const current = await this.get(id);
    if (current.status === 'archived') throw new ConflictError('Restore this entry before editing it');
    if (input.revision != null && input.revision !== current.revision) throw new ConflictError('This entry changed meanwhile. Reload before saving');
    const data = pick(input, CONTENT_FIELDS);
    this._validate({ ...current, ...data });
    const updated = await KnowledgeEntry.findOneAndUpdate({ _id: id, revision: current.revision }, {
      $set: { ...data, status: 'draft', updatedBy: actor, approvedBy: null, approvedAt: null, approvedRevision: null, rejectionNote: null },
      $inc: { revision: 1 },
    }, { returnDocument: 'after', runValidators: true }).lean();
    if (!updated) throw new ConflictError('This entry changed meanwhile. Reload before saving');
    log('updated', actor, { entryId: String(id), revision: updated.revision }, meta);
    return updated;
  }

  async submit(id, actor, meta) {
    const updated = await KnowledgeEntry.findOneAndUpdate({ _id: id, status: 'draft' }, {
      $set: { status: 'pending_approval', submittedBy: actor, submittedAt: new Date(), rejectionNote: null, updatedBy: actor },
    }, { returnDocument: 'after' }).lean();
    if (!updated) throw new ConflictError('Only a draft can be submitted for approval');
    log('submitted', actor, { entryId: String(id) }, meta);
    return updated;
  }

  /** Admin only (route-guarded by ai-calling:admin). Records who approved which revision. */
  async approve(id, actor, { revision } = {}, meta) {
    const current = await this.get(id);
    if (!['draft', 'pending_approval'].includes(current.status)) throw new ConflictError('This entry is not awaiting approval');
    if (revision != null && revision !== current.revision) throw new ConflictError('This entry changed after you opened it. Review the latest text before approving');
    const updated = await KnowledgeEntry.findOneAndUpdate({ _id: id, revision: current.revision, status: current.status }, {
      $set: { status: 'approved', approvedBy: actor, approvedAt: new Date(), approvedRevision: current.revision, rejectionNote: null },
    }, { returnDocument: 'after' }).lean();
    if (!updated) throw new ConflictError('This entry changed meanwhile. Reload before approving');
    log('approved', actor, { entryId: String(id), revision: current.revision }, meta);
    return updated;
  }

  async reject(id, actor, { note = '' } = {}, meta) {
    const updated = await KnowledgeEntry.findOneAndUpdate({ _id: id, status: 'pending_approval' }, {
      $set: { status: 'draft', rejectionNote: String(note).slice(0, 500) || 'Changes requested', updatedBy: actor },
    }, { returnDocument: 'after' }).lean();
    if (!updated) throw new ConflictError('Only an entry awaiting approval can be sent back');
    log('rejected', actor, { entryId: String(id) }, meta);
    return updated;
  }

  async archive(id, actor, meta) {
    const updated = await KnowledgeEntry.findOneAndUpdate({ _id: id, status: { $ne: 'archived' } }, { $set: { status: 'archived', updatedBy: actor } }, { returnDocument: 'after' }).lean();
    if (!updated) throw new NotFoundError('KnowledgeEntry', id);
    log('archived', actor, { entryId: String(id) }, meta);
    return updated;
  }

  async restore(id, actor, meta) {
    const updated = await KnowledgeEntry.findOneAndUpdate({ _id: id, status: 'archived' }, {
      $set: { status: 'draft', updatedBy: actor, approvedBy: null, approvedAt: null, approvedRevision: null }, $inc: { revision: 1 },
    }, { returnDocument: 'after' }).lean();
    if (!updated) throw new ConflictError('Only an archived entry can be restored');
    log('restored', actor, { entryId: String(id) }, meta);
    return updated;
  }

  async latestVersion() {
    return KnowledgeVersion.findOne().sort({ version: -1 }).lean();
  }

  async _insertVersion(doc) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const latest = await KnowledgeVersion.findOne().sort({ version: -1 }).select('version').lean();
      try {
        return (await KnowledgeVersion.create({ ...doc, version: (latest?.version || 0) + 1, publishedAt: new Date() })).toObject();
      } catch (error) {
        if (error?.code !== 11000) throw error;
      }
    }
    throw new ConflictError('Another version was published at the same time. Try again');
  }

  /** Admin only. Snapshot every approved entry into a new immutable version. */
  async publish(actor, { note = '' } = {}, meta) {
    const approved = await KnowledgeEntry.find({ status: 'approved' }).sort({ type: 1, title: 1 }).lean();
    if (!approved.length) throw new ValidationError('Approve at least one entry before publishing');
    const entries = approved.map(e => ({ entryId: e._id, revision: e.revision, approvedBy: e.approvedBy, approvedAt: e.approvedAt, ...pick(e, CONTENT_FIELDS) }));
    const version = await this._insertVersion({ entries, note, publishedBy: actor });
    await KnowledgeEntry.bulkWrite(approved.map(e => ({ updateOne: { filter: { _id: e._id, revision: e.revision }, update: { $set: { lastPublishedVersion: version.version, lastPublishedRevision: e.revision } } } })));
    log('published', actor, { version: version.version, entries: entries.length }, meta);
    return version;
  }

  /** Admin only. Re-publish an older snapshot as the newest version (history is never rewritten). */
  async rollback(versionId, actor, { note = '' } = {}, meta) {
    const target = await KnowledgeVersion.findById(versionId).lean();
    if (!target) throw new NotFoundError('KnowledgeVersion', versionId);
    const latest = await this.latestVersion();
    if (latest && String(latest._id) === String(target._id)) throw new ConflictError('This version is already the latest published version');
    const version = await this._insertVersion({ entries: target.entries, note: note || `Rollback to version ${target.version}`, publishedBy: actor, rollbackOf: target.version });
    log('rolled_back', actor, { version: version.version, rollbackOf: target.version }, meta);
    return version;
  }

  async listVersions({ page = 1, limit = 25 } = {}) {
    const [data, total] = await Promise.all([
      KnowledgeVersion.find().sort({ version: -1 }).skip((page - 1) * limit).limit(limit)
        .populate('publishedBy', 'firstName lastName email').lean(),
      KnowledgeVersion.countDocuments(),
    ]);
    return { data: data.map(v => ({ ...v, entryCount: v.entries.length })), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getVersion(id) {
    const version = await KnowledgeVersion.findById(id).populate('publishedBy', 'firstName lastName email').lean();
    if (!version) throw new NotFoundError('KnowledgeVersion', id);
    return version;
  }

  /** Diff between two versions; without `from`, against the version just before `to`. */
  async diff(toId, fromId = null) {
    const to = await this.getVersion(toId);
    const from = fromId ? await this.getVersion(fromId) : await KnowledgeVersion.findOne({ version: { $lt: to.version } }).sort({ version: -1 }).lean();
    return diffKnowledgeVersions(from, to);
  }

  /** Owner sets which knowledge an agent speaks from: latest published, a pinned version, or none. */
  async setAgentKnowledge(agentId, actor, { mode, versionId = null, version }, meta) {
    if (mode === 'pinned') {
      if (!versionId || !await KnowledgeVersion.exists({ _id: versionId })) throw new ValidationError('Choose a published knowledge version to pin');
    }
    const updated = await CallingAgent.findOneAndUpdate({ _id: agentId, createdBy: actor, ...(version != null ? { version } : {}) }, {
      $set: { knowledge: { mode, versionId: mode === 'pinned' ? versionId : null }, updatedBy: actor }, $inc: { version: 1 },
    }, { returnDocument: 'after' }).lean();
    if (!updated) throw new ConflictError('Agent changed or was not found. Reload before saving');
    log('agent_pinned', actor, { agentId: String(agentId), mode, versionId: versionId ? String(versionId) : null }, meta);
    return { knowledge: updated.knowledge, version: updated.version };
  }

  /** The snapshot an agent config resolves to right now (null when none). */
  async resolveForAgent(agent) {
    const mode = agent?.knowledge?.mode || 'latest';
    if (mode === 'none') return { mode, snapshot: null };
    if (mode === 'pinned' && agent.knowledge.versionId) {
      return { mode, snapshot: await KnowledgeVersion.findById(agent.knowledge.versionId).lean() };
    }
    return { mode: 'latest', snapshot: await this.latestVersion() };
  }

  /**
   * Resolve once per call and stamp the CallRecord, so every context reload during
   * the call (and the post-call compliance check) uses the same version.
   * Returns { stamp, snapshot, section } — section is the prompt text or null.
   */
  async forCall(call, campaign) {
    try {
      let snapshot = null;
      let stamp = call.knowledge?.resolvedAt ? call.knowledge : null;
      if (stamp) {
        snapshot = stamp.versionId ? await KnowledgeVersion.findById(stamp.versionId).lean() : null;
      } else {
        const agent = campaign?.agentId ? await CallingAgent.findById(campaign.agentId).select('knowledge').lean() : null;
        const resolved = await this.resolveForAgent(agent || {});
        snapshot = resolved.snapshot;
        const fresh = { versionId: snapshot?._id || null, version: snapshot?.version ?? null, mode: resolved.mode, entryCount: snapshot?.entries?.length || 0, resolvedAt: new Date() };
        const written = await CallRecord.findOneAndUpdate({ _id: call._id, 'knowledge.resolvedAt': { $in: [null] } }, { $set: { knowledge: fresh } }, { returnDocument: 'after', projection: { knowledge: 1 } }).lean();
        stamp = written?.knowledge || fresh;
        if (!written) {
          // Another context load stamped first: use its version.
          const existing = await CallRecord.findById(call._id).select('knowledge').lean();
          stamp = existing?.knowledge || fresh;
          snapshot = stamp.versionId ? await KnowledgeVersion.findById(stamp.versionId).lean() : null;
        }
      }
      return { stamp, snapshot, section: buildKnowledgeSection(snapshot, { language: campaign?.agentConfig?.language }) };
    } catch (error) {
      // Knowledge must never stop a call: without it the agent keeps its standing
      // "never invent prices or promises" rule.
      logger.warn('Call knowledge unavailable', { module: 'ai-calling', callId: String(call?._id), error: error.message });
      return { stamp: null, snapshot: null, section: null };
    }
  }

  async snapshotForStamp(stamp) {
    return stamp?.versionId ? KnowledgeVersion.findById(stamp.versionId).lean() : null;
  }
}

export default new KnowledgeService();
