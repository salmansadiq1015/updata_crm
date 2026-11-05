import CampaignRecipient from './campaignRecipient.model.js';
import Lead from '../crm/lead.model.js';
import crypto from 'node:crypto';
import { findAvatarPreset } from './agentAvatarPresets.js';
import sharp from 'sharp';
import mongoose from 'mongoose';
import CallingAgent from './callingAgent.model.js';
import CallCampaign from './callCampaign.model.js';
import FileMetadata from '../files/file.model.js';
import fileService from '../files/file.service.js';
import storage from '../../shared/storage/StorageService.js';
import audit from '../auth/audit.service.js';
import calling, { assertQuestionnaire } from './aiCalling.service.js';
import { NotFoundError, ConflictError, ValidationError } from '../../shared/errors/AppError.js';
import { nextWindowClose } from './engine/callWindow.js';
import { applyAgentTemplate } from './engine/agentTypes.js';

export function agentReadiness(agent) {
  const missing = [];
  if (!agent.name?.trim()) missing.push('Agent name');
  if (!agent.agentConfig?.organizationName?.trim()) missing.push('Company name');
  // An incoming-only receptionist talks freely: no campaign objective or questionnaire needed.
  const outbound = agent.usage !== 'inbound';
  if (outbound && !agent.agentConfig?.objective?.trim()) missing.push('Call objective');
  if (!agent.agentConfig?.disclosure?.trim()) missing.push('AI disclosure');
  if (agent.agentConfig?.recordCall) missing.push('Call recording is unavailable: a recording capture integration is not configured');
  if (outbound) { try { assertQuestionnaire(agent.questionnaire); } catch (e) { missing.push(e.message); } }
  if (agent.transport === 'paired_phone' && !agent.pairedDeviceId) missing.push('Paired phone');
  return { ready: missing.length === 0, missing };
}

const imageScope = actor => ({ uploadedBy: actor, module: 'ai-calling', entityType: 'calling-avatar', isDeleted: false });
const ACTIVE = ['running', 'queued', 'scheduled'];
const serializable = doc => doc.toObject ? doc.toObject() : doc;
function requestHash(input) {
  const canonical = value => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    return value;
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex');
}


class CallingAgentService {
  log(action, actor, id, meta = {}) {
    audit.logEvent({ eventType: `ai_calling.agent.${action}`, module: 'ai-calling', userId: actor,
      ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', details: { agentId: id } });
  }

  async owned(id, actor) {
    const doc = await CallingAgent.findOne({ _id: id, createdBy: actor }).lean();
    if (!doc) throw new NotFoundError('CallingAgent', id);
    return doc;
  }

  async image(file) {
    // Keys stay durable; signed URLs are generated when reading, never persisted in agents.
    return { _id: String(file._id), name: file.originalName, size: file.sizeBytes,
      url: await storage.getPresignedUrl(file.key), createdAt: file.createdAt };
  }

  async campaignStats(ids, actor) {
    if (!ids.length) return new Map();
    const totals = Object.fromEntries(['completed', 'answered', 'inProgress', 'failed', 'qualified', 'noAnswer', 'totalCallSeconds'].map(key => [key, { $sum: `$summary.${key}` }]));
    const rows = await CallCampaign.aggregate([
      { $match: { createdBy: new mongoose.Types.ObjectId(actor), agentId: { $in: ids }, isTest: { $ne: true } } },
      { $group: { _id: '$agentId', ...totals, campaigns: { $sum: 1 }, activeCampaigns: { $sum: { $cond: [{ $in: ['$status', ACTIVE] }, 1, 0] } }, lastActiveAt: { $max: '$startedAt' } } },
    ]);
    return new Map(rows.map(row => [String(row._id), row]));
  }

  async decorate(agent, actor, knownStats) {
    const [stats, latestCampaign, eligibility, file] = await Promise.all([
      knownStats || this.campaignStats([agent._id], actor),
      CallCampaign.findOne({ agentId: agent._id, createdBy: actor, isTest: { $ne: true }, kind: { $ne: 'follow_up' } }).sort({ createdAt: -1 }).lean(),
      calling.previewEligibility(actor, { leadIds: agent.assignedLeadIds.map(String) }),
      agent.avatarFileId ? FileMetadata.findOne({ _id: agent.avatarFileId, ...imageScope(actor) }).lean() : null,
    ]);
    let avatarUrl = findAvatarPreset(agent.avatarPresetId)?.url || null;
    if (!avatarUrl && file) { try { avatarUrl = (await this.image(file)).url; } catch { /* identity still loads during storage outages */ } }
    const totals = stats.get(String(agent._id)) || { completed: 0, answered: 0, inProgress: 0, failed: 0, qualified: 0, noAnswer: 0, totalCallSeconds: 0, campaigns: 0, activeCampaigns: 0, lastActiveAt: null };
    const { _id: _statsId, lastActiveAt, ...metrics } = totals;
    const { launchLeaseUntil: _lease, launchLeaseToken: _token, ...publicAgent } = agent;
    return { ...publicAgent, readiness: agentReadiness(agent), avatarUrl, eligibility, metrics, latestCampaign, lastActiveAt };
  }

  async get(id, actor) { return this.decorate(await this.owned(id, actor), actor); }

  async list(actor, { page = 1, limit = 24, search, availability, readiness, campaignStatus, usage, sort = 'updated' } = {}) {
    const filter = { createdBy: actor };
    if (availability) filter.availability = availability;
    // Legacy agents have no usage field: they are outbound agents.
    if (usage === 'inbound') filter.usage = { $in: ['inbound', 'both'] };
    if (usage === 'outbound') filter.usage = { $nin: ['inbound'] };
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [{ name: new RegExp(escaped, 'i') }, { title: new RegExp(escaped, 'i') }];
    }
    // Apply computed filters before pagination, but hydrate only the visible page.
    // Historical campaign configurations are never loaded to compute card totals.
    const docs = await CallingAgent.find(filter).sort(sort === 'name' ? { name: 1, _id: 1 } : { updatedAt: -1, _id: 1 }).lean();
    const stats = await this.campaignStats(docs.map(doc => doc._id), actor);
    const filtered = docs.filter(a => (!readiness || agentReadiness(a).ready === (readiness === 'ready'))
      && (!campaignStatus || ((stats.get(String(a._id))?.activeCampaigns || 0) > 0) === (campaignStatus === 'active')));
    if (sort === 'active') filtered.sort((a, b) => new Date(stats.get(String(b._id))?.lastActiveAt || 0) - new Date(stats.get(String(a._id))?.lastActiveAt || 0));
    const ids = [...new Set(docs.flatMap(doc => doc.assignedLeadIds.map(String)))];
    const byLead = new Map();
    // Bound policy lookups instead of making a request per off-screen agent.
    for (let offset = 0; offset < ids.length; offset += 500) {
      const preview = await calling.previewEligibility(actor, { leadIds: ids.slice(offset, offset + 500) });
      for (const row of preview.leads) byLead.set(row.leadId, row);
    }
    let eligible = 0;
    for (const doc of docs) {
      const seen = new Set();
      for (const id of doc.assignedLeadIds) {
        const row = byLead.get(String(id));
        if (!row?.phone) continue;
        const permitted = !row.reasons.some(reason => reason !== 'duplicate_phone');
        if (permitted && !seen.has(row.phone)) eligible += 1;
        seen.add(row.phone);
      }
    }
    const summary = { agents: docs.length, activeCampaigns: 0, inProgress: 0, completed: 0, eligible };
    for (const row of stats.values()) for (const key of ['activeCampaigns', 'inProgress', 'completed']) summary[key] += row[key] || 0;
    return { data: await Promise.all(filtered.slice((page - 1) * limit, page * limit).map(doc => this.decorate(doc, actor, stats))),
      pagination: { page, limit, total: filtered.length, pages: Math.ceil(filtered.length / limit) }, summary };
  }

  async validateImage(id, actor) {
    if (id && !await FileMetadata.exists({ _id: id, ...imageScope(actor), archived: false })) throw new ValidationError('Choose an image from your gallery');
  }

  validateAvatarChoice(input) {
    if (input.avatarPresetId && !findAvatarPreset(input.avatarPresetId)) throw new ValidationError('Choose a valid premium avatar');
    if (input.avatarPresetId && input.avatarFileId) throw new ValidationError('Choose either a premium avatar or an uploaded image');
  }

  async create(input, actor, meta) {
    this.validateAvatarChoice(input);
    await this.validateImage(input.avatarFileId, actor);
    const assignedLeadIds = [...new Set((input.assignedLeadIds || []).map(String))];
    if (assignedLeadIds.length > 500) throw new ValidationError('An agent can have at most 500 assigned leads');
    if (assignedLeadIds.length) {
      const preview = await calling.previewEligibility(actor, { leadIds: assignedLeadIds });
      if (preview.unavailable) throw new ValidationError('Some selected leads are unavailable. Reload the lead selection');
    }
    // A new agent starts from its type's template; anything the admin wrote is kept as is.
    const templated = applyAgentTemplate(input);
    const data = { ...templated, assignedLeadIds, agentConfig: { ...templated.agentConfig, agentName: input.name }, createdBy: actor, updatedBy: actor };
    const readiness = agentReadiness(data);
    if (input.availability === 'active' && !readiness.ready) throw new ValidationError(`Complete the agent configuration before activating it: ${readiness.missing.join(', ')}`);
    const doc = await CallingAgent.create(data);
    this.log('created', actor, doc._id, meta);
    return this.get(doc._id, actor);
  }

  async update(id, input, actor, meta) {
    const old = await this.owned(id, actor);
    if (String(input.avatarFileId || '') !== String(old.avatarFileId || '')) await this.validateImage(input.avatarFileId, actor);
    const { version, ...changes } = input;
    const next = { ...old, ...changes, agentConfig: { ...(changes.agentConfig || old.agentConfig), agentName: changes.name || old.name } };
    this.validateAvatarChoice(next);
    const readiness = agentReadiness(next);
    if (next.availability === 'active' && !readiness.ready) throw new ValidationError(`Complete the configuration or save a draft: ${readiness.missing.join(', ')}`);
    if (changes.availability === 'archived' && await CallCampaign.exists({ agentId: id, createdBy: actor, status: { $in: ACTIVE } })) throw new ConflictError('Pause or cancel active campaigns before archiving this agent');
    const updated = await CallingAgent.findOneAndUpdate({ _id: id, createdBy: actor, version,
      $or: [{ launchLeaseUntil: null }, { launchLeaseUntil: { $lt: new Date() } }],
    }, { $set: { ...changes, agentConfig: next.agentConfig, updatedBy: actor }, $inc: { version: 1 } }, { returnDocument: 'after', runValidators: true });
    if (!updated) throw new ConflictError('Agent changed or a launch is in progress. Reload before saving');
    this.log('updated', actor, id, meta);
    return this.get(id, actor);
  }

  async assign(id, { leadIds, version, mode = 'replace' }, actor, meta) {
    const old = await this.owned(id, actor);
    if (!['replace', 'add'].includes(mode)) throw new ValidationError('Choose a valid assignment mode');
    if (mode === 'add' && old.availability === 'archived') throw new ValidationError('Restore this agent before assigning more leads');
    const requested = [...new Set(leadIds.map(String))];
    const ids = mode === 'add' ? [...new Set([...old.assignedLeadIds.map(String), ...requested])] : requested;
    if (ids.length > 500) throw new ValidationError('An agent can have at most 500 assigned leads');
    const preview = await calling.previewEligibility(actor, { leadIds: mode === 'add' ? requested : ids });
    if (preview.unavailable) throw new ValidationError('Some selected leads are unavailable. Reload the lead selection');
    // Default assignments can include currently ineligible leads for review. They
    // never become eligible by assignment; launch and pre-dial checks remain authoritative.
    const updated = await CallingAgent.findOneAndUpdate({ _id: id, createdBy: actor, version,
      $or: [{ launchLeaseUntil: null }, { launchLeaseUntil: { $lt: new Date() } }],
    }, { $set: { assignedLeadIds: ids, updatedBy: actor }, $inc: { version: 1 } }, { returnDocument: 'after' });
    if (!updated) throw new ConflictError('Agent changed or a launch is in progress. Reload before assigning leads');
    this.log('leads_assigned', actor, id, meta);
    return this.get(id, actor);
  }

  async duplicate(id, actor, meta) {
    const old = await this.owned(id, actor);
    const { name, title, description, avatarFileId, avatarPresetId, agentConfig, questionnaire, statusRules, schedule, transport, pairedDeviceId, inbound, usage, agentType, followUp } = old;
    // A copy never inherits live automation: follow-up calling starts switched off.
    const copyFollowUp = followUp ? { ...followUp, enabled: false, autoCall: false, routes: {} } : undefined;
    return this.create({ name: `${name.slice(0, 110)} (copy)`, title, description, avatarFileId, avatarPresetId, agentConfig, questionnaire, statusRules, schedule, transport, pairedDeviceId, inbound, usage, agentType, followUp: copyFollowUp, availability: 'draft' }, actor, meta);
  }

  async remove(id, actor, meta) {
    await this.owned(id, actor);
    if (await CallCampaign.exists({ agentId: id, createdBy: actor })) throw new ConflictError('This agent has campaign history. Archive it to retain its records');
    const removed = await CallingAgent.deleteOne({ _id: id, createdBy: actor,
      $or: [{ launchLeaseUntil: null }, { launchLeaseUntil: { $lt: new Date() } }],
    });
    if (!removed.deletedCount) throw new ConflictError('A launch is in progress. Try again after it finishes');
    this.log('deleted', actor, id, meta);
    return { deleted: true };
  }

  /** Snapshot the saved agent for browser tests. No dial job or lead write occurs. */
  async prepareTest(id, actor) {
    const agent = await this.owned(id, actor);
    assertQuestionnaire(agent.questionnaire);
    const lead = await Lead.findOne({ _id: { $in: agent.assignedLeadIds || [] }, createdBy: actor, isDeleted: { $ne: true } }).select('_id').lean();
    if (!lead) throw new ValidationError('Assign a lead to this agent to provide browser test context. The test never changes the lead.');
    const launchKey = `browser-test-${id}-${agent.version}`;
    let campaign;
    try {
      campaign = await CallCampaign.findOneAndUpdate({ createdBy: actor, launchKey }, { $setOnInsert: {
        name: `${agent.name} · browser test`.slice(0, 160), agentId: agent._id,
        agentSnapshot: { name: agent.name, title: agent.title, version: agent.version },
        agentConfig: agent.agentConfig, questionnaire: agent.questionnaire, statusRules: agent.statusRules,
        isTest: true, status: 'draft', transport: 'cloud_sip',
        selection: { mode: 'explicit', leadIds: [lead._id], selectedAt: new Date() },
      } }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      campaign = await CallCampaign.findOne({ createdBy: actor, launchKey });
    }
    await CampaignRecipient.updateOne({ campaignId: campaign._id, leadId: lead._id }, { $setOnInsert: { createdBy: actor, state: 'draft', eligibility: { eligible: false, reasons: ['browser_test_only'] } } }, { upsert: true });
    return { ...campaign.toObject(), summary: { ...campaign.toObject().summary, total: 1 } };
  }

  async launch(id, input, actor, meta) {
    const owned = await this.owned(id, actor);
    if (owned.usage === 'inbound') throw new ValidationError('This agent only answers incoming calls. Set its usage to "Outbound and incoming" to run campaigns with it.');
    const fingerprint = requestHash(input);
    const existingFilter = { agentId: id, createdBy: actor, launchKey: input.idempotencyKey };
    const existing = await CallCampaign.findOne(existingFilter).lean();
    if (existing && existing.launchRequestHash !== fingerprint) throw new ConflictError('This launch request was already used with different settings. Open its campaign or retry the original request');
    if (existing && existing.status !== 'draft') return calling.getCampaign(existing._id, actor);
    const token = crypto.randomUUID();
    const agent = await CallingAgent.findOneAndUpdate({ _id: id, createdBy: actor, availability: 'active',
      $or: [{ launchLeaseUntil: null }, { launchLeaseUntil: { $lt: new Date() } }],
    }, { $set: { launchLeaseUntil: new Date(Date.now() + 120_000), launchLeaseToken: token } }, { returnDocument: 'after' }).lean();
    if (!agent) throw new ConflictError('Agent must be active and have no launch in progress. Retry the same request after refreshing');
    try {
      const previous = await CallCampaign.findOne(existingFilter).lean();
      if (previous && previous.launchRequestHash !== fingerprint) throw new ConflictError('This launch key belongs to a different request');
      if (previous && previous.status !== 'draft') return calling.getCampaign(previous._id, actor);
      // Follow-up calls (kind 'follow_up') run alongside campaigns; the lead-level lock in
      // _dispatchCall keeps them from ever calling a lead the campaign is calling.
      if (await CallCampaign.exists({ agentId: id, createdBy: actor, kind: { $ne: 'follow_up' }, $or: [{ status: { $in: ACTIVE } }, { 'summary.inProgress': { $gt: 0 } }] })) throw new ConflictError('This agent already has an active campaign or an unfinished call. Open it to manage the queue and let its active calls finish');
      // The launch dialog can choose the phone for this run without rewriting
      // the saved agent. Retries keep the already allocated campaign's route.
      const transport = previous?.transport || input.transport || agent.transport || 'cloud_sip';
      const pairedDeviceId = transport === 'paired_phone'
        ? previous?.pairedDeviceId || (input.pairedDeviceId !== undefined ? input.pairedDeviceId : agent.pairedDeviceId)
        : null;
      const execution = { transport, pairedDeviceId };
      const readiness = agentReadiness({ ...agent, ...execution });
      if (!readiness.ready) throw new ValidationError(`Complete: ${readiness.missing.join(', ')}`);
      const preview = await calling.previewEligibility(actor, { leadIds: agent.assignedLeadIds.map(String) });
      if (!preview.eligible) throw new ValidationError('No eligible assigned leads. Check phone numbers, consent and do-not-call restrictions');
      await calling.assertLaunchAvailable({ channel: 'voice', ...execution }, actor);
      const schedule = input.schedule || agent.schedule;
      const launchAt = input.mode === 'scheduled' ? new Date(input.scheduledAt) : new Date();
      const endsAt = input.executionEndsAt ? new Date(input.executionEndsAt) : input.mode === 'scheduled' && !input.continueAcrossDays ? nextWindowClose(schedule, launchAt) : null;
      if (input.mode === 'scheduled' && !input.continueAcrossDays && !endsAt) throw new ValidationError('No permitted calling window was found');
      if (endsAt && endsAt <= launchAt) throw new ValidationError('The campaign end must be after its launch');
      const campaign = previous || await calling.createCampaign({
        name: input.name || `${agent.name} · ${launchAt.toISOString().slice(0, 10)}`,
        description: agent.description, channel: 'voice', agentConfig: agent.agentConfig,
        questionnaire: agent.questionnaire, statusRules: agent.statusRules, schedule,
        ...execution,
        selection: { mode: 'explicit', leadIds: agent.assignedLeadIds.map(String) },
        scheduledAt: input.mode === 'scheduled' ? launchAt : null,
      }, actor, meta, {
        agentId: agent._id, launchKey: input.idempotencyKey, launchRequestHash: fingerprint, initializationPending: true,
        agentSnapshot: { name: agent.name, title: agent.title, description: agent.description, avatarFileId: agent.avatarFileId, avatarPresetId: agent.avatarPresetId, version: agent.version },
        executionEndsAt: endsAt, continueAcrossDays: input.continueAcrossDays,
      });
      if (campaign.initializationPending) await calling.recoverCampaignInitialization(campaign._id, actor);
      // On an enqueue failure the same key resumes this exact snapshot; it never
      // creates a second campaign or substitutes later agent/assignment edits.
      return await calling.startCampaign(campaign._id, actor, {
        startNow: !campaign.scheduledAt, scheduledAt: campaign.scheduledAt,
      }, meta);
    } finally {
      await CallingAgent.updateOne({ _id: id, launchLeaseToken: token }, { $set: { launchLeaseUntil: null, launchLeaseToken: null } });
    }
  }

  async listImages(actor, { page = 1, limit = 48 } = {}) {
    const filter = { ...imageScope(actor), archived: false };
    const [rows, total] = await Promise.all([
      FileMetadata.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), FileMetadata.countDocuments(filter),
    ]);
    return { data: await Promise.all(rows.map(file => this.image(file))), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async uploadImage(file, actor) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) || file.size > 5 * 1024 * 1024) throw new ValidationError('Upload a JPG, PNG or WebP image up to 5 MB');
    let body;
    try {
      const source = sharp(file.buffer, { limitInputPixels: 25_000_000, animated: false });
      const metadata = await source.metadata();
      if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error('Unsupported image');
      body = await source.rotate().resize(512, 512, { fit: 'cover', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    } catch { throw new ValidationError('The file could not be decoded as a supported image'); }
    const uploaded = await fileService.upload({ buffer: body, originalName: `${crypto.randomUUID()}.webp`, mimeType: 'image/webp', sizeBytes: body.length,
      module: 'ai-calling', entityType: 'calling-avatar', entityId: actor, uploadedBy: actor, bucket: 'images' });
    return this.image(serializable(uploaded));
  }

  async removeImage(id, actor) {
    const file = await FileMetadata.findOneAndUpdate({ _id: id, ...imageScope(actor), archived: false }, { $set: { archived: true, archivedAt: new Date() } });
    if (!file) throw new NotFoundError('Avatar image', id);
    // Keep the object for agents and immutable historical snapshots that reference
    // it. Removing from the gallery never breaks an existing avatar.
    return { removed: true };
  }
}
export default new CallingAgentService();
