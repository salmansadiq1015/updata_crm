import { createHash, randomUUID } from 'node:crypto';
import SimCallCampaign from './simCallCampaign.model.js';
import SimCallTask from './simCallTask.model.js';
import SimCallEvent from './simCallEvent.model.js';
import * as contactPolicyHooks from '../contactPolicy/contactPolicy.hooks.js';
import Lead from '../crm/lead.model.js';
import CallSuppression from '../aiCalling/callSuppression.model.js';
import { phoneHash } from '../aiCalling/callAuth.js';
import leadCommunicationService, { resolveDestination } from '../crm/leadCommunication.service.js';
import { normalizeConfirmedAnswer } from '../crm/leadQualification.service.js';
import { conditionMet } from '../aiCalling/engine/questionEngine.js';
import { validateAnswer } from '../aiCalling/engine/answerValidation.js';
import { nextWindowOpen, windowState, isValidTimezone } from '../aiCalling/engine/callWindow.js';
import auditService from '../auth/audit.service.js';
import notificationService from '../notifications/notification.service.js';
import logger from '../../shared/logger/index.js';
import { generationCache } from './generationCache.js';
import { AppError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import {
  CALLABLE_TASK_STATES, CAMPAIGN_TRANSITIONS, DEFAULT_SETTINGS, LOCK_MS, MAX_LEADS, NO_CONTACT_OUTCOMES,
  RETRYABLE_TASK_STATES, SIM_CALL_ERROR_CODES,
} from './simCall.constants.js';
import { isAiConfigured } from '../../shared/ai/llmFactory.js';
import { telephonyHealth } from '../aiCalling/providers/telephonyRouter.js';

const MAX_SYNC_ATTEMPTS = 5;
const MAX_FAILED_DIALS = 3;          // "could not place the call" before the task is closed as failed
const CANCELLED_DIAL_DELAY_MS = 5 * 60_000;
const MAX_CALLBACK_AHEAD_MS = 366 * 24 * 3600_000;
const ELIGIBILITY_CONCURRENCY = 8;   // lead eligibility checks run in parallel batches when building tasks
// Header KPIs (≤30 s); invalidated by a generation bump on every summary/status write.
const statsCache = generationCache('simcall:stats', { ttlSeconds: 30 });
const EVENTS_COUNT_CAP = 1000;       // the activity feed only shows recent pages; never count a huge log exactly
const canonical = (value) => {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
};

const conflict = (message, code, details) => {
  const err = new AppError(message, 409, code);
  if (details) err.details = details;
  return err;
};
const emit = (userId, event, payload) => {
  try { global.io?.to(`user:${userId}`).emit(event, payload); } catch { /* best-effort */ }
};

function assertQuestionnaire(questionnaire) {
  const questions = questionnaire?.questions || [];
  if (!questions.length) throw new ValidationError('A campaign needs at least one question');
  const keys = new Set();
  for (const q of questions) {
    if (keys.has(q.fieldKey)) throw new ValidationError(`Duplicate question fieldKey: ${q.fieldKey}`);
    keys.add(q.fieldKey);
    if (['single_choice', 'multiple_choice', 'enum'].includes(q.type) && !(q.options || []).length) {
      throw new ValidationError(`Question "${q.fieldKey}" needs options`);
    }
  }
  for (const q of questions) {
    for (const group of ['all', 'any']) {
      for (const clause of q.condition?.[group] || []) {
        if (clause.field && !keys.has(clause.field)) throw new ValidationError(`Skip rule references unknown question: ${clause.field}`);
      }
    }
  }
  const dependencies = new Map(questions.map((q) => [q.fieldKey,
    [...(q.condition?.all || []), ...(q.condition?.any || [])].map((c) => c.field)]));
  const visited = new Set();
  const visiting = new Set();
  const visit = (key) => {
    if (visiting.has(key)) throw new ValidationError('Conditional questions must not contain a dependency cycle');
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dependency of dependencies.get(key) || []) visit(dependency);
    visiting.delete(key); visited.add(key);
  };
  for (const key of keys) visit(key);
}

const HEAVY_ATTEMPT_FIELDS = '-attempts.crmNotes -attempts.answers -attempts.callbackSnapshot';

const destinationField = (lead) => (lead.mobile ? 'mobile' : 'phone');

/** Phone eligibility exactly as the CRM's own call flow sees it (suppression, valid number). */
async function phoneEligibility(lead) {
  const field = destinationField(lead);
  const r = await leadCommunicationService.eligibility(String(lead._id), { channel: 'phone', destinationField: field });
  // A confirmed opt-out must block calls even after a crash before the CRM sync.
  const dest = resolveDestination(lead, field);
  const hashes = (dest.candidates || []).map((number) => phoneHash(number));
  const optedOut = await SimCallTask.exists({ attempts: { $elemMatch: { doNotContact: true, destinationHash: { $in: hashes } } } });
  if (optedOut) return { field, eligible: false, reasons: [...new Set([...r.reasons, 'PHONE_SUPPRESSED'])], destinationMasked: r.destinationMasked };
  return { field, eligible: r.eligible, reasons: r.reasons, destinationMasked: r.destinationMasked };
}

/** Answers keyed by fieldKey, in the shape conditionMet() reads. */
const answerMap = (answers = []) => Object.fromEntries(answers
  .filter((a) => a.status === 'answered')
  .map((a) => [a.fieldKey, { validation: 'valid', normalizedValue: a.normalizedValue }]));

/** Map a confirmed call outcome to the CRM communication vocabulary. */
export function communicationOutcome(attempt, { doNotContact = false } = {}) {
  if (doNotContact) return { disposition: 'do_not_contact', connected: 'yes' };
  switch (attempt.outcome) {
    case 'answered':
      return { disposition: attempt.interest || 'unknown', connected: 'yes' };
    case 'rejected': return { disposition: 'not_interested', connected: 'yes' };
    case 'callback_requested': return { disposition: 'callback_requested', connected: 'yes' };
    case 'wrong_number': return { disposition: 'wrong_number', connected: 'yes' };
    case 'busy': return { disposition: 'busy', connected: 'no' };
    case 'no_answer': return { disposition: 'no_answer', connected: 'no' };
    default: return null; // failed / cancelled: nothing reached the network
  }
}

/** Next task state after a confirmed outcome (pure; unit-tested). */
export function nextTaskState({ outcome, attemptCount, failedDials, settings, callbackAt, now = new Date() }) {
  const maxAttempts = settings?.maxAttempts ?? DEFAULT_SETTINGS.maxAttempts;
  const retryMs = (settings?.retryDelayMinutes ?? DEFAULT_SETTINGS.retryDelayMinutes) * 60_000;
  switch (outcome) {
    case 'callback_requested':
      return { state: 'scheduled', notBefore: callbackAt };
    case 'cancelled':
      // The user stopped before/while dialling: nothing was attempted. Put it back
      // behind the others (no attempt counted) instead of re-offering it at once.
      return { state: 'pending', notBefore: new Date(now.getTime() + CANCELLED_DIAL_DELAY_MS) };
    case 'failed':
      return failedDials >= MAX_FAILED_DIALS
        ? { state: 'completed', notBefore: null }
        : { state: 'pending', notBefore: new Date(now.getTime() + retryMs) };
    case 'no_answer':
    case 'busy':
      return attemptCount < maxAttempts
        ? { state: 'pending', notBefore: new Date(now.getTime() + retryMs) }
        : { state: 'completed', notBefore: null };
    default:
      return { state: 'completed', notBefore: null };
  }
}

function serializeTask(task, { lead = null, includeAttempts = true } = {}) {
  const t = task.toObject ? task.toObject() : task;
  const leadDoc = lead || (t.leadId && typeof t.leadId === 'object' && t.leadId._id ? t.leadId : null);
  return {
    id: String(t._id),
    campaignId: String(t.campaignId?._id || t.campaignId),
    leadId: String(leadDoc?._id || t.leadId),
    lead: leadDoc ? {
      id: String(leadDoc._id), name: leadDoc.name ?? null, leadNumber: leadDoc.leadNumber ?? null,
      contactName: leadDoc.contactName ?? null, status: leadDoc.status ?? null, city: leadDoc.address?.city ?? null,
    } : null,
    order: t.order,
    state: t.state,
    outcome: t.outcome,
    notBefore: t.notBefore,
    destinationMasked: t.destinationMasked,
    eligibility: t.eligibility,
    lock: { deviceId: t.lock?.deviceId ?? null, attemptId: t.lock?.attemptId ?? null, until: t.lock?.until ?? null },
    attemptCount: t.attemptCount,
    answers: t.answers || [],
    questionsVersion: t.questionsVersion,
    callback: t.callback?.status ? t.callback : null,
    overdue: t.callback?.status === 'pending' && Boolean(t.callback.at) && new Date(t.callback.at) <= new Date(),
    lastActivityAt: t.lastActivityAt,
    completedAt: t.completedAt,
    ...(includeAttempts ? {
      attempts: (t.attempts || []).map((a) => ({
        attemptId: a.attemptId, claimedAt: a.claimedAt, dialedAt: a.dialedAt, outcome: a.outcome, interest: a.interest,
        evidence: a.evidence, offhookAt: a.offhookAt, endedAt: a.endedAt, durationSec: a.durationSec,
        offhookDurationSec: a.offhookDurationSec, notes: a.notes, transcript: a.transcript, completedAt: a.completedAt,
        qualificationAnswers: a.qualificationAnswers || [],
        sync: { status: a.sync?.status, error: a.sync?.error ?? null, at: a.sync?.at ?? null },
      })),
    } : {}),
  };
}

class SimCallService {
  /**
   * What the phone needs to know before calling: SIM calling and SIM SMS need nothing from the
   * server beyond this API; AI features need an AI key on the server; cloud calling
   * (LiveKit + SIP) is an optional, separate mode and never required by the app.
   */
  async readiness() {
    const ai = isAiConfigured();
    let cloudCalling = { configured: false, reason: 'unavailable' };
    try {
      const health = await Promise.race([
        telephonyHealth(),
        new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      cloudCalling = health ? { configured: Boolean(health.configured), reason: health.reason ?? null } : { configured: false, reason: 'timeout' };
    } catch {
      // Optional mode: a failing check never blocks SIM calling.
    }
    return {
      serverTime: new Date().toISOString(),
      simCalling: { available: true },
      simSms: { available: true },
      ai: { configured: ai, voiceNotes: ai, answerSuggestions: ai, smsAgentReplies: ai },
      cloudCalling: { ...cloudCalling, required: false },
    };
  }

  // ------------------------------------------------------------------ helpers
  async _event(campaignId, type, { taskId = null, leadId = null, actor = null, details = null } = {}) {
    try {
      await SimCallEvent.create({ campaignId, taskId, leadId, type, actor, details });
    } catch (err) {
      logger.warn('SIM call event write failed', { module: 'sim-call', type, error: { message: err.message } });
    }
  }

  _audit(eventType, actor, meta, details) {
    auditService.logEvent({
      eventType, userId: actor, ipAddress: meta?.ipAddress || 'internal', userAgent: meta?.userAgent,
      result: 'success', module: 'sim-call', details,
    });
  }

  async _ownedCampaign(id, actor) {
    const campaign = await SimCallCampaign.findOne({ _id: id, createdBy: actor }).lean();
    if (!campaign) throw new NotFoundError('SimCallCampaign', id);
    return campaign;
  }

  async _ownedTask(id, actor) {
    const task = await SimCallTask.findOne({ _id: id, createdBy: actor });
    if (!task) throw new NotFoundError('SimCallTask', id);
    return task;
  }

  async _buildTasks(campaign, leadIds, actor, startOrder = 0) {
    const leads = await Lead.find({ _id: { $in: leadIds }, isDeleted: false })
      .select('_id name phone mobile address.country status').lean();
    const byId = new Map(leads.map((l) => [String(l._id), l]));
    // Deleted / unknown leads are simply not added. Eligibility (CRM suppression +
    // opt-out lookups) runs in small parallel batches instead of one lead at a time.
    const found = leadIds.map((id) => byId.get(String(id))).filter(Boolean);
    const checks = [];
    for (let i = 0; i < found.length; i += ELIGIBILITY_CONCURRENCY) {
      checks.push(...await Promise.all(found.slice(i, i + ELIGIBILITY_CONCURRENCY).map((lead) => phoneEligibility(lead))));
    }
    const docs = [];
    let order = startOrder;
    for (const [index, lead] of found.entries()) {
      const e = checks[index];
      docs.push({
        campaignId: campaign._id, leadId: lead._id, createdBy: actor, order: order++,
        state: e.eligible ? 'pending' : 'ineligible',
        destinationField: e.field, destinationMasked: e.destinationMasked,
        eligibility: { eligible: e.eligible, reasons: e.reasons },
        questionsVersion: campaign.questionsVersion || 1,
      });
    }
    if (docs.length) {
      try {
        await SimCallTask.bulkWrite(docs.map((doc) => ({ updateOne: {
          filter: { campaignId: doc.campaignId, leadId: doc.leadId }, update: { $setOnInsert: doc }, upsert: true,
        } })), { ordered: false });
      } catch (error) {
        // Concurrent creation retries can race on the same unique campaign/lead key.
        if (error.code !== 11000 || error.writeErrors?.some((e) => e.code !== 11000)) throw error;
      }
    }
    return docs.length;
  }

  /**
   * Add leads to an existing campaign (idempotent per lead). Used by the SMS link
   * assistant's "fall back to a human call" when a lead never answered the link.
   */
  async addLeads(campaignId, leadIds, actor) {
    const campaign = await SimCallCampaign.findOne({ _id: campaignId, createdBy: actor });
    if (!campaign) throw new NotFoundError('SimCallCampaign', campaignId);
    if (['cancelled', 'completed'].includes(campaign.status)) throw conflict('The call campaign is closed', 'SIM_CALL_CAMPAIGN_CLOSED');
    const last = await SimCallTask.findOne({ campaignId: campaign._id }).sort({ order: -1 }).select('order').lean();
    const added = await this._buildTasks(campaign, [...new Set(leadIds.map(String))], actor, (last?.order ?? -1) + 1);
    await this.refreshSummary(campaign._id);
    await this._event(campaign._id, 'campaign.leads_added', { actor, details: { leads: added, source: 'link_assistant_fallback' } });
    return { added };
  }

  // ---------------------------------------------------------------- campaigns
  async createCampaign(input, actor, meta = {}) {
    assertQuestionnaire(input.questionnaire);
    if (input.settings?.timezone && !isValidTimezone(input.settings.timezone)) throw new ValidationError('Invalid timezone');
    const leadIds = [...new Set((input.leadIds || []).map(String))];
    if (!leadIds.length) throw new ValidationError('Select at least one lead');
    if (leadIds.length > MAX_LEADS) throw new ValidationError(`A SIM call campaign is limited to ${MAX_LEADS} leads`);
    const available = await Lead.countDocuments({ _id: { $in: leadIds }, isDeleted: false });
    if (!available) throw new ValidationError('Selected leads are unavailable');

    const creationHash = createHash('sha256').update(JSON.stringify(canonical(input))).digest('hex');
    let campaign = input.creationKey
      ? await SimCallCampaign.findOne({ createdBy: actor, creationKey: input.creationKey }) : null;
    const fields = {
      name: input.name,
      description: input.description || '',
      questionnaire: input.questionnaire,
      instructions: input.instructions || '',
      settings: { ...DEFAULT_SETTINGS, ...(input.settings || {}) },
      subscriptionId: input.subscriptionId ?? null,
      startsAt: input.startsAt || null,
      createdBy: actor,
      lastActivityAt: new Date(),
      creationKey: input.creationKey || null, creationHash,
    };
    if (!campaign) {
      try { campaign = await SimCallCampaign.create(fields); }
      catch (error) {
        if (error.code !== 11000 || !input.creationKey) throw error;
        campaign = await SimCallCampaign.findOne({ createdBy: actor, creationKey: input.creationKey });
        if (!campaign) throw error;
      }
    }
    if (campaign.creationHash !== creationHash) throw conflict('Creation key was already used for different campaign content', 'SIM_CALL_CREATION_CONFLICT');
    // Repairs interruption between creating the draft and creating its tasks.
    if (!campaign.creationInitializedAt && campaign.status === 'draft') {
      await this._buildTasks(campaign, leadIds, actor);
      await this.refreshSummary(campaign._id);
      const initialized = await SimCallCampaign.updateOne({ _id: campaign._id, creationInitializedAt: null },
        { $set: { creationInitializedAt: new Date() } });
      if (initialized.modifiedCount) {
        await this._event(campaign._id, 'campaign.created', { actor, details: { leads: leadIds.length } });
        this._audit('sim_call.campaign.created', actor, meta, { campaignId: campaign._id, leads: leadIds.length });
      }
    }
    return this.getCampaign(campaign._id, actor);
  }

  /** Edit a draft. Changing questions bumps questionsVersion; changing leads rebuilds tasks. */
  async updateCampaign(id, input, actor, meta = {}) {
    const campaign = await this._ownedCampaign(id, actor);
    if (campaign.status !== 'draft') throw conflict('Only a draft campaign can be edited', SIM_CALL_ERROR_CODES.NOT_EDITABLE);
    if (campaign.creationHash && !campaign.creationInitializedAt) throw conflict('Campaign creation is still being reconciled', SIM_CALL_ERROR_CODES.NOT_EDITABLE);
    const set = {};
    for (const key of ['name', 'description', 'instructions', 'subscriptionId', 'startsAt']) {
      if (input[key] !== undefined) set[key] = input[key];
    }
    if (input.settings) {
      if (input.settings.timezone && !isValidTimezone(input.settings.timezone)) throw new ValidationError('Invalid timezone');
      set.settings = { ...campaign.settings, ...input.settings };
    }
    if (input.questionnaire) {
      assertQuestionnaire(input.questionnaire);
      set.questionnaire = input.questionnaire;
      set.questionsVersion = (campaign.questionsVersion || 1) + 1;
    }
    set.lastActivityAt = new Date();
    const updated = await SimCallCampaign.findOneAndUpdate({ _id: id, createdBy: actor, status: 'draft' }, { $set: set }, { returnDocument: 'after' });
    if (!updated) throw conflict('Only a draft campaign can be edited', SIM_CALL_ERROR_CODES.NOT_EDITABLE);
    if (set.questionsVersion) await SimCallTask.updateMany({ campaignId: id }, { $set: { questionsVersion: set.questionsVersion } });

    if (input.leadIds) {
      const wanted = [...new Set(input.leadIds.map(String))];
      if (!wanted.length) throw new ValidationError('Select at least one lead');
      if (wanted.length > MAX_LEADS) throw new ValidationError(`A SIM call campaign is limited to ${MAX_LEADS} leads`);
      await SimCallTask.deleteMany({ campaignId: id, leadId: { $nin: wanted } });
      const existing = new Set((await SimCallTask.find({ campaignId: id }).select('leadId').lean()).map((t) => String(t.leadId)));
      const last = await SimCallTask.findOne({ campaignId: id }).sort({ order: -1 }).select('order').lean();
      await this._buildTasks(updated, wanted.filter((l) => !existing.has(l)), actor, (last?.order ?? -1) + 1);
    }
    await this.refreshSummary(id);
    await this._event(id, 'campaign.updated', { actor, details: { fields: Object.keys(input) } });
    this._audit('sim_call.campaign.updated', actor, meta, { campaignId: id, fields: Object.keys(input) });
    return this.getCampaign(id, actor);
  }

  async getCampaign(id, actor) {
    return this._ownedCampaign(id, actor);
  }

  async listCampaigns(actor, { page = 1, limit = 25, status, q } = {}) {
    const filter = { createdBy: actor };
    if (status) filter.status = status;
    if (q) filter.name = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const [data, total] = await Promise.all([
      SimCallCampaign.find(filter).sort({ lastActivityAt: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      SimCallCampaign.countDocuments(filter),
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  /**
   * Header KPIs over ALL of the owner's campaigns (not just the visible page): sums
   * the per-campaign `summary` counters in one $group, plus live overdue callbacks.
   */
  async campaignStats(actor) {
    return statsCache.get(actor, () => this._computeCampaignStats(actor));
  }

  async _computeCampaignStats(actor, now = new Date()) {
    const sum = (field) => ({ $sum: { $ifNull: [`$summary.${field}`, 0] } });
    const [rows, callbacksOverdue] = await Promise.all([
      SimCallCampaign.aggregate([
        { $match: { createdBy: toId(actor) } },
        { $group: {
          _id: '$status', campaigns: { $sum: 1 }, total: sum('total'),
          completed: sum('completed'), skipped: sum('skipped'), ineligible: sum('ineligible'), cancelled: sum('cancelled'),
          answered: sum('answered'), callbacksDue: sum('callbacksDue'), needsReview: sum('needsReview'), syncFailed: sum('syncFailed'),
        } },
      ]),
      SimCallTask.countDocuments({ createdBy: actor, 'callback.status': 'pending', 'callback.at': { $lte: now } }),
    ]);
    const byStatus = { draft: 0, running: 0, paused: 0, completed: 0, cancelled: 0 };
    const tasks = { total: 0, closed: 0, answered: 0, callbacksDue: 0, needsReview: 0, syncFailed: 0 };
    let campaigns = 0;
    for (const r of rows) {
      if (r._id in byStatus) byStatus[r._id] = r.campaigns;
      campaigns += r.campaigns;
      tasks.total += r.total;
      tasks.closed += r.completed + r.skipped + r.ineligible + r.cancelled; // same "closed" as the campaign progress bar
      tasks.answered += r.answered;
      tasks.callbacksDue += r.callbacksDue;
      tasks.needsReview += r.needsReview;
      tasks.syncFailed += r.syncFailed;
    }
    return {
      campaigns, byStatus, tasks,
      answerRate: tasks.closed ? Math.round((tasks.answered / tasks.closed) * 10_000) / 10_000 : null,
      callbacksOverdue,
      generatedAt: now.toISOString(),
    };
  }

  async _transition(id, actor, action, set, meta) {
    const from = CAMPAIGN_TRANSITIONS[action];
    const updated = await SimCallCampaign.findOneAndUpdate(
      { _id: id, createdBy: actor, status: { $in: from } },
      { $set: { ...set, lastActivityAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      const current = await this._ownedCampaign(id, actor);
      throw conflict(`Cannot ${action} a campaign that is ${current.status}`, SIM_CALL_ERROR_CODES.INVALID_TRANSITION, { status: current.status });
    }
    await statsCache.bump(updated.createdBy);
    const type = { start: 'campaign.started', resume: 'campaign.resumed', pause: 'campaign.paused', cancel: 'campaign.cancelled' }[action];
    await this._event(id, type, { actor });
    this._audit(`sim_call.${type}`, actor, meta, { campaignId: id });
    emit(actor, 'sim-call:campaign', { campaignId: String(id), status: updated.status });
    return updated;
  }

  async startCampaign(id, actor, meta = {}) {
    const campaign = await this._ownedCampaign(id, actor);
    if (campaign.creationHash && !campaign.creationInitializedAt) throw conflict('Campaign creation is still being reconciled', SIM_CALL_ERROR_CODES.INVALID_TRANSITION);
    const callable = await SimCallTask.countDocuments({ campaignId: id, state: { $in: CALLABLE_TASK_STATES } });
    if (!callable) throw conflict('This campaign has no lead that can be called', SIM_CALL_ERROR_CODES.INVALID_TRANSITION);
    await this._transition(id, actor, 'start', { status: 'running', startedAt: new Date() }, meta);
    return this.getCampaign(id, actor);
  }

  async resumeCampaign(id, actor, meta = {}) {
    await this._transition(id, actor, 'resume', { status: 'running', pausedAt: null }, meta);
    return this.getCampaign(id, actor);
  }

  /** Pause stops handing out tasks. A call already in progress is finished and recorded normally. */
  async pauseCampaign(id, actor, meta = {}) {
    await this._transition(id, actor, 'pause', { status: 'paused', pausedAt: new Date() }, meta);
    return this.getCampaign(id, actor);
  }

  /**
   * Cancel stops all further calls. Tasks not yet called become cancelled; a task that
   * is in progress (a call may be live) keeps its lock so its outcome can still be saved.
   */
  async cancelCampaign(id, actor, meta = {}) {
    const now = new Date();
    await this._transition(id, actor, 'cancel', { status: 'cancelled', cancelledAt: now, completedAt: now }, meta);
    await SimCallTask.updateMany(
      { campaignId: id, state: { $in: ['pending', 'scheduled'] } },
      { $set: { state: 'cancelled', notBefore: null, lastActivityAt: now } },
    );
    await SimCallTask.updateMany(
      { campaignId: id, 'callback.status': 'pending' },
      { $set: { 'callback.status': 'cancelled' } },
    );
    await this.refreshSummary(id);
    return this.getCampaign(id, actor);
  }

  async retryTasks(id, actor, { taskIds = [] } = {}, meta = {}) {
    const campaign = await this._ownedCampaign(id, actor);
    if (campaign.status === 'cancelled') throw conflict('A cancelled campaign cannot be retried', SIM_CALL_ERROR_CODES.INVALID_TRANSITION);
    const filter = { campaignId: id, state: { $in: RETRYABLE_TASK_STATES } };
    if (taskIds.length) filter._id = { $in: taskIds };
    // Never retry a lead that was answered, refused, a wrong number, or whose callback is pending.
    filter.outcome = { $nin: ['answered', 'rejected', 'wrong_number', 'callback_requested'] };
    // An unknown dialed outcome is reconciliation work, never permission to retry.
    filter.attempts = { $not: { $elemMatch: { dialedAt: { $ne: null }, completedAt: null } } };
    const tasks = await SimCallTask.find(filter).populate('leadId', '_id phone mobile address isDeleted').lean();
    let retried = 0;
    for (const t of tasks) {
      const lead = t.leadId;
      if (!lead || lead.isDeleted) continue;
      const e = await phoneEligibility(lead);
      if (!e.eligible) {
        await SimCallTask.updateOne({ _id: t._id }, { $set: { state: 'ineligible', eligibility: { eligible: false, reasons: e.reasons } } });
        continue;
      }
      const res = await SimCallTask.updateOne(
        { _id: t._id, state: t.state },
        { $set: { state: 'pending', notBefore: null, attemptCount: 0, eligibility: { eligible: true, reasons: [] }, lock: { deviceId: null, attemptId: null, until: null } } },
      );
      if (res.modifiedCount) {
        retried += 1;
        await this._event(id, 'task.retried', { taskId: t._id, leadId: lead._id, actor, details: { from: t.state } });
      }
    }
    if (retried && campaign.status === 'completed') {
      await SimCallCampaign.updateOne({ _id: id }, { $set: { status: 'paused', completedAt: null, pausedAt: new Date() } });
    }
    await this.refreshSummary(id);
    this._audit('sim_call.tasks.retried', actor, meta, { campaignId: id, retried });
    return { retried, campaign: await this.getCampaign(id, actor) };
  }

  async refreshSummary(campaignId) {
    const now = new Date();
    // One pass over the campaign's tasks (was six separate scans on every claim/complete).
    const pendingCallback = { $eq: ['$callback.status', 'pending'] };
    const [facets] = await SimCallTask.aggregate([
      { $match: { campaignId: toId(campaignId) } },
      { $project: { state: 1, outcome: 1, 'callback.status': 1, 'callback.at': 1, 'attempts.dialedAt': 1, 'attempts.sync.status': 1 } },
      { $facet: {
        byState: [{ $group: { _id: '$state', n: { $sum: 1 } } }],
        byOutcome: [{ $match: { outcome: { $ne: null } } }, { $group: { _id: '$outcome', n: { $sum: 1 } } }],
        totals: [{ $group: {
          _id: null,
          callbacks: { $sum: { $cond: [pendingCallback, 1, 0] } },
          // countDocuments({'callback.at': {$lte: now}}) never matched a null/missing time; keep that.
          due: { $sum: { $cond: [{ $and: [pendingCallback, { $ne: [{ $ifNull: ['$callback.at', null] }, null] }, { $lte: ['$callback.at', now] }] }, 1, 0] } },
          syncFailed: { $sum: { $cond: [{ $in: ['failed', { $ifNull: ['$attempts.sync.status', []] }] }, 1, 0] } },
          // Only attempts that were actually dialled count as calls (a claim that was never dialled is not a call).
          attempts: { $sum: { $size: { $filter: { input: { $ifNull: ['$attempts', []] }, cond: { $ne: [{ $ifNull: ['$$this.dialedAt', null] }, null] } } } } },
        } }],
      } },
    ]);
    const s = Object.fromEntries(facets.byState.map((r) => [r._id, r.n]));
    const o = Object.fromEntries(facets.byOutcome.map((r) => [r._id, r.n]));
    const totals = facets.totals[0] || {};
    const { callbacks = 0, due = 0, syncFailed = 0 } = totals;
    const summary = {
      total: Object.values(s).reduce((a, b) => a + b, 0),
      pending: s.pending || 0, inProgress: s.in_progress || 0, scheduled: s.scheduled || 0, needsReview: s.needs_review || 0,
      completed: s.completed || 0, skipped: s.skipped || 0, ineligible: s.ineligible || 0, cancelled: s.cancelled || 0,
      answered: o.answered || 0, noAnswer: o.no_answer || 0, busy: o.busy || 0, rejected: o.rejected || 0,
      callbacks, callbacksDue: due, wrongNumber: o.wrong_number || 0, failed: o.failed || 0,
      syncFailed, attempts: totals.attempts || 0,
    };
    const open = summary.pending + summary.inProgress + summary.scheduled + summary.needsReview;
    const campaign = await SimCallCampaign.findOneAndUpdate(
      { _id: campaignId }, { $set: { summary } }, { returnDocument: 'after' },
    );
    if (campaign && campaign.status === 'running' && open === 0 && summary.total > 0) {
      const done = await SimCallCampaign.findOneAndUpdate(
        { _id: campaignId, status: 'running' }, { $set: { status: 'completed', completedAt: now } }, { returnDocument: 'after' },
      );
      if (done) {
        await this._event(campaignId, 'campaign.completed', {});
        emit(done.createdBy, 'sim-call:campaign', { campaignId: String(campaignId), status: 'completed' });
      }
    }
    if (campaign) await statsCache.bump(campaign.createdBy);
    return summary;
  }

  // -------------------------------------------------------------------- tasks
  async listTasks(campaignId, actor, { page = 1, limit = 50, state, outcome, q } = {}) {
    await this._ownedCampaign(campaignId, actor);
    const filter = { campaignId };
    if (state) filter.state = state;
    if (outcome) filter.outcome = outcome;
    if (q) {
      const rx = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      const ids = await SimCallTask.distinct('leadId', { campaignId });
      const leads = await Lead.find({ _id: { $in: ids }, $or: [{ name: rx }, { leadNumber: rx }, { contactName: rx }] }).select('_id').lean();
      filter.leadId = { $in: leads.map((l) => l._id) };
    }
    const [rows, total] = await Promise.all([
      // Per-attempt CRM snapshots (crmNotes, answers, callbackSnapshot) are never serialized; don't load them.
      SimCallTask.find(filter).sort({ order: 1 }).skip((page - 1) * limit).limit(limit)
        .select(HEAVY_ATTEMPT_FIELDS)
        .populate('leadId', 'name leadNumber contactName status address.city').lean(),
      SimCallTask.countDocuments(filter),
    ]);
    return { data: rows.map((t) => serializeTask(t)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getTask(id, actor) {
    const task = await SimCallTask.findOne({ _id: id, createdBy: actor })
      .populate('leadId', 'name leadNumber contactName status address.city').lean();
    if (!task) throw new NotFoundError('SimCallTask', id);
    return serializeTask(task);
  }

  /**
   * Hand the next callable lead to this device (locks it). Re-checks campaign state,
   * start time, the calling window and the lead's eligibility. A task this device
   * already holds is returned as-is (resume) — never re-dialled automatically.
   */
  async claimNext(campaignId, actor, { deviceId }) {
    const campaign = await this._ownedCampaign(campaignId, actor);
    if (campaign.status !== 'running') {
      throw conflict(`Campaign is ${campaign.status}`, SIM_CALL_ERROR_CODES.CAMPAIGN_NOT_RUNNING, { status: campaign.status });
    }
    const now = new Date();
    const held = await SimCallTask.findOne({
      campaignId, createdBy: actor, state: { $in: ['in_progress', 'needs_review'] }, 'lock.deviceId': deviceId,
    }).populate('leadId', 'name leadNumber contactName status address.city').lean();
    if (held) return { task: serializeTask(held), resumed: true, reason: null, nextAt: null };

    if (campaign.startsAt && new Date(campaign.startsAt) > now) {
      return { task: null, resumed: false, reason: 'not_started', nextAt: campaign.startsAt };
    }
    const window = windowState({ timezone: campaign.settings?.timezone, callWindow: campaign.settings?.callWindow, daysOfWeek: campaign.settings?.daysOfWeek }, now);
    if (!window.open) {
      // The real next opening (e.g. tomorrow 09:00), not the worker's one-hour re-check hint.
      const opens = nextWindowOpen({ timezone: campaign.settings?.timezone, callWindow: campaign.settings?.callWindow, daysOfWeek: campaign.settings?.daysOfWeek }, now);
      return { task: null, resumed: false, reason: 'outside_calling_hours', nextAt: opens ?? new Date(now.getTime() + window.delayMs) };
    }

    for (let i = 0; i < 25; i += 1) {
      const attemptId = randomUUID();
      const due = { $or: [{ notBefore: null }, { notBefore: { $lte: now } }] };
      const update = {
        $set: { state: 'in_progress', lock: { deviceId, attemptId, until: new Date(now.getTime() + LOCK_MS) }, lastActivityAt: now },
        $push: { attempts: { attemptId, deviceId, claimedAt: now } },
      };
      // Due callbacks first (they were promised a time), then the list in order.
      const task = await SimCallTask.findOneAndUpdate(
        { campaignId, createdBy: actor, state: 'scheduled', 'callback.at': { $lte: now } }, update, { sort: { 'callback.at': 1 }, returnDocument: 'after' },
      ) || await SimCallTask.findOneAndUpdate(
        { campaignId, createdBy: actor, state: 'pending', ...due }, update, { sort: { order: 1 }, returnDocument: 'after' },
      );
      if (!task) break;
      const lead = await Lead.findOne({ _id: task.leadId, isDeleted: false }).select('_id name leadNumber contactName status phone mobile address').lean();
      const e = lead ? await phoneEligibility(lead) : { eligible: false, reasons: ['LEAD_UNAVAILABLE'], field: task.destinationField, destinationMasked: null };
      if (!e.eligible) {
        await SimCallTask.updateOne({ _id: task._id }, {
          $set: { state: 'ineligible', eligibility: { eligible: false, reasons: e.reasons }, lock: { deviceId: null, attemptId: null, until: null } },
          $pull: { attempts: { attemptId } },
        });
        await this._event(campaignId, 'task.ineligible', { taskId: task._id, leadId: task.leadId, details: { reasons: e.reasons } });
        continue;
      }
      if (await contactPolicyHooks.simCallClaimHold(task, attemptId)) continue;
      if (e.field !== task.destinationField || e.destinationMasked !== task.destinationMasked) {
        await SimCallTask.updateOne({ _id: task._id }, { $set: { destinationField: e.field, destinationMasked: e.destinationMasked } });
        task.destinationField = e.field; task.destinationMasked = e.destinationMasked;
      }
      await SimCallCampaign.updateOne({ _id: campaignId }, { $set: { lastActivityAt: now } });
      await this._event(campaignId, 'task.claimed', { taskId: task._id, leadId: task.leadId, actor });
      await this.refreshSummary(campaignId);
      return { task: serializeTask(task, { lead }), resumed: false, reason: null, nextAt: null };
    }

    await this.refreshSummary(campaignId);
    const next = await SimCallTask.findOne({ campaignId, state: { $in: CALLABLE_TASK_STATES }, notBefore: { $gt: now } }).sort({ notBefore: 1 }).select('notBefore').lean();
    const fresh = await SimCallCampaign.findById(campaignId).select('status').lean();
    return {
      task: null, resumed: false,
      reason: fresh?.status === 'completed' ? 'campaign_completed' : (next ? 'waiting' : 'queue_empty'),
      nextAt: next?.notBefore || null,
    };
  }

  /** Re-verify everything immediately before the phone dials, then hand out the number. */
  async dial(taskId, actor, { attemptId, deviceId, subscriptionId = null }, meta = {}) {
    const task = await this._ownedTask(taskId, actor);
    if (task.state !== 'in_progress' || task.lock?.attemptId !== attemptId || task.lock?.deviceId !== deviceId) {
      throw conflict('This lead is not claimed by this device for this attempt', SIM_CALL_ERROR_CODES.TASK_LOCKED);
    }
    const campaign = await SimCallCampaign.findById(task.campaignId).lean();
    if (campaign.status !== 'running') {
      throw conflict(`Campaign is ${campaign.status}`, SIM_CALL_ERROR_CODES.CAMPAIGN_NOT_RUNNING, { status: campaign.status });
    }
    const window = windowState({ timezone: campaign.settings?.timezone, callWindow: campaign.settings?.callWindow, daysOfWeek: campaign.settings?.daysOfWeek });
    if (!window.open) throw conflict('Outside the campaign calling hours', SIM_CALL_ERROR_CODES.NOT_ELIGIBLE, { reasons: ['OUTSIDE_CALLING_HOURS'] });
    const lead = await Lead.findOne({ _id: task.leadId, isDeleted: false }).select('_id phone mobile address').lean();
    const e = lead ? await phoneEligibility(lead) : { eligible: false, reasons: ['LEAD_UNAVAILABLE'] };
    if (!e.eligible) {
      throw conflict('This lead cannot be called', SIM_CALL_ERROR_CODES.NOT_ELIGIBLE, { reasons: e.reasons });
    }
    const dest = resolveDestination(lead, e.field);
    const now = new Date();
    const attempt = task.attempts.find((a) => a.attemptId === attemptId);
    if (attempt?.dialedAt) throw conflict('This attempt was already authorized; reconcile its outcome instead of dialing again', SIM_CALL_ERROR_CODES.ALREADY_DIALED);
    const contactPolicyBlock = await contactPolicyHooks.simCallDialGate(task, attemptId); if (contactPolicyBlock) throw conflict(contactPolicyBlock.message, SIM_CALL_ERROR_CODES.TASK_LOCKED, contactPolicyBlock.details);
    const result = await SimCallTask.updateOne(
      { _id: task._id, state: 'in_progress', 'lock.deviceId': deviceId, 'lock.attemptId': attemptId, 'lock.until': { $gt: now },
        attempts: { $elemMatch: { attemptId, dialedAt: null, completedAt: null } } },
      { $set: {
        'attempts.$.dialedAt': now, 'attempts.$.subscriptionId': subscriptionId,
        'attempts.$.destinationHash': phoneHash(dest.candidates[0]), 'attempts.$.destinationField': e.field,
        'lock.until': new Date(now.getTime() + LOCK_MS), lastActivityAt: now,
      } },
    );
    if (!result.modifiedCount) throw conflict('Dial authorization changed or expired; reconcile this attempt', SIM_CALL_ERROR_CODES.ALREADY_DIALED);
    if (!attempt?.dialedAt) {
      await this._event(task.campaignId, 'task.dialed', { taskId: task._id, leadId: task.leadId, actor, details: { subscriptionId } });
      this._audit('sim_call.task.dialed', actor, meta, { campaignId: task.campaignId, taskId: task._id });
    }
    return { dialNumber: dest.raw, destinationMasked: dest.masked };
  }

  /** Give a claimed lead back without calling (only if it was not dialled). */
  async releaseTask(taskId, actor, { attemptId, deviceId }) {
    const task = await this._ownedTask(taskId, actor);
    const attempt = task.attempts.find((a) => a.attemptId === attemptId);
    if (task.state !== 'in_progress' || task.lock?.attemptId !== attemptId || task.lock?.deviceId !== deviceId) {
      throw conflict('This lead is not claimed by this device for this attempt', SIM_CALL_ERROR_CODES.TASK_LOCKED);
    }
    if (attempt?.dialedAt) throw conflict('This lead was already dialled; record the outcome instead', SIM_CALL_ERROR_CODES.TASK_NOT_ACTIVE);
    const released = await SimCallTask.updateOne({ _id: task._id, state: 'in_progress', 'lock.attemptId': attemptId,
      attempts: { $elemMatch: { attemptId, dialedAt: null, completedAt: null } } }, {
      $set: { state: task.callback?.status === 'pending' ? 'scheduled' : 'pending', lock: { deviceId: null, attemptId: null, until: null } },
      $pull: { attempts: { attemptId } },
    });
    if (!released.modifiedCount) throw conflict('This attempt changed; reconcile it before releasing', SIM_CALL_ERROR_CODES.TASK_NOT_ACTIVE);
    await this._event(task.campaignId, 'task.released', { taskId: task._id, leadId: task.leadId, actor });
    await this.refreshSummary(task.campaignId);
    return this.getTask(taskId, actor);
  }

  async skipTask(taskId, actor, { attemptId = null, deviceId = null, reason = '' } = {}) {
    const task = await this._ownedTask(taskId, actor);
    if (!['pending', 'in_progress', 'scheduled', 'needs_review'].includes(task.state)) {
      throw conflict(`A ${task.state} lead cannot be skipped`, SIM_CALL_ERROR_CODES.TASK_NOT_ACTIVE);
    }
    if (task.state === 'in_progress' && (task.lock?.attemptId !== attemptId || task.lock?.deviceId !== deviceId)) {
      throw conflict('This lead is being called on another device', SIM_CALL_ERROR_CODES.TASK_LOCKED);
    }
    const attempt = task.attempts.find((a) => a.attemptId === attemptId);
    if (task.attempts.some((a) => a.dialedAt && !a.completedAt)) {
      throw conflict('This lead was already dialled; record the outcome instead', SIM_CALL_ERROR_CODES.TASK_NOT_ACTIVE);
    }
    const skipped = await SimCallTask.updateOne({ _id: task._id, state: task.state,
      attempts: { $not: { $elemMatch: { dialedAt: { $ne: null }, completedAt: null } } } }, {
      $set: { state: 'skipped', notBefore: null, lock: { deviceId: null, attemptId: null, until: null }, lastActivityAt: new Date(), ...(task.callback?.status === 'pending' ? { 'callback.status': 'cancelled' } : {}) },
      ...(attempt && !attempt.dialedAt ? { $pull: { attempts: { attemptId } } } : {}),
    });
    if (!skipped.modifiedCount) throw conflict('This attempt changed; reconcile it before skipping', SIM_CALL_ERROR_CODES.TASK_NOT_ACTIVE);
    await this._event(task.campaignId, 'task.skipped', { taskId: task._id, leadId: task.leadId, actor, details: { reason: String(reason).slice(0, 200) } });
    await this.refreshSummary(task.campaignId);
    return this.getTask(taskId, actor);
  }

  /** Validate + merge answers. Only the keys sent are touched; earlier answers are kept. */
  _mergeAnswers(campaign, existing, incoming, attemptId, actor) {
    const questions = new Map((campaign.questionnaire?.questions || []).map((q) => [q.fieldKey, q]));
    const errors = [];
    const merged = new Map((existing || []).map((a) => [a.fieldKey, a.toObject ? a.toObject() : a]));
    for (const a of incoming || []) {
      const q = questions.get(a.fieldKey);
      if (!q) { errors.push({ field: a.fieldKey, code: 'UNKNOWN_QUESTION', message: `Unknown question: ${a.fieldKey}` }); continue; }
      const base = { fieldKey: a.fieldKey, attemptId, questionsVersion: campaign.questionsVersion || 1, updatedAt: new Date(),
        questionText: q.text, source: 'manual', updatedBy: actor };
      if (a.status !== 'answered') {
        if (a.status === 'skipped' && q.required) {
          errors.push({ field: a.fieldKey, code: 'REQUIRED', message: `${q.label}: answer or mark unknown` });
          continue;
        }
        merged.set(a.fieldKey, { ...base, status: a.status, validation: a.status, value: null, normalizedValue: null });
        continue;
      }
      const raw = Array.isArray(a.value) ? a.value.join(', ') : a.value;
      if (raw === null || raw === undefined || String(raw).trim() === '') {
        errors.push({ field: a.fieldKey, code: 'EMPTY', message: `${q.label}: an answer is required (or mark it unknown)` });
        continue;
      }
      // Assisted answers are explicit form values; do not silently coerce a partial choice.
      const options = (q.options || []).map((o) => String(o.value ?? o));
      let v;
      if (['single_choice', 'enum', 'multiple_choice'].includes(q.type)) {
        const values = Array.isArray(a.value) ? a.value : [a.value];
        v = values.length && (q.type === 'multiple_choice' || !Array.isArray(a.value)) && values.every((value) => options.includes(String(value)))
          ? { validation: 'valid', normalizedValue: q.type === 'multiple_choice' ? values : values[0] }
          : { validation: 'invalid', reason: 'no_matching_option' };
      } else if (['integer', 'decimal', 'currency', 'rating'].includes(q.type) &&
        (!/^-?\d+(\.\d+)?$/.test(String(a.value).trim()) || (q.type === 'integer' && !Number.isInteger(Number(a.value))))) {
        v = { validation: 'invalid', reason: 'not_a_number' };
      } else if (q.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(String(a.value)) ||
        !Number.isFinite(Date.parse(a.value)) || new Date(a.value).toISOString().slice(0, 10) !== a.value)) {
        v = { validation: 'invalid', reason: 'unparseable_date' };
      } else if (q.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(a.value))) {
        v = { validation: 'invalid', reason: 'unparseable_time' };
      } else if (q.type === 'boolean' && typeof a.value === 'boolean') {
        v = { validation: 'valid', normalizedValue: a.value };
      } else {
        v = validateAnswer(q, raw);
      }
      if (v.validation === 'invalid') {
        errors.push({ field: a.fieldKey, code: v.reason || 'INVALID', message: `${q.label}: ${v.reason || 'invalid answer'}` });
        continue;
      }
      merged.set(a.fieldKey, {
        ...base, validation: v.validation, status: v.validation === 'unknown' ? 'unknown' : 'answered', value: a.value, normalizedValue: v.validation === 'unknown' ? null : v.normalizedValue,
      });
    }
    if (errors.length) {
      const err = new ValidationError('Some answers are not valid');
      err.details = errors;
      throw err;
    }
    // Answers to questions a skip rule now hides are kept (never silently deleted).
    return [...merged.values()];
  }

  async saveAnswers(taskId, actor, { attemptId, deviceId, answers }) {
    const task = await this._ownedTask(taskId, actor);
    if (!['in_progress', 'needs_review'].includes(task.state) || task.lock?.attemptId !== attemptId) {
      throw conflict('Answers can only be saved for the attempt that holds this lead', SIM_CALL_ERROR_CODES.ATTEMPT_MISMATCH);
    }
    const campaign = await SimCallCampaign.findById(task.campaignId).lean();
    const merged = this._mergeAnswers(campaign, task.answers, answers, attemptId, actor);
    const now = new Date();
    const res = await SimCallTask.updateOne(
      { _id: task._id, state: { $in: ['in_progress', 'needs_review'] }, 'lock.attemptId': attemptId, __v: task.__v },
      { $set: { answers: merged, lastActivityAt: now, ...(task.state === 'in_progress' && task.lock?.deviceId === deviceId ? { 'lock.until': new Date(now.getTime() + LOCK_MS) } : {}) }, $inc: { __v: 1 } },
    );
    if (!res.modifiedCount) throw conflict('Answers changed concurrently; reload and retry', SIM_CALL_ERROR_CODES.ATTEMPT_MISMATCH);
    await this._event(task.campaignId, 'task.answers_saved', { taskId: task._id, leadId: task.leadId, actor, details: { fields: (answers || []).map((a) => a.fieldKey) } });
    return this.getTask(taskId, actor);
  }

  /**
   * Record the confirmed outcome of one attempt (idempotent per attemptId) and sync it to
   * the CRM. Replaying the same outcome returns the stored result; a different outcome
   * for an already-completed attempt is a 409.
   */
  async completeTask(taskId, actor, body, meta = {}) {
    const task = await this._ownedTask(taskId, actor);
    const attempt = task.attempts.find((a) => a.attemptId === body.attemptId);
    if (attempt?.completedAt) {
      if (attempt.outcome !== body.outcome) {
        throw conflict('This call was already recorded with a different outcome', SIM_CALL_ERROR_CODES.OUTCOME_CONFLICT, { outcome: attempt.outcome });
      }
      if (attempt.sync?.status === 'failed' || attempt.sync?.status === 'pending') await this._syncAttempt(task._id, attempt.attemptId);
      return { task: await this.getTask(taskId, actor), replayed: true };
    }
    if (!attempt || !['in_progress', 'needs_review'].includes(task.state) || task.lock?.attemptId !== body.attemptId) {
      throw conflict('This attempt is not the active one for this lead', SIM_CALL_ERROR_CODES.ATTEMPT_MISMATCH, { state: task.state });
    }
    if (body.outcome !== 'cancelled' && body.outcome !== 'failed' && !attempt.dialedAt) {
      throw conflict('Record "cancelled" or "failed" for a lead that was never dialled', SIM_CALL_ERROR_CODES.TASK_NOT_ACTIVE);
    }
    const campaign = await SimCallCampaign.findById(task.campaignId).lean();
    const now = new Date();

    const qualificationAnswers = (body.qualification?.answers || []).map((answer, index) => {
      const result = normalizeConfirmedAnswer(answer, index);
      if (result.source === 'ai_proposed_user_confirmed' &&
        (!result.evidence || !`${body.notes || ''}\n${body.transcript || ''}`.includes(result.evidence))) {
        throw new ValidationError('Reviewed extraction must quote the saved notes or transcript');
      }
      return result;
    });

    let callbackAt = null;
    if (body.outcome === 'callback_requested') {
      if (!body.callback?.at || !body.callback?.timezone) throw new ValidationError('A callback needs a date, time and timezone');
      if (!isValidTimezone(body.callback.timezone)) throw new ValidationError('Invalid callback timezone');
      callbackAt = new Date(body.callback.at);
      if (callbackAt.getTime() < now.getTime() - 60_000) throw new ValidationError('The callback time is in the past');
      if (callbackAt.getTime() > now.getTime() + MAX_CALLBACK_AHEAD_MS) throw new ValidationError('The callback time is more than a year away');
    }
    const answers = body.answers?.length ? this._mergeAnswers(campaign, task.answers, body.answers, body.attemptId, actor) : task.answers;
    if (body.outcome === 'answered') {
      const missing = this.visibleQuestions(campaign, { answers }).filter((q) => q.required &&
        !answers.some((a) => a.fieldKey === q.fieldKey && ['answered', 'unknown'].includes(a.status)));
      if (missing.length) {
        const err = new ValidationError('Answer required questions or mark them unknown');
        err.details = missing.map((q) => ({ field: q.fieldKey, code: 'REQUIRED', message: `${q.label}: answer or mark unknown` }));
        throw err;
      }
    }

    const counted = !NO_CONTACT_OUTCOMES.includes(body.outcome);
    const attemptCount = (task.attemptCount || 0) + (counted ? 1 : 0);
    const failedDials = task.attempts.filter((a) => a.outcome === 'failed').length + (body.outcome === 'failed' ? 1 : 0);
    const next = nextTaskState({ outcome: body.outcome, attemptCount, failedDials, settings: campaign.settings, callbackAt, now });
    if (body.doNotContact) { next.state = 'completed'; next.notBefore = null; }
    if (campaign.status === 'cancelled' && ['pending', 'scheduled'].includes(next.state)) {
      next.state = 'cancelled'; next.notBefore = null;
    }
    const callbackWasPending = task.callback?.status === 'pending';
    const set = {
      state: next.state,
      outcome: body.outcome === 'cancelled' ? task.outcome : body.outcome,
      notBefore: next.notBefore,
      attemptCount,
      answers,
      lock: { deviceId: null, attemptId: null, until: null },
      lastActivityAt: now,
      completedAt: next.state === 'completed' ? now : null,
      'attempts.$.outcome': body.outcome,
      'attempts.$.interest': body.interest ?? null,
      'attempts.$.evidence': body.call?.evidence || 'user',
      'attempts.$.offhookAt': body.call?.offhookAt || null,
      'attempts.$.endedAt': body.call?.endedAt || null,
      'attempts.$.durationSec': body.call?.durationSec ?? null,
      'attempts.$.offhookDurationSec': body.call?.offhookDurationSec ?? null,
      'attempts.$.notes': body.notes || '',
      'attempts.$.transcript': body.transcript || '',
      'attempts.$.doNotContact': Boolean(body.doNotContact),
      'attempts.$.answers': answers,
      'attempts.$.qualificationAnswers': qualificationAnswers,
      'attempts.$.callbackSnapshot': body.outcome === 'callback_requested' && !body.doNotContact
        ? { at: callbackAt, timezone: body.callback.timezone, reason: body.callback.reason || '' } : null,
      'attempts.$.completedAt': now,
      'attempts.$.sync': { status: counted ? 'pending' : 'skipped', operationId: null, error: null, attempts: 0, at: null },
    };
    if (body.outcome === 'callback_requested') {
      set.callback = {
        at: callbackAt, timezone: body.callback.timezone, reason: body.callback.reason || '', status: 'pending',
        attemptId: body.attemptId, notifiedAt: null,
      };
      if (campaign.status === 'cancelled' || body.doNotContact) set.callback.status = 'cancelled';
    } else if (callbackWasPending && body.outcome !== 'cancelled') {
      set['callback.status'] = 'done';
    }
    const res = await SimCallTask.updateOne(
      { _id: task._id, __v: task.__v, 'lock.attemptId': body.attemptId, attempts: { $elemMatch: { attemptId: body.attemptId, completedAt: null } } },
      { $set: set, $inc: { __v: 1 } },
    );
    if (!res.modifiedCount) {
      // Lost a race with a concurrent completion of the same attempt: return the stored result.
      const fresh = await SimCallTask.findById(task._id).lean();
      const stored = fresh.attempts.find((a) => a.attemptId === body.attemptId);
      if (stored?.completedAt && stored.outcome === body.outcome) return { task: await this.getTask(taskId, actor), replayed: true };
      throw conflict('This lead changed concurrently; reload and retry', SIM_CALL_ERROR_CODES.ATTEMPT_MISMATCH);
    }

    await this._event(task.campaignId, 'task.completed', {
      taskId: task._id, leadId: task.leadId, actor,
      details: { outcome: body.outcome, evidence: body.call?.evidence || 'user', nextState: next.state, callbackAt },
    });
    this._audit('sim_call.task.completed', actor, meta, { campaignId: task.campaignId, taskId: task._id, outcome: body.outcome });
    if (counted) await this._syncAttempt(task._id, body.attemptId);
    // Cancellation may have committed while this outcome was being validated/synced.
    const latestCampaign = await SimCallCampaign.findById(task.campaignId).select('status').lean();
    if (latestCampaign?.status === 'cancelled') {
      await SimCallTask.updateOne({ _id: task._id, state: { $in: ['pending', 'scheduled'] } }, {
        $set: { state: 'cancelled', notBefore: null },
      });
      await SimCallTask.updateOne({ _id: task._id, 'callback.status': 'pending' }, { $set: { 'callback.status': 'cancelled' } });
    }
    await SimCallCampaign.updateOne({ _id: task.campaignId }, { $set: { lastActivityAt: now } });
    await this.refreshSummary(task.campaignId);
    emit(actor, 'sim-call:task', { campaignId: String(task.campaignId), taskId: String(task._id) });
    return { task: await this.getTask(taskId, actor), replayed: false };
  }

  /**
   * Write one completed attempt into the CRM through leadCommunication (contact log,
   * lastContactedAt, follow-up, do-not-contact). Idempotent: operationId = simcall-<attemptId>.
   */
  async _syncAttempt(taskId, attemptId) {
    const task = await SimCallTask.findById(taskId).lean();
    const attempt = task?.attempts.find((a) => a.attemptId === attemptId);
    if (!attempt?.completedAt) return null;
    const doNotContact = Boolean(attempt.doNotContact);
    const mapped = communicationOutcome(attempt, { doNotContact });
    if (!mapped) {
      await SimCallTask.updateOne({ _id: taskId, 'attempts.attemptId': attemptId }, { $set: { 'attempts.$.sync.status': 'skipped' } });
      return 'skipped';
    }
    const campaign = await SimCallCampaign.findById(task.campaignId).select('name questionnaire').lean();
    const operationId = `simcall-${attemptId}`;
    const labels = new Map((campaign.questionnaire?.questions || []).map((q) => [q.fieldKey, q.label]));
    const answerLines = (attempt.answers || task.answers || [])
      .map((a) => `- ${labels.get(a.fieldKey) || a.fieldKey}: ${a.status === 'answered' ? (Array.isArray(a.value) ? a.value.join(', ') : a.value) : a.status}`);
    const callback = attempt.callbackSnapshot !== undefined ? attempt.callbackSnapshot
      : task.callback?.attemptId === attemptId ? task.callback : null;
    const notes = attempt.crmNotes ?? [
      `SIM call campaign "${campaign.name}". Outcome confirmed by the caller: ${attempt.outcome}${attempt.interest ? ` (${attempt.interest})` : ''}.`,
      answerLines.length ? `Answers:\n${answerLines.join('\n')}` : '',
      attempt.notes ? `Notes: ${attempt.notes}` : '',
      attempt.transcript ? `Voice note (transcribed, reviewed by the caller): ${attempt.transcript}` : '',
      callback ? `Callback requested: ${new Date(callback.at).toISOString()} (${callback.timezone})${callback.reason ? ` — ${callback.reason}` : ''}` : '',
    ].filter(Boolean).join('\n').slice(0, 5000);
    try {
      // Snapshot the original CRM payload before any side effects; retries remain identical
      // after callback edits, subsequent answers or partial communication receipts.
      await SimCallTask.updateOne({ _id: taskId, 'attempts.attemptId': attemptId }, { $set: { 'attempts.$.crmNotes': notes } });
      if (doNotContact && attempt.destinationHash) {
        await CallSuppression.updateOne({ phoneHash: attempt.destinationHash }, {
          $setOnInsert: { leadId: task.leadId, reason: 'do_not_contact', source: 'mobile_app', suppressedAt: new Date(), createdBy: task.createdBy },
        }, { upsert: true });
      }
      await leadCommunicationService.create(String(task.leadId), {
        operationId, channel: 'phone', route: 'sim_call_campaign', mode: 'assisted', destinationField: attempt.destinationField || task.destinationField,
        startedAt: attempt.dialedAt || attempt.claimedAt, sim: attempt.subscriptionId != null ? { subscriptionId: attempt.subscriptionId } : undefined,
      }, task.createdBy, {}, { skipEligibility: true });
      const result = await leadCommunicationService.complete(String(task.leadId), operationId, {
        outcome: {
          ...mapped, notes,
          followUpAt: callback ? callback.at : null, followUpTimezone: callback ? callback.timezone : null,
          statusChange: null, doNotContact,
        },
        qualification: { answers: attempt.qualificationAnswers || [] },
      }, task.createdBy, {});
      if (!result.receipt?.completedAt) throw new Error('CRM persistence is incomplete; retry synchronization');
      await SimCallTask.updateOne({ _id: taskId, 'attempts.attemptId': attemptId }, {
        $set: { 'attempts.$.sync.status': 'ok', 'attempts.$.sync.operationId': operationId, 'attempts.$.sync.error': null, 'attempts.$.sync.at': new Date() },
        $inc: { 'attempts.$.sync.attempts': 1 },
      });
      await this._event(task.campaignId, 'task.synced', { taskId, leadId: task.leadId, details: { operationId } });
      return 'ok';
    } catch (err) {
      await SimCallTask.updateOne({ _id: taskId, 'attempts.attemptId': attemptId }, {
        $set: { 'attempts.$.sync.status': 'failed', 'attempts.$.sync.operationId': operationId, 'attempts.$.sync.error': String(err.message).slice(0, 500), 'attempts.$.sync.at': new Date() },
        $inc: { 'attempts.$.sync.attempts': 1 },
      });
      await this._event(task.campaignId, 'task.sync_failed', { taskId, leadId: task.leadId, details: { error: String(err.message).slice(0, 200) } });
      logger.warn('SIM call CRM sync failed', { module: 'sim-call', taskId: String(taskId), error: { message: err.message } });
      return 'failed';
    }
  }

  async retrySync(taskId, actor) {
    const task = await this._ownedTask(taskId, actor);
    for (const a of task.attempts) {
      if (a.completedAt && ['failed', 'pending'].includes(a.sync?.status)) await this._syncAttempt(task._id, a.attemptId);
    }
    await this.refreshSummary(task.campaignId);
    return this.getTask(taskId, actor);
  }

  // ---------------------------------------------------------------- callbacks
  async listCallbacks(actor, { status = 'pending', from, to, page = 1, limit = 50 } = {}) {
    const now = new Date();
    const filter = { createdBy: actor };
    if (status === 'overdue') Object.assign(filter, { 'callback.status': 'pending', 'callback.at': { $lte: now } });
    else if (status === 'pending') Object.assign(filter, { 'callback.status': 'pending' });
    else filter['callback.status'] = status;
    if (from || to) {
      // "overdue" is capped at now: a later `to` must not widen it to future callbacks.
      const upper = [filter['callback.at']?.$lte, to ? new Date(to) : null].filter(Boolean);
      filter['callback.at'] = {
        ...(from ? { $gte: new Date(from) } : {}),
        ...(upper.length ? { $lte: new Date(Math.min(...upper.map((d) => d.getTime()))) } : {}),
      };
    }
    const [rows, total] = await Promise.all([
      SimCallTask.find(filter).sort({ 'callback.at': 1 }).skip((page - 1) * limit).limit(limit)
        .populate('leadId', 'name leadNumber contactName status address.city').populate('campaignId', 'name status').lean(),
      SimCallTask.countDocuments(filter),
    ]);
    return {
      data: rows.map((t) => ({
        ...serializeTask(t, { includeAttempts: false }),
        campaign: t.campaignId ? { id: String(t.campaignId._id), name: t.campaignId.name, status: t.campaignId.status } : null,
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  async rescheduleCallback(taskId, actor, { at, timezone, reason }) {
    const task = await this._ownedTask(taskId, actor);
    if (task.state !== 'scheduled' || task.callback?.status !== 'pending') {
      throw conflict('Only a pending callback can be rescheduled', SIM_CALL_ERROR_CODES.TASK_NOT_ACTIVE);
    }
    if (!isValidTimezone(timezone)) throw new ValidationError('Invalid callback timezone');
    const when = new Date(at);
    const now = Date.now();
    if (when.getTime() < now - 60_000) throw new ValidationError('The callback time is in the past');
    if (when.getTime() > now + MAX_CALLBACK_AHEAD_MS) throw new ValidationError('The callback time is more than a year away');
    await SimCallTask.updateOne({ _id: task._id, state: 'scheduled' }, {
      $set: { 'callback.at': when, 'callback.timezone': timezone, ...(reason !== undefined ? { 'callback.reason': reason } : {}), 'callback.notifiedAt': null, notBefore: when, lastActivityAt: new Date() },
    });
    await this._event(task.campaignId, 'task.callback_rescheduled', { taskId: task._id, leadId: task.leadId, actor, details: { at: when, timezone } });
    await this.refreshSummary(task.campaignId);
    return this.getTask(taskId, actor);
  }

  async cancelCallback(taskId, actor) {
    const task = await this._ownedTask(taskId, actor);
    if (task.state !== 'scheduled' || task.callback?.status !== 'pending') {
      throw conflict('Only a pending callback can be cancelled', SIM_CALL_ERROR_CODES.TASK_NOT_ACTIVE);
    }
    const now = new Date();
    await SimCallTask.updateOne({ _id: task._id, state: 'scheduled' }, {
      $set: { state: 'completed', 'callback.status': 'cancelled', notBefore: null, completedAt: now, lastActivityAt: now },
    });
    await this._event(task.campaignId, 'task.callback_cancelled', { taskId: task._id, leadId: task.leadId, actor });
    await this.refreshSummary(task.campaignId);
    return this.getTask(taskId, actor);
  }

  async listEvents(campaignId, actor, { page = 1, limit = 50 } = {}) {
    await this._ownedCampaign(campaignId, actor);
    const [data, total] = await Promise.all([
      SimCallEvent.find({ campaignId }).sort({ at: -1, _id: -1 }).skip((page - 1) * limit).limit(limit)
        .populate('leadId', 'name leadNumber').lean(),
      // Bounded: a long-running campaign logs tens of thousands of events.
      SimCallEvent.countDocuments({ campaignId }, { limit: EVENTS_COUNT_CAP }),
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit), totalCapped: total >= EVENTS_COUNT_CAP } };
  }

  /** All SIM call tasks of one lead for the owner (lead history). */
  async leadTasks(leadId, actor) {
    const rows = await SimCallTask.find({ leadId, createdBy: actor }).sort({ updatedAt: -1 }).limit(20)
      .populate('campaignId', 'name status questionnaire').lean();
    return rows.map((t) => ({
      ...serializeTask(t),
      campaign: t.campaignId ? { id: String(t.campaignId._id), name: t.campaignId.name, status: t.campaignId.status, questions: t.campaignId.questionnaire?.questions || [] } : null,
    }));
  }

  /** Questions currently shown for a task (skip rules applied to its answers). */
  visibleQuestions(campaign, task) {
    return (campaign.questionnaire?.questions || [])
      .slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .filter((q) => conditionMet(q.condition, answerMap(task.answers)));
  }

  // -------------------------------------------------------------------- sweep
  /**
   * Every 5 min: expired locks (a dialled attempt becomes needs_review — never auto-redialled;
   * an undialled one goes back to the queue), due-callback reminders, CRM sync retries.
   */
  async sweep(now = new Date()) {
    const touched = new Set();
    const stale = await SimCallTask.find({ state: 'in_progress', 'lock.until': { $lt: now } }).limit(500);
    for (const task of stale) {
      const attempt = task.attempts.find((a) => a.attemptId === task.lock?.attemptId);
      const dialled = Boolean(attempt?.dialedAt);
      const campaignStatus = (await SimCallCampaign.findById(task.campaignId).select('status').lean())?.status;
      const release = campaignStatus === 'cancelled' ? 'cancelled' : (task.callback?.status === 'pending' ? 'scheduled' : 'pending');
      const res = await SimCallTask.updateOne({ _id: task._id, state: 'in_progress', 'lock.attemptId': task.lock.attemptId,
        'lock.until': { $lt: now }, attempts: { $elemMatch: { attemptId: task.lock.attemptId, dialedAt: attempt?.dialedAt || null } } }, dialled
        ? { $set: { state: 'needs_review', 'lock.until': null } } // keep attemptId so the device can still record the outcome
        : { $set: { state: release, lock: { deviceId: null, attemptId: null, until: null } }, $pull: { attempts: { attemptId: task.lock.attemptId } } });
      if (res.modifiedCount) {
        touched.add(String(task.campaignId));
        await this._event(task.campaignId, 'task.lock_expired', { taskId: task._id, leadId: task.leadId, details: { dialled } });
      }
    }

    const due = await SimCallTask.find({ 'callback.status': 'pending', 'callback.at': { $lte: now }, 'callback.notifiedAt': null })
      .populate('leadId', 'name').populate('campaignId', 'name status').limit(500).lean();
    for (const t of due) {
      const res = await SimCallTask.updateOne({ _id: t._id, 'callback.notifiedAt': null }, { $set: { 'callback.notifiedAt': now } });
      if (!res.modifiedCount) continue;
      touched.add(String(t.campaignId?._id || t.campaignId));
      await this._event(t.campaignId?._id || t.campaignId, 'task.callback_due', { taskId: t._id, leadId: t.leadId?._id });
      notificationService.create({
        channels: ['IN_APP'], recipientIds: [t.createdBy], type: 'sim_call.callback_due', category: 'CRM', priority: 'HIGH',
        payload: {
          title: 'Callback due',
          message: `Call back ${t.leadId?.name || 'a lead'}${t.campaignId?.name ? ` (${t.campaignId.name})` : ''}${t.callback?.reason ? `: ${t.callback.reason}` : ''}.`,
          taskId: String(t._id), campaignId: String(t.campaignId?._id || t.campaignId),
        },
        sourceModule: 'sim-call', sourceEvent: 'CALLBACK_DUE', sourceEntityType: 'SimCallTask', sourceEntityId: t._id,
        idempotencyKey: `sim-call-callback-${t._id}-${new Date(t.callback.at).getTime()}`,
      }, t.createdBy).catch(() => {});
    }

    const unsynced = await SimCallTask.find({
      attempts: { $elemMatch: { 'sync.status': { $in: ['failed', 'pending'] }, completedAt: { $ne: null, $lt: new Date(now.getTime() - 60_000) }, 'sync.attempts': { $lt: MAX_SYNC_ATTEMPTS } } },
    }).select('_id campaignId attempts').limit(200).lean();
    for (const t of unsynced) {
      for (const a of t.attempts) {
        if (a.completedAt && ['failed', 'pending'].includes(a.sync?.status) && (a.sync?.attempts || 0) < MAX_SYNC_ATTEMPTS) {
          await this._syncAttempt(t._id, a.attemptId);
          touched.add(String(t.campaignId));
        }
      }
    }
    for (const id of touched) await this.refreshSummary(id);
    return { staleLocks: stale.length, callbacksDue: due.length, syncRetried: unsynced.length };
  }
}

function toId(id) {
  return typeof id === 'string' ? new (SimCallTask.base.Types.ObjectId)(id) : id;
}

export default new SimCallService();
