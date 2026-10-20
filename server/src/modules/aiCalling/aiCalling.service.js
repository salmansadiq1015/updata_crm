import crypto from 'node:crypto';
import mongoose from 'mongoose';
import CallCampaign from './callCampaign.model.js';
import CampaignRecipient from './campaignRecipient.model.js';
import CallRecord from './callRecord.model.js';
import CallProviderAttempt from './callProviderAttempt.model.js';
import CallSuppression from './callSuppression.model.js';
import CallConsent from './callConsent.model.js';
import { LeadCallTransition, CallWebhookEvent } from './leadCallEvent.model.js';
import Lead, { LEAD_STATUS } from '../crm/lead.model.js';
import leadRepository from '../crm/lead.repository.js';
import userRepository from '../auth/user.repository.js';
import auditService from '../auth/audit.service.js';
import notificationService from '../notifications/notification.service.js';
import queueManager from '../../shared/queue/QueueManager.js';
import logger from '../../shared/logger/index.js';
import { AppError, NotFoundError, ConflictError, ValidationError, ServiceUnavailableError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import { normalizePhone } from '../businessDiscovery/engine/normalizer.js';
import { toCsv } from '../../shared/utils/csv.js';
import livekit from './providers/livekitSip.provider.js';
import { routeOutboundCall, telephonyHealth } from './providers/telephonyRouter.js';
import { phoneHash, issueAgentToken } from './callAuth.js';
import {
  OUTBOUND_CALL_QUEUE, ACTION_TO_LEAD_STATUS, PROTECTED_LEAD_STATUSES, normalizeTelephonyStatus,
} from './aiCalling.constants.js';
import { validateAnswer } from './engine/answerValidation.js';
import * as engine from './engine/questionEngine.js';
import { evaluateOutcome } from './engine/statusRuleEngine.js';
import { leadContext, buildSystemPrompt, disclosureText } from './engine/leadContext.js';
import { windowState, recipientWindow } from './engine/callWindow.js';
import { recordCallMetric, observeDuration, observeDispatchLatency } from './aiCalling.metrics.js';

export { windowState };

const MAX_FILTERED_RECIPIENTS = 5000;
const PROCESSING_LEASE_MS = 2 * 60_000;   // post-call processing claim
const TICK_LEASE_MS = 90_000;             // one tick at a time per campaign
const DISPATCH_LEASE_MS = 2 * 60_000;     // claim → provider request window
const TERMINAL_CALL_STATES = new Set(['completed', 'no_answer', 'busy', 'voicemail', 'failed', 'cancelled']);
// Web (browser) voice tests are attached to a real recipient for lead context but
// must never count as campaign traffic or touch the recipient's state.
const NOT_WEB_TEST = { provider: { $ne: 'livekit_web' } };
const callConsentRequired = () => process.env.AI_CALLING_REQUIRE_CONSENT !== 'false';

/**
 * Company-wide consent decisions. Leads are shared across users, so consent is a
 * fact about the (lead, phone) pair, not about whoever recorded it: the most
 * recent decision wins regardless of author. A revocation by any user therefore
 * blocks every campaign, and a later re-grant (with evidence) re-enables it.
 * @returns {Map<string, object>} key `${leadId}:${phoneHash}` → latest consent row
 */
async function latestConsentByLead(phoneHashes) {
  if (!phoneHashes.length) return new Map();
  const rows = await CallConsent.find({ phoneHash: { $in: phoneHashes } }).sort({ updatedAt: 1 }).lean();
  const latest = new Map();
  for (const row of rows) latest.set(`${row.leadId}:${row.phoneHash}`, row);
  return latest;
}

/** 'granted' | 'expired' | 'missing' | 'revoked' for one latest-consent row. */
export function consentStatus(row, now = new Date()) {
  if (!row) return 'missing';
  if (row.status !== 'granted') return 'revoked';
  if (row.expiresAt && new Date(row.expiresAt) <= now) return 'expired';
  return 'granted';
}

function emitToOwner(userId, event, payload) {
  try { global.io?.to(`user:${userId}`).emit(event, payload); } catch { /* realtime is best-effort */ }
}

function validDestination(lead) {
  const raw = lead.mobile || lead.phone || '';
  const normalized = normalizePhone(raw, lead.address?.country || 'CH');
  return normalized.valid ? normalized.e164 : null;
}

/** Validate questionnaire integrity before snapshotting. */
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
  // Conditions may only reference declared fieldKeys.
  const referenced = [];
  for (const q of questions) {
    for (const group of ['all', 'any']) {
      for (const clause of q.condition?.[group] || []) referenced.push(clause.field);
    }
  }
  for (const field of referenced) {
    if (field && !keys.has(field)) throw new ValidationError(`Condition references unknown field: ${field}`);
  }
}

async function resolveLeadIds(selection) {
  if (selection.mode === 'explicit') return [...new Set(selection.leadIds.map(String))];
  const { q, search, ...filters } = selection.filters || {};
  const term = search ?? q;
  // An empty filter object would silently target the entire lead database.
  const hasFilter = Object.values(filters).some((v) => v !== undefined && v !== null && v !== '')
    || Boolean(String(term || '').trim());
  if (!hasFilter) throw new ValidationError('A filter selection needs at least one filter; select leads explicitly to call everyone');
  let searchUserIds = [];
  if (term) searchUserIds = await userRepository.findIdsByNameOrEmail(term, 50).catch(() => []);
  const filter = await leadRepository.buildDatasetFilter({ filters, search: term, searchUserIds });
  const docs = await Lead.find({ ...filter, isDeleted: false })
    .sort({ _id: 1 }).limit(MAX_FILTERED_RECIPIENTS + 1).select('_id').lean();
  if (docs.length > MAX_FILTERED_RECIPIENTS) {
    throw new AppError(`Filtered selection exceeds the ${MAX_FILTERED_RECIPIENTS} recipient safety limit`, 413, ERROR_CODES.VALIDATION_ERROR);
  }
  return docs.map((d) => String(d._id));
}

export async function refreshCampaignSummary(campaignId) {
  const cid = new mongoose.Types.ObjectId(campaignId);
  const [stateRows, reasonRows, qualRows, callAgg] = await Promise.all([
    CampaignRecipient.aggregate([{ $match: { campaignId: cid } }, { $group: { _id: '$state', count: { $sum: 1 } } }]),
    CampaignRecipient.aggregate([
      { $match: { campaignId: cid } }, { $unwind: '$eligibility.reasons' },
      { $group: { _id: '$eligibility.reasons', count: { $sum: 1 } } },
    ]),
    CampaignRecipient.aggregate([
      { $match: { campaignId: cid, qualification: { $ne: null } } },
      { $group: { _id: '$qualification', count: { $sum: 1 } } },
    ]),
    CallRecord.aggregate([
      { $match: { campaignId: cid, ...NOT_WEB_TEST } },
      { $group: {
        _id: null,
        totalSeconds: { $sum: '$durationSeconds' },
        cost: { $sum: '$cost.amount' },
        answered: { $sum: { $cond: [{ $in: ['$disposition', ['answered_completed', 'answered_partial']] }, 1, 0] } },
        noAnswer: { $sum: { $cond: [{ $in: ['$disposition', ['no_answer', 'busy', 'voicemail']] }, 1, 0] } },
      } },
    ]),
  ]);
  const s = Object.fromEntries(stateRows.map((r) => [r._id, r.count]));
  const reasons = Object.fromEntries(reasonRows.map((r) => [r._id, r.count]));
  const qual = Object.fromEntries(qualRows.map((r) => [r._id, r.count]));
  const call = callAgg[0] || {};
  const total = stateRows.reduce((sum, r) => sum + r.count, 0);
  const summary = {
    total,
    eligible: total - (s.ineligible || 0) - (s.suppressed || 0),
    ineligible: s.ineligible || 0,
    queued: (s.queued || 0) + (s.draft || 0) + (s.retry_scheduled || 0),
    inProgress: (s.dialing || 0) + (s.in_progress || 0) + (s.processing || 0),
    completed: s.completed || 0,
    answered: call.answered || 0,
    noAnswer: call.noAnswer || 0,
    failed: (s.failed || 0),
    retryScheduled: s.retry_scheduled || 0,
    qualified: qual.qualified || 0,
    unqualified: qual.unqualified || 0,
    callbacks: qual.callback || 0,
    needsReview: qual.review || 0,
    doNotContact: qual.do_not_contact || 0,
    suppressed: s.suppressed || 0,
    missingPhone: reasons.missing_phone || 0,
    consentRequired: (reasons.consent_required || 0) + (reasons.consent_expired || 0),
    totalCallSeconds: call.totalSeconds || 0,
    actualCost: Number((call.cost || 0).toFixed(4)),
  };
  const pending = (s.draft || 0) + (s.queued || 0) + (s.dialing || 0) + (s.in_progress || 0)
    + (s.processing || 0) + (s.retry_scheduled || 0);
  const update = { summary };
  const campaign = await CallCampaign.findById(campaignId).select('status createdBy').lean();
  if (pending === 0 && total > 0 && campaign && !['cancelled', 'draft', 'paused'].includes(campaign.status)) {
    update.status = 'completed';
    update.completedAt = new Date();
  }
  // Only complete a campaign that is still active; never resurrect a cancel/pause
  // that landed between the read above and this write.
  if (update.status) {
    const done = await CallCampaign.updateOne(
      { _id: campaignId, status: { $nin: ['cancelled', 'draft', 'paused', 'completed'] } },
      { $set: update },
    );
    if (!done.modifiedCount) await CallCampaign.updateOne({ _id: campaignId }, { $set: { summary } });
  } else {
    await CallCampaign.updateOne({ _id: campaignId }, { $set: update });
  }
  emitToOwner(campaign?.createdBy, 'ai-calling:summary', { campaignId: String(campaignId), summary });
  return summary;
}

/**
 * Production misconfiguration that makes real calls unsafe, or null. The worker
 * reaches the CRM via PUBLIC_API_BASE_URL embedded in each call's metadata; the
 * localhost fallback only works when the worker runs on the same host in dev.
 */
export function agentApiMisconfiguration(env = process.env) {
  if (env.NODE_ENV !== 'production') return null;
  const base = String(env.PUBLIC_API_BASE_URL || '').trim();
  if (!base) return 'PUBLIC_API_BASE_URL is not set';
  if (!/^https:\/\//i.test(base)) return 'PUBLIC_API_BASE_URL must be https in production';
  return null;
}

/** Midnight of "today" in the campaign timezone, as a UTC Date. */
export function startOfLocalDay(timezone = 'UTC', now = new Date()) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).map((p) => [p.type, Number(p.value)]));
    const elapsed = ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000 + now.getMilliseconds();
    return new Date(now.getTime() - elapsed);
  } catch {
    const d = new Date(now); d.setUTCHours(0, 0, 0, 0); return d;
  }
}

/**
 * Retry delay: the configured base delay, doubled per previous attempt (capped
 * at 24h), plus up to 10% jitter so a batch of failures doesn't re-dial in lockstep.
 */
export function retryDelayMs(schedule = {}, attemptsSoFar = 1, random = Math.random) {
  const base = Math.max(1, schedule.retryDelayMinutes || 120) * 60_000;
  const minGap = Math.max(0, schedule.minMinutesBetweenAttempts || 0) * 60_000;
  const exp = Math.min(base * 2 ** Math.max(0, attemptsSoFar - 1), 24 * 60 * 60_000);
  return Math.max(minGap, Math.round(exp + exp * 0.1 * random()));
}

class AiCallingService {
  // ---------------------------------------------------------------- campaigns
  async createCampaign(input, actor, meta = {}) {
    assertQuestionnaire(input.questionnaire);
    const leadIds = await resolveLeadIds(input.selection);
    if (!leadIds.length) throw new ValidationError('No leads match the selected recipients');

    const leads = await Lead.find({ _id: { $in: leadIds }, isDeleted: false })
      .select('_id name phone mobile address status').lean();
    if (!leads.length) throw new ValidationError('Selected leads are unavailable');

    const campaign = await CallCampaign.create({
      name: input.name,
      description: input.description || '',
      status: 'draft',
      questionnaireVersion: 1,
      questionnaire: input.questionnaire,
      statusRules: input.statusRules || [],
      agentConfig: input.agentConfig || {},
      schedule: input.schedule || {},
      selection: { ...input.selection, leadIds, selectedAt: new Date() },
      timezone: input.schedule?.timezone || input.timezone || 'UTC',
      scheduledAt: input.scheduledAt || null,
      isTest: Boolean(input.isTest),
      createdBy: actor,
      updatedBy: actor,
    });

    // Build recipients with eligibility. Suppression + duplicate-phone checks.
    const candidateHashes = [];
    const computed = leads.map((lead) => {
      const e164 = validDestination(lead);
      const hash = e164 ? phoneHash(e164) : null;
      if (hash) candidateHashes.push(hash);
      return { lead, e164, hash };
    });
    const [suppressionRows, consentByLead] = await Promise.all([
      CallSuppression.find({ phoneHash: { $in: candidateHashes } }).select('phoneHash').lean(),
      callConsentRequired() ? latestConsentByLead(candidateHashes) : new Map(),
    ]);
    const suppressed = new Set(suppressionRows.map((d) => d.phoneHash));

    const seen = new Set();
    const docs = computed.map(({ lead, e164, hash }) => {
      const reasons = [];
      if (!e164) reasons.push('missing_phone');
      if (hash && suppressed.has(hash)) reasons.push('suppressed');
      const consent = hash ? consentStatus(consentByLead.get(`${lead._id}:${hash}`)) : 'missing';
      if (callConsentRequired() && hash && consent !== 'granted') {
        reasons.push(consent === 'expired' ? 'consent_expired' : 'consent_required');
      }
      if (hash && seen.has(hash)) reasons.push('duplicate_phone');
      if (hash) seen.add(hash);
      const isSuppressed = reasons.includes('suppressed');
      return {
        campaignId: campaign._id,
        leadId: lead._id,
        phoneSnapshot: e164,
        phoneHash: hash,
        country: lead.address?.country || null,
        state: reasons.length ? (isSuppressed ? 'suppressed' : 'ineligible') : 'draft',
        eligibility: { eligible: reasons.length === 0, reasons },
        createdBy: actor,
      };
    });
    await CampaignRecipient.insertMany(docs, { ordered: false });
    await refreshCampaignSummary(campaign._id);

    auditService.logEvent({
      eventType: 'ai_calling.campaign.created', userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'ai-calling',
      details: { campaignId: campaign._id, selected: leadIds.length, isTest: campaign.isTest },
    });
    return this.getCampaign(campaign._id, actor);
  }

  async getCampaign(id, actor) {
    const campaign = await CallCampaign.findOne({ _id: id, createdBy: actor }).lean();
    if (!campaign) throw new NotFoundError('CallCampaign', id);
    return campaign;
  }

  async listCampaigns(actor, { page = 1, limit = 25, status } = {}) {
    const filter = { createdBy: actor };
    if (status) filter.status = status;
    const [data, total] = await Promise.all([
      CallCampaign.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      CallCampaign.countDocuments(filter),
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async updateCampaign(id, input, actor) {
    const campaign = await CallCampaign.findOne({ _id: id, createdBy: actor });
    if (!campaign) throw new NotFoundError('CallCampaign', id);
    if (!['draft', 'paused'].includes(campaign.status)) throw new ConflictError('Only draft or paused campaigns can be edited');
    if (input.questionnaire) {
      assertQuestionnaire(input.questionnaire);
      campaign.questionnaire = input.questionnaire;
      campaign.questionnaireVersion += 1;
    }
    for (const key of ['name', 'description', 'statusRules', 'agentConfig', 'schedule', 'scheduledAt']) {
      if (input[key] !== undefined) campaign[key] = input[key];
    }
    campaign.updatedBy = actor;
    await campaign.save();
    return this.getCampaign(id, actor);
  }

  async previewCampaign(id, actor) {
    const campaign = await this.getCampaign(id, actor);
    const rows = await CampaignRecipient.aggregate([
      { $match: { campaignId: new mongoose.Types.ObjectId(id) } },
      { $group: { _id: '$state', count: { $sum: 1 } } },
    ]);
    const byState = Object.fromEntries(rows.map((r) => [r._id, r.count]));
    const eligible = (byState.draft || 0);
    const schedule = campaign.schedule || {};
    const avgCallSeconds = 90;
    const concurrency = Math.max(1, schedule.maxConcurrency || 1);
    const estimatedMinutes = Math.ceil((eligible * avgCallSeconds) / 60 / concurrency);
    return {
      campaignId: id,
      totalSelected: campaign.summary.total,
      eligible,
      missingPhone: campaign.summary.missingPhone,
      suppressed: byState.suppressed || 0,
      ineligible: byState.ineligible || 0,
      estimatedDurationMinutes: estimatedMinutes,
      concurrency,
      maxAttemptsPerLead: schedule.maxAttemptsPerLead,
      retryDelayMinutes: schedule.retryDelayMinutes,
      telephony: await telephonyHealth(),
      note: 'Cost depends on OpenAI Realtime usage and SIP/carrier charges; these are not free.',
    };
  }

  async startCampaign(id, actor, { scheduledAt = null } = {}, meta = {}) {
    const campaign = await CallCampaign.findOne({ _id: id, createdBy: actor }).lean();
    if (!campaign) throw new NotFoundError('CallCampaign', id);
    if (!['draft', 'paused', 'scheduled'].includes(campaign.status)) {
      throw new ConflictError('Only draft, scheduled or paused campaigns can be started');
    }
    const eligible = await CampaignRecipient.countDocuments({ campaignId: id, state: { $in: ['draft', 'queued', 'retry_scheduled'] }, 'eligibility.eligible': true });
    if (!eligible) throw new ConflictError('Campaign has no eligible recipients to call');

    const runAt = scheduledAt ? new Date(scheduledAt) : campaign.scheduledAt;
    const delay = runAt && runAt > new Date() ? runAt.getTime() - Date.now() : 0;
    // Compare-and-set on status: a double click or a concurrent pause/cancel can't
    // both win, and a cancelled campaign can never be restarted.
    const started = await CallCampaign.findOneAndUpdate(
      { _id: id, createdBy: actor, status: campaign.status },
      { $set: {
        status: delay ? 'scheduled' : 'running',
        scheduledAt: runAt || null,
        startedAt: campaign.startedAt || (delay ? null : new Date()),
        pausedAt: null,
        updatedBy: actor,
      } },
      { returnDocument: 'after' },
    );
    if (!started) throw new ConflictError('Campaign state changed concurrently; refresh and try again');

    // Move draft → queued so the tick can lease them.
    await CampaignRecipient.updateMany(
      { campaignId: id, state: 'draft', 'eligibility.eligible': true },
      { $set: { state: 'queued' } },
    );
    await this._scheduleTick(id, delay);
    await refreshCampaignSummary(id);
    auditService.logEvent({
      eventType: 'ai_calling.campaign.started', userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'ai-calling', details: { campaignId: id, eligible, scheduledAt: runAt },
    });
    return this.getCampaign(id, actor);
  }

  async pauseCampaign(id, actor, meta = {}) {
    const paused = await CallCampaign.findOneAndUpdate(
      { _id: id, createdBy: actor, status: { $in: ['running', 'scheduled', 'queued'] } },
      { $set: { status: 'paused', pausedAt: new Date(), updatedBy: actor } },
      { returnDocument: 'after' },
    );
    if (!paused) {
      if (!await CallCampaign.exists({ _id: id, createdBy: actor })) throw new NotFoundError('CallCampaign', id);
      throw new ConflictError('Campaign is not running');
    }
    auditService.logEvent({ eventType: 'ai_calling.campaign.paused', userId: actor, ipAddress: meta.ipAddress || 'internal', result: 'success', module: 'ai-calling', details: { campaignId: id } });
    return this.getCampaign(id, actor);
  }

  async cancelCampaign(id, actor, meta = {}) {
    const cancelled = await CallCampaign.findOneAndUpdate(
      { _id: id, createdBy: actor, status: { $nin: ['completed', 'cancelled'] } },
      { $set: { status: 'cancelled', cancelledAt: new Date(), updatedBy: actor, tickToken: null } },
      { returnDocument: 'after' },
    );
    if (!cancelled) {
      if (!await CallCampaign.exists({ _id: id, createdBy: actor })) throw new NotFoundError('CallCampaign', id);
      throw new ConflictError('Campaign cannot be cancelled');
    }
    // Stop pending work. Calls already connected are allowed to finish politely
    // and are reconciled normally (cutting a live conversation mid-sentence is worse).
    await CampaignRecipient.updateMany(
      { campaignId: id, state: { $in: ['draft', 'queued', 'retry_scheduled'] } },
      { $set: { state: 'cancelled', leaseUntil: null } },
    );
    await refreshCampaignSummary(id);
    auditService.logEvent({ eventType: 'ai_calling.campaign.cancelled', userId: actor, ipAddress: meta.ipAddress || 'internal', result: 'success', module: 'ai-calling', details: { campaignId: id } });
    return this.getCampaign(id, actor);
  }

  async listRecipients(campaignId, actor, { page = 1, limit = 50, state } = {}) {
    await this.getCampaign(campaignId, actor);
    const filter = { campaignId };
    if (state) filter.state = state;
    const [data, total] = await Promise.all([
      CampaignRecipient.find(filter).sort({ createdAt: 1, _id: 1 }).skip((page - 1) * limit).limit(limit)
        .populate('leadId', 'leadNumber name phone mobile address status').lean(),
      CampaignRecipient.countDocuments(filter),
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // ----------------------------------------------------------- queue / tick
  /**
   * Enqueue the next tick for a campaign. Each enqueue mints a fresh tickToken,
   * which supersedes every older pending tick: duplicate chains (double start,
   * resume racing a delayed tick, the watchdog) collapse to exactly one.
   */
  async _scheduleTick(campaignId, delay = 0) {
    const token = crypto.randomBytes(8).toString('hex');
    await CallCampaign.updateOne({ _id: campaignId }, { $set: { tickToken: token, nextTickAt: new Date(Date.now() + delay) } });
    await queueManager.addJob(OUTBOUND_CALL_QUEUE, `tick-${campaignId}`, { campaignId: String(campaignId), kind: 'tick', token }, {
      jobId: `tick-${campaignId}-${token}`, delay, attempts: 1,
    });
    return token;
  }

  /**
   * Lease and dispatch due recipients for a campaign, honouring concurrency,
   * call windows and daily caps. Re-enqueues itself while work remains. Safe
   * across restarts: all state lives in Mongo, a stale token exits, and a lease
   * prevents two ticks of one campaign from overlapping.
   */
  async tickCampaign(campaignId, token = null) {
    const now = new Date();
    const tokenFilter = token ? { tickToken: token } : { tickToken: null };
    const campaign = await CallCampaign.findOneAndUpdate(
      { _id: campaignId, ...tokenFilter, $or: [{ tickLeaseUntil: null }, { tickLeaseUntil: { $lt: now } }] },
      { $set: { tickLeaseUntil: new Date(now.getTime() + TICK_LEASE_MS), lastTickAt: now } },
      { returnDocument: 'after' },
    );
    if (!campaign) {
      if (!await CallCampaign.exists({ _id: campaignId })) return { stopped: true };
      return { superseded: true };
    }
    try {
      return await this._runTick(campaign);
    } finally {
      await CallCampaign.updateOne({ _id: campaignId, tickLeaseUntil: { $ne: null } }, { $set: { tickLeaseUntil: null } });
    }
  }

  async _runTick(campaign) {
    const campaignId = campaign._id;
    if (['paused', 'cancelled', 'completed', 'draft', 'failed'].includes(campaign.status)) return { stopped: true, status: campaign.status };
    if (campaign.status === 'scheduled' && campaign.scheduledAt && campaign.scheduledAt > new Date()) {
      await this._scheduleTick(campaignId, campaign.scheduledAt.getTime() - Date.now());
      return { rescheduled: true };
    }
    if (campaign.status !== 'running') {
      await CallCampaign.updateOne({ _id: campaignId, status: campaign.status }, { $set: { status: 'running', startedAt: campaign.startedAt || new Date() } });
    }

    const schedule = campaign.schedule || {};
    // Spend cap: stop dialling once the recorded/estimated cost reaches it.
    if (schedule.maxCampaignSpend > 0 && (campaign.summary?.actualCost || 0) >= schedule.maxCampaignSpend) {
      await CallCampaign.updateOne({ _id: campaignId, status: 'running' }, { $set: { status: 'paused', pausedAt: new Date() } });
      recordCallMetric('campaign', 'spend_cap_paused');
      notificationService.create({
        channels: ['IN_APP'], recipientIds: [campaign.createdBy], type: 'ai_calling.spend_cap', category: 'CRM', priority: 'HIGH',
        payload: { title: `AI campaign paused: spend cap reached (${campaign.name})`, message: 'Raise the cap or resume deliberately to continue.', campaignId: String(campaignId) },
        sourceModule: 'ai-calling', sourceEvent: 'SPEND_CAP', sourceEntityType: 'CallCampaign', sourceEntityId: campaignId,
        idempotencyKey: `ai-call-spend-cap-${campaignId}-${Math.floor(schedule.maxCampaignSpend)}`,
      }, campaign.createdBy).catch(() => {});
      return { stopped: true, reason: 'spend_cap' };
    }
    const win = windowState(schedule);
    if (!win.open) {
      await this._scheduleTick(campaignId, win.delayMs);
      return { outsideWindow: true, retryInMs: win.delayMs };
    }

    // Recover recipients whose dispatch lease expired (crashed worker) — safely.
    await this._recoverExpiredDispatches({ campaignId });

    const inFlight = await CampaignRecipient.countDocuments({ campaignId, state: { $in: ['dialing', 'in_progress', 'processing'] } });
    const concurrency = Math.max(1, schedule.maxConcurrency || 1);
    let slots = concurrency - inFlight;
    if (slots <= 0) {
      await this._scheduleTick(campaignId, 15_000);
      return { busy: true, inFlight };
    }

    // Daily cap (campaign-local calendar day).
    const todayCalls = await CallRecord.countDocuments({ campaignId, ...NOT_WEB_TEST, initiatedAt: { $gte: startOfLocalDay(schedule.timezone) } });
    if (schedule.maxCallsPerDay && todayCalls >= schedule.maxCallsPerDay) {
      await this._scheduleTick(campaignId, 30 * 60_000);
      return { dailyCapReached: true };
    }
    slots = Math.min(slots, (schedule.maxCallsPerDay || Infinity) - todayCalls);

    let dispatched = 0;
    for (let i = 0; i < slots; i += 1) {
      // Pause/cancel must take effect before the NEXT dial, not the next tick.
      const fresh = await CallCampaign.findById(campaignId).select('status').lean();
      if (fresh?.status !== 'running') break;
      const recipient = await this._claimNextRecipient(campaignId);
      if (!recipient) break;
      try {
        const result = await this._dispatchCall(campaign, recipient);
        // "dispatched" = provider requests made (accepted, rejected or ambiguous).
        if (result && ('dialled' in result)) dispatched += 1;
      } catch (error) {
        logger.error('Call dispatch failed', { module: 'ai-calling', campaignId: String(campaignId), recipientId: String(recipient._id), error: error.message });
        // Only an attempt that provably never reached the provider may be requeued.
        await this._recoverExpiredDispatches({ campaignId, recipientId: recipient._id, force: true });
      }
    }

    const remaining = await CampaignRecipient.countDocuments({
      campaignId, state: { $in: ['queued', 'retry_scheduled', 'dialing', 'in_progress', 'processing'] },
    });
    if (remaining > 0) {
      await this._scheduleTick(campaignId, dispatched > 0 ? 10_000 : 20_000);
    } else {
      await refreshCampaignSummary(campaignId);
    }
    return { dispatched, remaining };
  }

  /** Atomically claim one due recipient (queued and not deferred, or retry due) with a lease. */
  async _claimNextRecipient(campaignId) {
    const now = new Date();
    return CampaignRecipient.findOneAndUpdate(
      {
        campaignId,
        'eligibility.eligible': true,
        $or: [
          { state: 'queued', $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }] },
          { state: 'retry_scheduled', nextAttemptAt: { $lte: now } },
        ],
      },
      { $set: { state: 'dialing', leaseUntil: new Date(now.getTime() + DISPATCH_LEASE_MS) } },
      { sort: { nextAttemptAt: 1, createdAt: 1 }, returnDocument: 'after' },
    );
  }

  /** Return a claimed recipient to the queue WITHOUT consuming an attempt. */
  async _releaseClaim(recipientId, { deferMs = 0, state = 'queued' } = {}) {
    await CampaignRecipient.updateOne({ _id: recipientId, state: 'dialing' }, { $set: {
      state, leaseUntil: null, nextAttemptAt: deferMs ? new Date(Date.now() + deferMs) : null,
    } });
  }

  async _dispatchCall(campaign, recipient) {
    // --- Pre-dial gates, re-checked for EVERY call, immediately before dialling.
    const fresh = await CallCampaign.findById(campaign._id).select('status').lean();
    if (fresh?.status !== 'running') {
      await this._releaseClaim(recipient._id, { state: fresh?.status === 'cancelled' ? 'cancelled' : 'queued' });
      return { skipped: 'campaign_not_running' };
    }
    const lead = await Lead.findById(recipient.leadId).select('_id status isDeleted').lean();
    if (!lead || lead.isDeleted) {
      await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { state: 'ineligible', leaseUntil: null, 'eligibility.eligible': false, 'eligibility.reasons': ['lead_unavailable'] } });
      await refreshCampaignSummary(campaign._id);
      return { skipped: 'lead_unavailable' };
    }
    const local = recipientWindow(recipient.country);
    if (!local.open) {
      await this._releaseClaim(recipient._id, { deferMs: local.delayMs });
      recordCallMetric('dispatch', 'deferred_recipient_hours');
      return { deferred: 'recipient_quiet_hours' };
    }
    if (recipient.phoneHash && await CallSuppression.exists({ phoneHash: recipient.phoneHash })) {
      await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { state: 'suppressed', leaseUntil: null, 'eligibility.eligible': false, 'eligibility.reasons': ['suppressed'] } });
      await refreshCampaignSummary(campaign._id);
      recordCallMetric('dispatch', 'suppressed');
      return { suppressed: true };
    }
    if (callConsentRequired()) {
      const latest = await latestConsentByLead(recipient.phoneHash ? [recipient.phoneHash] : []);
      const status = consentStatus(latest.get(`${recipient.leadId}:${recipient.phoneHash}`));
      if (status !== 'granted') {
        await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: {
          state: 'suppressed', leaseUntil: null, 'eligibility.eligible': false,
          'eligibility.reasons': [status === 'revoked' ? 'consent_revoked' : (status === 'expired' ? 'consent_expired' : 'consent_required')],
        } });
        await refreshCampaignSummary(campaign._id);
        recordCallMetric('dispatch', 'consent_blocked');
        return { suppressed: true, reason: 'consent_required' };
      }
    }

    // A worker that can't reach the CRM would leave the lead on a silent line.
    const misconfig = agentApiMisconfiguration();
    if (misconfig) {
      await this._releaseClaim(recipient._id);
      await CallCampaign.updateOne({ _id: campaign._id, status: 'running' }, { $set: { status: 'paused', pausedAt: new Date() } });
      logger.error('AI calling misconfigured; campaign paused', { module: 'ai-calling', campaignId: String(campaign._id), reason: misconfig });
      recordCallMetric('campaign', 'misconfigured_paused');
      return { skipped: 'misconfigured', reason: misconfig };
    }

    // --- Attempt bookkeeping. The recipient is pointed at the new call id BEFORE
    // the record exists, so a crash at any step is recoverable unambiguously
    // (see _recoverExpiredDispatches).
    const attemptNumber = recipient.attemptCount + 1;
    const callObjectId = new mongoose.Types.ObjectId();
    const internalCallId = `call_${recipient._id}_${attemptNumber}_${crypto.randomBytes(4).toString('hex')}`;
    const roomName = `crm-call-${internalCallId}`;
    const pointed = await CampaignRecipient.updateOne(
      { _id: recipient._id, state: 'dialing', attemptCount: recipient.attemptCount },
      { $inc: { attemptCount: 1 }, $set: { lastCallId: callObjectId, leaseUntil: new Date(Date.now() + DISPATCH_LEASE_MS) } },
    );
    if (!pointed.modifiedCount) return { skipped: 'claim_lost' };

    await CallRecord.create({
      _id: callObjectId,
      campaignId: campaign._id,
      recipientId: recipient._id,
      leadId: recipient.leadId,
      internalCallId,
      attemptNumber,
      isTest: campaign.isTest,
      provider: 'livekit_sip',
      roomName,
      state: 'initiating',
      queuedAt: new Date(),
      initiatedAt: new Date(),
      conversationState: engine.initConversationState(),
      createdBy: recipient.createdBy,
    });

    const apiBase = process.env.PUBLIC_API_BASE_URL || `http://localhost:${process.env.PORT || 9097}`;
    const metadata = {
      campaignId: String(campaign._id),
      callId: internalCallId,
      mode: 'pstn',
      agentToolApi: `${apiBase}/api/v1/ai-calling/agent`,
      agentToken: issueAgentToken(internalCallId, campaign.agentConfig?.maxCallSeconds ? campaign.agentConfig.maxCallSeconds + 600 : 1800),
      voice: campaign.agentConfig?.voice,
      language: campaign.agentConfig?.language,
    };
    // Point of no return: from here on a crash leaves an AMBIGUOUS attempt.
    await CallRecord.updateOne({ _id: callObjectId }, { $set: { dispatchStartedAt: new Date() } });
    const dispatchStarted = Date.now();
    const routed = await routeOutboundCall({
      to: recipient.phoneSnapshot, country: recipient.country, roomName, internalCallId, metadata,
    });
    observeDispatchLatency(Date.now() - dispatchStarted);
    const { result } = routed;
    recordCallMetric('dispatch', result.outcome);
    await CallProviderAttempt.insertMany(routed.attempts.map((attempt, index) => ({
      callId: callObjectId, campaignId: campaign._id, recipientId: recipient._id,
      attemptIndex: index + 1, provider: attempt.provider, outcome: attempt.outcome,
      providerCallId: attempt.providerCallId || null, errorCode: attempt.errorCode || null,
      errorMessage: attempt.errorMessage || null, responseStatus: attempt.responseStatus || null,
      fallbackReason: index > 0 ? (result.fallbackReason || null) : null,
      createdBy: recipient.createdBy,
    })), { ordered: true });

    if (result.outcome === 'accepted') {
      await CallRecord.updateOne({ _id: callObjectId, state: 'initiating' }, { $set: {
        state: 'ringing', provider: result.provider, providerCallId: result.providerCallId,
        fallbackFrom: result.fallbackFrom || null, fallbackReason: result.fallbackReason || null,
      } });
      // The live call now owns the recipient; no lease (the reconciler watches the call).
      await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { leaseUntil: null } });
      emitToOwner(campaign.createdBy, 'ai-calling:call', { campaignId: String(campaign._id), callId: internalCallId, state: 'ringing' });
      return { dialled: true, accepted: true, callId: internalCallId };
    }
    if (result.outcome === 'ambiguous') {
      await this._markAmbiguous(callObjectId, recipient._id, campaign, result.errorCode, result.errorMessage);
      return { dialled: true, ambiguous: true };
    }
    // Rejected. A permanent rejection (bad number, not configured, policy) is
    // terminal — retrying it only wastes attempts. A transient one may retry.
    await CallRecord.updateOne({ _id: callObjectId }, { $set: {
      state: 'failed', disposition: 'failed', failureCode: result.errorCode, failureMessage: result.errorMessage,
      endedAt: new Date(), resultsProcessedAt: new Date(),
    } });
    const updated = await CampaignRecipient.findById(recipient._id);
    if (result.safeToRetry === false) {
      await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { state: 'failed', leaseUntil: null, finalDisposition: 'failed' } });
    } else {
      await this._scheduleRetryOrFail(campaign, updated, 'failed');
    }
    await refreshCampaignSummary(campaign._id);
    return { dialled: false, rejected: true, reason: result.errorMessage };
  }

  /**
   * An attempt whose provider outcome is unknown. It may already have rung the
   * lead, so it is NEVER retried automatically: the recipient is parked as
   * failed/needs_reconcile and the owner is told; only a human retry re-dials.
   */
  async _markAmbiguous(callId, recipientId, campaign, code, message) {
    await CallRecord.updateOne({ _id: callId, resultsProcessedAt: null }, { $set: {
      state: 'needs_reconcile', failureCode: code || 'AMBIGUOUS_DISPATCH', failureMessage: message || 'Ambiguous dispatch outcome',
      'reconciliation.needed': true, 'reconciliation.note': 'Ambiguous dispatch outcome — not retried automatically',
    } });
    await CampaignRecipient.updateOne({ _id: recipientId }, { $set: { state: 'failed', leaseUntil: null, finalDisposition: 'needs_reconcile' } });
    await refreshCampaignSummary(campaign._id);
    recordCallMetric('reconcile', 'ambiguous_parked');
    notificationService.create({
      channels: ['IN_APP'], recipientIds: [campaign.createdBy], type: 'ai_calling.needs_reconcile', category: 'CRM', priority: 'HIGH',
      payload: {
        title: 'AI call outcome unknown',
        message: 'A call request may or may not have reached the lead. It was not retried automatically; review and retry manually if appropriate.',
        campaignId: String(campaign._id), callId: String(callId),
      },
      sourceModule: 'ai-calling', sourceEvent: 'NEEDS_RECONCILE', sourceEntityType: 'CallRecord', sourceEntityId: callId,
      idempotencyKey: `ai-call-reconcile-${callId}`,
    }, campaign.createdBy).catch((e) => logger.warn('reconcile notification failed', { module: 'ai-calling', error: e.message }));
  }

  /**
   * Recover recipients stuck in `dialing` after their dispatch lease expired
   * (worker crash / dispatch exception). Decides from durable evidence only:
   *   - no call record, or record never sent to the provider → requeue, attempt refunded;
   *   - record sent but outcome never persisted → AMBIGUOUS, parked (never redialled);
   *   - live call → leave it to the call lifecycle (lease cleared);
   *   - pointer still names the previous, processed attempt → requeue.
   */
  async _recoverExpiredDispatches({ campaignId = null, recipientId = null, force = false, limit = 100 } = {}) {
    const filter = { state: 'dialing' };
    if (campaignId) filter.campaignId = campaignId;
    if (recipientId) filter._id = recipientId;
    if (!force) filter.leaseUntil = { $lt: new Date() };
    const stuck = await CampaignRecipient.find(filter).limit(limit);
    let recovered = 0;
    for (const r of stuck) {
      const call = r.lastCallId ? await CallRecord.findById(r.lastCallId) : null;
      const pointsAtThisAttempt = call && call.attemptNumber === r.attemptCount;
      if (!call || !pointsAtThisAttempt) {
        // Crash between the recipient pointer write and the call insert (the
        // pointer names a record that doesn't exist): refund that attempt.
        const refund = r.lastCallId && !call ? -1 : 0;
        await CampaignRecipient.updateOne({ _id: r._id, state: 'dialing' }, { $set: { state: 'queued', leaseUntil: null }, $inc: { attemptCount: refund } });
        recovered += 1;
        continue;
      }
      if (call.state === 'initiating' && !call.dispatchStartedAt) {
        await CallRecord.updateOne({ _id: call._id }, { $set: { state: 'cancelled', failureCode: 'NOT_DISPATCHED', failureMessage: 'Dispatch never started (recovered)', resultsProcessedAt: new Date(), endedAt: new Date() } });
        await CampaignRecipient.updateOne({ _id: r._id, state: 'dialing' }, { $set: { state: 'queued', leaseUntil: null }, $inc: { attemptCount: -1 } });
        recovered += 1;
        continue;
      }
      if (call.state === 'initiating') {
        const campaign = await CallCampaign.findById(r.campaignId).lean();
        if (campaign) await this._markAmbiguous(call._id, r._id, campaign, 'DISPATCH_INTERRUPTED', 'Dispatch was interrupted before the provider outcome was recorded');
        recovered += 1;
        continue;
      }
      if (call.resultsProcessedAt) {
        // processCallResults finalizes the recipient BEFORE stamping the call, so
        // a processed call under a still-dialing recipient is the PREVIOUS attempt:
        // the new claim crashed before its pointer write. Nothing was dialled.
        await CampaignRecipient.updateOne({ _id: r._id, state: 'dialing' }, { $set: { state: 'queued', leaseUntil: null } });
        recovered += 1;
        continue;
      }
      // Live call (ringing / in progress): it owns the recipient now.
      await CampaignRecipient.updateOne({ _id: r._id }, { $set: { leaseUntil: null } });
    }
    return recovered;
  }

  /** Recipient terminal/retry state derived from a processed call (idempotent). */
  async _finalizeRecipient(campaign, recipient, call) {
    // A late result for an OLDER attempt must not overwrite a newer attempt's state.
    if (String(recipient.lastCallId) !== String(call._id)) return;
    if (['no_answer', 'busy', 'voicemail', 'failed'].includes(call.disposition)) {
      await this._scheduleRetryOrFail(campaign, recipient, call.disposition);
    } else {
      await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: {
        state: 'completed', leaseUntil: null, finalDisposition: call.disposition, qualification: call.qualification,
      } });
    }
  }

  async _scheduleRetryOrFail(campaign, recipient, disposition) {
    const schedule = campaign.schedule || {};
    const retryable = ['no_answer', 'busy', 'failed', 'voicemail'].includes(disposition);
    const attempts = recipient.attemptCount; // already incremented
    if (retryable && attempts < (schedule.maxAttemptsPerLead || 2)) {
      const nextAttemptAt = new Date(Date.now() + retryDelayMs(schedule, attempts));
      await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { state: 'retry_scheduled', nextAttemptAt, leaseUntil: null, finalDisposition: disposition } });
    } else {
      const terminal = retryable ? 'exhausted' : 'failed';
      await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { state: terminal, leaseUntil: null, finalDisposition: disposition } });
    }
  }

  // ------------------------------------------------- agent tool API (live call)
  async _loadCallForAgent(internalCallId, { mutable = false } = {}) {
    const call = await CallRecord.findOne({ internalCallId });
    if (!call) throw new NotFoundError('CallRecord', internalCallId);
    // Once a call is processed its answers are evidence; a late or replayed tool
    // call from the worker must not rewrite them.
    if (mutable && (call.resultsProcessedAt || TERMINAL_CALL_STATES.has(call.state))) {
      throw new ConflictError('This call has already ended');
    }
    const campaign = await CallCampaign.findById(call.campaignId).lean();
    if (!campaign) throw new NotFoundError('CallCampaign', call.campaignId);
    return { call, campaign };
  }

  /**
   * Read-modify-write of conversationState with optimistic concurrency. The
   * realtime model may run tools in parallel; without the version check two
   * concurrent answers would each overwrite the other's state.
   */
  async _mutateConversation(internalCallId, mutate) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { call, campaign } = await this._loadCallForAgent(internalCallId, { mutable: true });
      const version = call.stateVersion || 0;
      const { state, extra = {} } = mutate(engine.normalizeState(call.conversationState), campaign, call);
      const written = await CallRecord.updateOne(
        { _id: call._id, resultsProcessedAt: null, stateVersion: version || { $in: [0, null] } },
        { $set: { conversationState: state, ...extra }, $inc: { stateVersion: 1 } },
      );
      if (written.modifiedCount === 1) return { call, campaign, state };
    }
    throw new ConflictError('Call state changed concurrently; retry the tool call');
  }

  /** Context + first action for the agent. Read-only for phone calls: joining the room is not an answer. */
  async getCallContext(internalCallId) {
    const { call, campaign } = await this._loadCallForAgent(internalCallId);
    const lead = await Lead.findById(call.leadId).select('name website address providerMeta sourceMetadata notes').lean();
    // Browser tests have a human in the room as soon as the agent joins. Phone
    // calls are marked answered only via /answered (SIP status "active") or the
    // provider webhook.
    if (call.provider === 'livekit_web') await this.agentAnswered(internalCallId).catch(() => {});
    const state = call.conversationState || engine.initConversationState();
    return {
      callId: internalCallId,
      agentConfig: campaign.agentConfig,
      disclosure: disclosureText(campaign.agentConfig || {}),
      systemPrompt: buildSystemPrompt({
        agentConfig: campaign.agentConfig, lead, objective: campaign.agentConfig?.objective,
        questions: [...(campaign.questionnaire?.questions || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      }),
      leadContext: leadContext(lead),
      ...(campaign.agentConfig?.shareLeadNotes && lead?.notes ? { leadNotes: String(lead.notes).slice(0, 1000) } : {}),
      nextAction: this._serializeAction(engine.nextAction(campaign.questionnaire, state)),
    };
  }

  /** The callee actually picked up (worker observed SIP callStatus=active). Idempotent. */
  async agentAnswered(internalCallId, at = new Date()) {
    const call = await CallRecord.findOneAndUpdate(
      { internalCallId, state: { $in: ['ringing', 'initiating'] }, resultsProcessedAt: null },
      { $set: { state: 'in_progress', answeredAt: at } },
      { returnDocument: 'after' },
    );
    if (!call) return { acknowledged: true, changed: false };
    if (call.provider !== 'livekit_web') {
      await CampaignRecipient.updateOne({ _id: call.recipientId, lastCallId: call._id }, { $set: { state: 'in_progress' } });
    }
    recordCallMetric('answered', call.provider);
    emitToOwner(call.createdBy, 'ai-calling:call', { campaignId: String(call.campaignId), callId: internalCallId, state: 'in_progress' });
    return { acknowledged: true, changed: true };
  }

  _serializeAction(action) {
    if (!action.question) return { type: action.type, reason: action.reason || null };
    const q = action.question;
    return {
      type: action.type,
      question: {
        fieldKey: q.fieldKey, text: q.text, label: q.label, type: q.type,
        options: q.options || [], required: q.required, description: q.description || '',
      },
    };
  }

  /** Agent acknowledges it has delivered the AI disclosure and the person agreed to continue. */
  async agentDisclose(internalCallId) {
    const { campaign, state } = await this._mutateConversation(internalCallId, (s) => ({ state: engine.markDisclosed(s) }));
    return { nextAction: this._serializeAction(engine.nextAction(campaign.questionnaire, state)) };
  }

  /** The constrained record_answer tool. Validation happens server-side; the model's value is untrusted. */
  async agentRecordAnswer(internalCallId, { fieldKey, rawAnswer }) {
    let validation = null;
    const { campaign, state } = await this._mutateConversation(internalCallId, (s, c) => {
      const question = (c.questionnaire.questions || []).find((q) => q.fieldKey === fieldKey);
      if (!question) throw new ValidationError(`Unknown question: ${fieldKey}`);
      if (!s.disclosed) throw new ConflictError('Deliver the AI disclosure (disclose tool) before recording answers');
      const result = validateAnswer(question, rawAnswer);
      validation = result.validation;
      return { state: engine.applyAnswer(s, fieldKey, { ...result, rawAnswer }) };
    });
    emitToOwner(campaign.createdBy, 'ai-calling:answer', { campaignId: String(campaign._id), callId: internalCallId, fieldKey, validation });
    return { accepted: true, validation, nextAction: this._serializeAction(engine.nextAction(campaign.questionnaire, state)) };
  }

  async agentMarkUnknown(internalCallId, { fieldKey }) {
    return this.agentRecordAnswer(internalCallId, { fieldKey, rawAnswer: '' });
  }

  async agentConfirm(internalCallId, { fieldKey }) {
    const { campaign, state } = await this._mutateConversation(internalCallId, (s) => ({ state: engine.markConfirmed(s, fieldKey) }));
    return { nextAction: this._serializeAction(engine.nextAction(campaign.questionnaire, state)) };
  }

  async agentRequestCallback(internalCallId, { when, note }) {
    await this._mutateConversation(internalCallId, (s) => ({
      state: { ...engine.endConversation(s, 'callback_requested'), control: { callbackRequestedAt: when || null, callbackText: note || null } },
    }));
    return { acknowledged: true, nextAction: { type: 'end', reason: 'callback_requested' } };
  }

  async agentDoNotContact(internalCallId) {
    await this._mutateConversation(internalCallId, (s) => ({ state: engine.endConversation(s, 'do_not_contact') }));
    return { acknowledged: true, nextAction: { type: 'end', reason: 'do_not_contact' } };
  }

  async agentDecline(internalCallId) {
    await this._mutateConversation(internalCallId, (s) => ({ state: engine.endConversation(s, 'declined') }));
    return { acknowledged: true, nextAction: { type: 'end', reason: 'declined' } };
  }

  /**
   * The agent (or the worker's disconnect handler) signals the call is over.
   * Triggers idempotent post-call processing. The worker may only report
   * telephony-level outcomes (voicemail/no_answer/busy/failed); a business
   * outcome is always derived server-side from the validated answers.
   */
  async agentEndCall(internalCallId, { disposition = null, durationSeconds = null, transcriptRef = null, cost = null } = {}) {
    const { call } = await this._loadCallForAgent(internalCallId);
    return this.processCallResults(call._id, { disposition, durationSeconds, transcriptRef, cost, source: 'agent_end' });
  }

  // ------------------------------------------------- post-call processing
  /**
   * Idempotent and concurrency-safe. Exactly one finisher (agent end, provider
   * webhook, reconciler) wins an atomic claim; it persists the structured
   * answers, evaluates status rules, applies at most one validated lead-status
   * transition, creates callbacks/suppression, updates recipient retry state and
   * the campaign summary, and only THEN stamps resultsProcessedAt. A crash in
   * between leaves an expired claim that the reconciler re-runs (every step is
   * idempotent).
   */
  async processCallResults(callId, { disposition = null, durationSeconds = null, transcriptRef = null, recordingRef = null, cost = null, source = 'system' } = {}) {
    const now = new Date();
    const call = await CallRecord.findOneAndUpdate(
      { _id: callId, resultsProcessedAt: null, $or: [{ processingLeaseUntil: null }, { processingLeaseUntil: { $lt: now } }] },
      { $set: { processingLeaseUntil: new Date(now.getTime() + PROCESSING_LEASE_MS) } },
      { returnDocument: 'after' },
    );
    if (!call) {
      const existing = await CallRecord.findById(callId).select('internalCallId').lean();
      if (!existing) throw new NotFoundError('CallRecord', callId);
      return { duplicate: true, callId: existing.internalCallId };
    }

    const campaign = await CallCampaign.findById(call.campaignId);
    const recipient = await CampaignRecipient.findById(call.recipientId);
    const state = engine.normalizeState(call.conversationState);
    const control = state.control || {};
    const prog = engine.progress(campaign.questionnaire, state);

    // A re-run after a crash reuses the disposition persisted by the first run.
    let finalDisposition = call.disposition || sanitizeReportedDisposition(disposition, call);
    if (!finalDisposition) {
      if (state.endedReason === 'do_not_contact') finalDisposition = 'do_not_contact';
      else if (state.endedReason === 'callback_requested') finalDisposition = 'callback_requested';
      else if (state.endedReason === 'declined') finalDisposition = 'declined';
      else if (prog.unresolvedRequired.length === 0 && prog.total > 0 && prog.answered > 0) finalDisposition = 'answered_completed';
      else if (prog.answered > 0) finalDisposition = 'answered_partial';
      // Reached a human who heard the disclosure, then hung up: they were reached
      // (don't redial as if unanswered), but nothing qualifies → review.
      else if (state.disclosed) finalDisposition = 'answered_partial';
      else finalDisposition = 'no_answer';
    }

    const answerDocs = [];
    const validValues = {};
    for (const q of campaign.questionnaire.questions || []) {
      const entry = state.answers?.[q.fieldKey];
      if (!entry) continue;
      answerDocs.push({
        questionFieldKey: q.fieldKey, questionnaireVersion: campaign.questionnaireVersion,
        label: q.label, type: q.type, rawAnswer: entry.rawAnswer || '', normalizedValue: entry.normalizedValue,
        mapTo: q.mapTo || null, validation: entry.validation, confirmed: entry.confirmed || false,
        clarifications: entry.clarifications || 0, source: 'agent_tool',
        reviewStatus: entry.validation === 'valid' ? 'none' : 'pending',
      });
      if (entry.validation === 'valid') validValues[q.fieldKey] = entry.normalizedValue;
    }

    const outcome = evaluateOutcome({
      statusRules: campaign.statusRules, answers: validValues, disposition: finalDisposition,
      hasUnresolvedRequired: prog.unresolvedRequired.length > 0, control,
    });

    const reached = ['answered_completed', 'answered_partial', 'declined', 'callback_requested', 'do_not_contact'].includes(finalDisposition);
    const callState = reached ? 'completed'
      : (['no_answer', 'busy', 'voicemail'].includes(finalDisposition) ? finalDisposition : 'failed');

    // 1. Persist the call record (authoritative, retained even if later steps fail).
    const endedAt = call.endedAt || now;
    const measured = call.answeredAt ? Math.max(0, Math.round((endedAt - call.answeredAt) / 1000)) : 0;
    call.state = callState;
    call.disposition = finalDisposition;
    call.qualification = outcome.qualification;
    call.answers = answerDocs;
    call.reviewRequired = outcome.requiresReview;
    call.durationSeconds = durationSeconds != null ? durationSeconds : (call.durationSeconds || measured);
    if (transcriptRef) call.transcriptRef = transcriptRef;
    if (recordingRef) call.recordingRef = recordingRef;
    call.cost = estimateCallCost(call, cost);
    call.endedAt = endedAt;
    await call.save();

    // 2. CRM side-effects only for real campaign calls (never browser/test calls).
    if (!campaign.isTest && call.provider !== 'livekit_web') {
      await this._applyOutcomeToLead({ call, campaign, recipient, outcome, disposition: finalDisposition });
    }

    // 3. Recipient terminal state / retry (web tests never touch the recipient).
    if (recipient && call.provider !== 'livekit_web') await this._finalizeRecipient(campaign, recipient, call);

    // 4. Stamp processed — from here every other finisher is a no-op.
    await CallRecord.updateOne({ _id: call._id }, { $set: { resultsProcessedAt: new Date(), processingLeaseUntil: null } });

    // 5. Hang up: deleting the room ends the SIP leg (otherwise the agent leaving
    // would leave the callee on a silent open line). Best-effort and harmless if
    // the room is already gone.
    if (call.roomName && typeof livekit.endCall === 'function') {
      livekit.endCall({ roomName: call.roomName }).catch(() => {});
    }

    await refreshCampaignSummary(call.campaignId);
    recordCallMetric('call_finished', finalDisposition);
    if (reached) observeDuration(call.durationSeconds);
    logger.info('AI call processed', {
      module: 'ai-calling', callId: call.internalCallId, campaignId: String(campaign._id),
      disposition: finalDisposition, qualification: outcome.qualification, source,
    });
    emitToOwner(campaign.createdBy, 'ai-calling:call', { campaignId: String(campaign._id), callId: call.internalCallId, state: callState, disposition: finalDisposition, qualification: outcome.qualification });
    return { processed: true, callId: call.internalCallId, disposition: finalDisposition, qualification: outcome.qualification, action: outcome.action };
  }

  /**
   * Map a rule-engine outcome to a validated lead transition + side-effects.
   * The status write is compare-and-set against the status read here, so a
   * human edit made meanwhile is never overwritten; a lead a human moved after
   * the call was placed is left alone (manual override wins). Idempotent so a
   * crashed processing run can be safely repeated.
   */
  async _applyOutcomeToLead({ call, campaign, recipient, outcome, disposition, actorType = 'system', actorId = null }) {
    const lead = await Lead.findById(call.leadId).select('_id name status assignedTo').lean();
    if (!lead) return { applied: false };

    const set = {};
    if (['answered_completed', 'answered_partial', 'declined', 'callback_requested', 'do_not_contact'].includes(disposition)) {
      set.lastContactedAt = call.endedAt || new Date();
      set.lastContactChannel = 'phone';
    }

    const targetStatus = ACTION_TO_LEAD_STATUS[outcome.action] ?? null;
    const previousStatus = lead.status;
    let newStatus = previousStatus;
    const allowed = targetStatus
      && !PROTECTED_LEAD_STATUSES.has(previousStatus)
      && Object.values(LEAD_STATUS).includes(targetStatus)
      && (!outcome.requiresReview || actorType === 'user');
    // Never weaken a stronger state automatically (qualified → contacted).
    const weakening = previousStatus === LEAD_STATUS.QUALIFIED && targetStatus === LEAD_STATUS.CONTACTED;
    const manualOverride = actorType === 'system' && await this._statusChangedByHumanSince(lead._id, call.initiatedAt || call.createdAt);
    if (allowed && targetStatus !== previousStatus && !weakening && !manualOverride) newStatus = targetStatus;

    if (newStatus !== previousStatus) set.status = newStatus;
    if (Object.keys(set).length) {
      const written = await Lead.updateOne({ _id: lead._id, status: previousStatus }, { $set: set });
      if (!written.matchedCount) {
        // Status changed under us (a human edit): keep theirs, still record contact.
        newStatus = previousStatus;
        delete set.status;
        if (Object.keys(set).length) await Lead.updateOne({ _id: lead._id }, { $set: set });
      }
    }

    if (newStatus !== previousStatus) {
      const exists = await LeadCallTransition.exists({ callId: call._id, actorType, newStatus });
      if (!exists) {
        await LeadCallTransition.create({
          leadId: lead._id, campaignId: campaign._id, callId: call._id,
          previousStatus, newStatus, qualification: outcome.qualification,
          ruleId: outcome.ruleId, reason: outcome.reason, actorType, actorId, createdBy: campaign.createdBy,
        });
      }
    }

    // Do-not-contact: suppress globally + revoke consent; never dial again anywhere.
    if (outcome.action === 'mark_do_not_contact' && recipient?.phoneHash) {
      await CallSuppression.updateOne(
        { phoneHash: recipient.phoneHash },
        { $setOnInsert: { leadId: lead._id, reason: 'do_not_contact', source: 'call_request', suppressedAt: new Date() } },
        { upsert: true },
      );
      await CallConsent.updateOne(
        { createdBy: campaign.createdBy, leadId: lead._id, phoneHash: recipient.phoneHash },
        {
          $set: { status: 'revoked', revokedAt: new Date(), changedBy: actorId || campaign.createdBy },
          $setOnInsert: {
            evidence: 'Recipient requested do not contact during call', source: 'call_request',
            capturedAt: new Date(), createdBy: campaign.createdBy, leadId: lead._id, phoneHash: recipient.phoneHash,
          },
        },
        { upsert: true },
      );
      await CampaignRecipient.updateMany(
        { phoneHash: recipient.phoneHash, state: { $in: ['draft', 'queued', 'retry_scheduled'] } },
        { $set: { state: 'suppressed', 'eligibility.eligible': false, 'eligibility.reasons': ['suppressed'] } },
      );
    }

    if (outcome.action === 'schedule_callback') {
      await notificationService.create({
        channels: ['IN_APP'],
        recipientIds: [lead.assignedTo || campaign.createdBy],
        type: 'ai_calling.callback_requested',
        category: 'CRM',
        priority: 'HIGH',
        payload: {
          title: `Callback requested: ${lead.name}`,
          message: outcome.callback?.note ? `Requested time: ${outcome.callback.requestedAt || 'unspecified'} — ${outcome.callback.note}` : 'A lead requested a callback during an AI call.',
          leadId: String(lead._id), campaignId: String(campaign._id), callId: String(call._id),
        },
        sourceModule: 'ai-calling', sourceEvent: 'CALLBACK_REQUESTED', sourceEntityType: 'CallRecord', sourceEntityId: call._id,
        idempotencyKey: `ai-call-callback-${call._id}`,
      }, campaign.createdBy).catch((e) => logger.warn('callback notification failed', { module: 'ai-calling', error: e.message }));
    }

    if (outcome.requiresReview && actorType === 'system') {
      await notificationService.create({
        channels: ['IN_APP'],
        recipientIds: [lead.assignedTo || campaign.createdBy],
        type: 'ai_calling.needs_review',
        category: 'CRM',
        priority: 'NORMAL',
        payload: {
          title: `AI call needs review: ${lead.name}`,
          message: `Call outcome requires human review (${outcome.reason}).`,
          leadId: String(lead._id), campaignId: String(campaign._id), callId: String(call._id),
        },
        sourceModule: 'ai-calling', sourceEvent: 'NEEDS_REVIEW', sourceEntityType: 'CallRecord', sourceEntityId: call._id,
        idempotencyKey: `ai-call-review-${call._id}`,
      }, campaign.createdBy).catch((e) => logger.warn('review notification failed', { module: 'ai-calling', error: e.message }));
    }
    return { applied: newStatus !== previousStatus, previousStatus, newStatus };
  }

  /**
   * True when a human changed this lead's status after `since` (the call was
   * placed). Evidence: the CRM audit log of lead updates (written via a queue,
   * so it is eventually consistent — the compare-and-set covers the race window).
   */
  async _statusChangedByHumanSince(leadId, since) {
    if (!since) return false;
    try {
      const AuditLog = mongoose.models.AuditLog;
      if (!AuditLog) return false;
      // lead.service#update logs { eventType:'lead.updated', details:{ leadId, changedFields } }.
      return Boolean(await AuditLog.exists({
        eventType: 'lead.updated',
        timestamp: { $gt: since },
        'details.leadId': { $in: [leadId, String(leadId)] },
        'details.changedFields': 'status',
      }));
    } catch {
      return false;
    }
  }

  // ------------------------------------------------- webhooks (telephony)
  /**
   * Idempotent telephony webhook handler (duplicate deliveries are dropped by a
   * unique event key). Out-of-order safe: state only ever moves forward, and a
   * terminal outcome is applied through the same atomic processing claim.
   */
  async applyWebhookEvent({ provider, providerCallId, internalCallId, eventType, occurredAt = new Date(), providerEventId = null, payload = {} }) {
    const eventKey = providerEventId
      ? `${provider}:event:${providerEventId}`
      : `${provider}:${providerCallId || internalCallId}:${eventType}:${occurredAt instanceof Date ? occurredAt.getTime() : occurredAt}`;
    try {
      await CallWebhookEvent.create({ eventKey, provider, providerCallId: providerCallId || null, eventType, normalizedState: normalizeTelephonyStatus(eventType), occurredAt, payload: sanitize(payload) });
    } catch (error) {
      if (error?.code === 11000) { recordCallMetric('webhook', 'duplicate'); return { duplicate: true }; }
      throw error;
    }
    recordCallMetric('webhook', eventType || 'unknown');
    if (!internalCallId && !providerCallId) return { matched: false };
    const call = await CallRecord.findOne(internalCallId ? { internalCallId } : { providerCallId });
    if (!call) return { matched: false };
    await CallWebhookEvent.updateOne({ eventKey }, { $set: { callId: call._id } }).catch(() => {});

    let normalized = normalizeTelephonyStatus(eventType);
    if (!normalized) return { matched: true, ignored: true };

    if (normalized === 'in_progress') {
      await this.agentAnswered(call.internalCallId, occurredAt);
      return { matched: true, state: 'in_progress' };
    }
    // A call that was answered can't afterwards be "no answer"/"busy": treat a
    // late/odd carrier code on an answered call as a normal hang-up.
    if (call.answeredAt && ['no_answer', 'busy'].includes(normalized)) normalized = 'completed';

    if (['no_answer', 'busy', 'voicemail', 'failed'].includes(normalized)) {
      if (!call.resultsProcessedAt) await this.processCallResults(call._id, { disposition: normalized, source: 'webhook' });
      return { matched: true, state: normalized };
    }
    if (normalized === 'completed') {
      if (!call.resultsProcessedAt) await this.processCallResults(call._id, { source: 'webhook' });
      return { matched: true, state: 'completed' };
    }
    return { matched: true, state: normalized };
  }

  // ------------------------------------------------- live monitoring
  /**
   * In-flight calls for a campaign with live per-call progress (current phase /
   * question, answers captured so far, elapsed time) for the monitoring view.
   */
  async activeCalls(campaignId, actor) {
    const campaign = await this.getCampaign(campaignId, actor); // ownership
    const calls = await CallRecord.find({
      campaignId, state: { $in: ['ringing', 'initiating', 'in_progress'] },
    }).sort({ initiatedAt: 1 }).limit(100).populate('leadId', 'leadNumber name').lean();

    const now = Date.now();
    return calls.map((c) => {
      const state = c.conversationState || engine.initConversationState();
      const prog = engine.progress(campaign.questionnaire, state);
      const action = engine.nextAction(campaign.questionnaire, state);
      const currentQuestion = action.question?.label
        || ({ disclose: 'Introduction', confirm: 'Confirming answers', finish: 'Wrapping up', end: 'Ending call' })[action.type]
        || null;
      const startedAt = c.answeredAt || c.initiatedAt || c.createdAt;
      return {
        callId: c.internalCallId,
        recordId: String(c._id),
        leadName: c.leadId?.name || '—',
        leadNumber: c.leadId?.leadNumber || '',
        state: c.state,
        phase: action.type,
        currentQuestion,
        answered: prog.answered,
        total: prog.total,
        elapsedSeconds: startedAt ? Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 1000)) : 0,
        isTest: c.isTest,
      };
    });
  }

  // ------------------------------------------------- reconciliation sweep
  /**
   * Recover calls and campaigns stuck in a non-terminal state (crashed worker,
   * lost webhook, ambiguous dispatch, lost tick chain). Idempotent; safe on a
   * timer. It never re-dials by itself: anything whose outcome is unknown is
   * parked for a human.
   */
  async reconcileStuckCalls({ now = new Date(), limit = 200 } = {}) {
    const nowMs = now.getTime();
    const RING_GRACE_MS = 5 * 60_000;
    const results = { noAnswer: 0, timedOut: 0, parked: 0, reprocessed: 0, reclaimed: 0, ticksRevived: 0, stillLive: 0 };

    // 1. Ringing/initiating long past any ring timeout. Ask the provider first:
    //    a room that still has the SIP leg is a live call we must not touch.
    const ringing = await CallRecord.find({
      resultsProcessedAt: null, initiatedAt: { $lt: new Date(nowMs - RING_GRACE_MS) },
      // 'initiating' without dispatchStartedAt never reached the provider; the
      // dispatch-lease recovery owns those.
      $or: [{ state: 'ringing' }, { state: 'initiating', dispatchStartedAt: { $ne: null } }],
    }).select('_id roomName recipientId campaignId provider').limit(limit).lean();
    for (const c of ringing) {
      const room = await roomStatus(c.roomName);
      if (room === 'live') { results.stillLive += 1; continue; }
      if (room === 'gone') {
        await this.processCallResults(c._id, { disposition: 'no_answer', source: 'reconcile' })
          .catch((e) => logger.warn('reconcile no_answer failed', { module: 'ai-calling', callId: String(c._id), error: e.message }));
        results.noAnswer += 1;
      } else {
        // Provider state unknown → we cannot prove the lead was not reached.
        const campaign = await CallCampaign.findById(c.campaignId).lean();
        if (campaign && c.provider !== 'livekit_web') {
          await this._markAmbiguous(c._id, c.recipientId, campaign, 'PROVIDER_STATE_UNKNOWN', 'Call never reported an outcome and the provider could not be queried');
        } else {
          await CallRecord.updateOne({ _id: c._id }, { $set: { state: 'needs_reconcile', 'reconciliation.needed': true } });
        }
        results.parked += 1;
      }
    }

    // 2. in_progress calls past max duration + grace → process what we have (and hang up).
    const active = await CallRecord.find({ state: 'in_progress', resultsProcessedAt: null })
      .select('_id campaignId answeredAt initiatedAt createdAt').limit(limit).lean();
    for (const c of active) {
      const campaign = await CallCampaign.findById(c.campaignId).select('agentConfig').lean();
      const maxMs = ((campaign?.agentConfig?.maxCallSeconds || 300) + 120) * 1000;
      const started = new Date(c.answeredAt || c.initiatedAt || c.createdAt).getTime();
      if (nowMs - started > maxMs) {
        await this.processCallResults(c._id, { source: 'reconcile_timeout' })
          .catch((e) => logger.warn('reconcile timeout failed', { module: 'ai-calling', callId: String(c._id), error: e.message }));
        results.timedOut += 1;
      }
    }

    // 3. Post-call processing that crashed mid-way (claim expired, never stamped).
    const crashed = await CallRecord.find({
      resultsProcessedAt: null, processingLeaseUntil: { $ne: null, $lt: now },
    }).select('_id').limit(limit).lean();
    for (const c of crashed) {
      await this.processCallResults(c._id, { source: 'reconcile_resume' })
        .catch((e) => logger.warn('reconcile resume failed', { module: 'ai-calling', callId: String(c._id), error: e.message }));
      results.reprocessed += 1;
    }

    // 4. Recipients whose dispatch lease expired (all campaigns).
    results.reclaimed = await this._recoverExpiredDispatches({ limit });

    // 5. Tick-chain watchdog: an active campaign whose next tick is long overdue
    //    lost its chain (Redis flush, crash mid-enqueue). A new token supersedes
    //    any straggler, so reviving can never create a second chain.
    const overdue = await CallCampaign.find({
      status: { $in: ['running', 'scheduled'] },
      $and: [
        { $or: [{ nextTickAt: null }, { nextTickAt: { $lt: new Date(nowMs - 3 * 60_000) } }] },
        { $or: [{ tickLeaseUntil: null }, { tickLeaseUntil: { $lt: now } }] },
      ],
    }).select('_id').limit(50).lean();
    for (const c of overdue) {
      await this._scheduleTick(c._id, 0).catch((e) => logger.warn('tick revive failed', { module: 'ai-calling', campaignId: String(c._id), error: e.message }));
      results.ticksRevived += 1;
    }

    // 6. Recipients wedged in processing with an expired lease.
    await CampaignRecipient.updateMany(
      { state: 'processing', leaseUntil: { $lt: now } },
      { $set: { state: 'queued', leaseUntil: null } },
    );

    for (const [k, v] of Object.entries(results)) if (v) recordCallMetric('reconcile', k);
    return results;
  }

  /**
   * Operational diagnostics for the calling pipeline (served with telephony
   * health). Informational: it never feeds /health/ready, so a provider outage
   * is visible here without making the whole CRM look unready.
   */
  async operationalHealth(now = new Date()) {
    const nowMs = now.getTime();
    const [running, stuckRinging, needsReconcile, expiredClaims, overdueTicks, failedLastHour, callsLastHour] = await Promise.all([
      CallCampaign.countDocuments({ status: 'running' }),
      CallRecord.countDocuments({ state: { $in: ['ringing', 'initiating'] }, resultsProcessedAt: null, initiatedAt: { $lt: new Date(nowMs - 5 * 60_000) } }),
      CallRecord.countDocuments({ state: 'needs_reconcile', 'reconciliation.resolvedAt': null }),
      CallRecord.countDocuments({ resultsProcessedAt: null, processingLeaseUntil: { $ne: null, $lt: now } }),
      CallCampaign.countDocuments({ status: 'running', nextTickAt: { $lt: new Date(nowMs - 3 * 60_000) } }),
      CallRecord.countDocuments({ ...NOT_WEB_TEST, disposition: 'failed', createdAt: { $gte: new Date(nowMs - 3_600_000) } }),
      CallRecord.countDocuments({ ...NOT_WEB_TEST, createdAt: { $gte: new Date(nowMs - 3_600_000) } }),
    ]);
    const misconfiguration = agentApiMisconfiguration();
    const warnings = [];
    if (misconfiguration) warnings.push(misconfiguration);
    if (stuckRinging) warnings.push(`${stuckRinging} call(s) ringing > 5 min without an outcome (webhooks or worker?)`);
    if (needsReconcile) warnings.push(`${needsReconcile} call attempt(s) need manual reconciliation`);
    if (expiredClaims) warnings.push(`${expiredClaims} post-call processing run(s) crashed and await the sweep`);
    if (overdueTicks) warnings.push(`${overdueTicks} running campaign(s) have an overdue tick (queue/worker down?)`);
    if (callsLastHour >= 10 && failedLastHour / callsLastHour > 0.5) warnings.push('More than half of the calls in the last hour failed');
    return {
      status: warnings.length ? 'attention' : 'ok',
      runningCampaigns: running, stuckRinging, needsReconcile, expiredProcessingClaims: expiredClaims,
      overdueTicks, callsLastHour, failedLastHour, warnings,
    };
  }

  // ------------------------------------------------- reads / analytics
  async getCall(callId, actor) {
    const call = await CallRecord.findOne({ _id: callId, createdBy: actor })
      .populate('campaignId', 'name').populate('leadId', 'leadNumber name').lean();
    if (!call) throw new NotFoundError('CallRecord', callId);
    return call;
  }

  async historyForLead(leadId, actor, { page = 1, limit = 25 } = {}) {
    const filter = { leadId, createdBy: actor };
    const [data, total, transitions] = await Promise.all([
      CallRecord.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate('campaignId', 'name').lean(),
      CallRecord.countDocuments(filter),
      LeadCallTransition.find({ leadId, createdBy: actor }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    return { calls: data, transitions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  /** Audit trail of automated / reviewed lead-status changes made by AI calls. */
  async leadTransitions(leadId, actor) {
    return LeadCallTransition.find({ leadId, createdBy: actor }).sort({ createdAt: -1 }).limit(50).lean();
  }

  /** Flatten a campaign's call attempts to CSV rows (one row per attempt). */
  async exportCampaign(campaignId, actor) {
    await this.getCampaign(campaignId, actor); // ownership check
    const calls = await CallRecord.find({ campaignId }).sort({ createdAt: 1 })
      .populate('leadId', 'leadNumber name phone mobile').lean();
    const fmt = (v) => {
      if (v == null) return '';
      if (Array.isArray(v)) return v.join('|');
      if (typeof v === 'boolean') return v ? 'yes' : 'no';
      return String(v);
    };
    const headers = [
      'callId', 'leadNumber', 'leadName', 'phone', 'attempt', 'state', 'disposition',
      'qualification', 'reviewRequired', 'durationSeconds', 'costAmount', 'costCurrency',
      'startedAt', 'answeredAt', 'endedAt', 'answers',
    ];
    const rows = calls.map((c) => ({
      callId: c.internalCallId,
      leadNumber: c.leadId?.leadNumber || '',
      leadName: c.leadId?.name || '',
      phone: c.leadId?.mobile || c.leadId?.phone || '',
      attempt: c.attemptNumber,
      state: c.state,
      disposition: c.disposition || '',
      qualification: c.qualification || '',
      reviewRequired: c.reviewRequired ? 'yes' : 'no',
      durationSeconds: c.durationSeconds || 0,
      costAmount: c.cost?.amount ?? '',
      costCurrency: c.cost?.currency || '',
      startedAt: c.initiatedAt?.toISOString?.() || '',
      answeredAt: c.answeredAt?.toISOString?.() || '',
      endedAt: c.endedAt?.toISOString?.() || '',
      answers: (c.answers || []).map((a) => `${a.questionFieldKey}=${fmt(a.normalizedValue)}(${a.validation})`).join('; '),
    }));
    // BOM so Excel detects UTF-8; toCsv handles escaping + formula-injection guards.
    const bom = String.fromCharCode(0xFEFF);
    return bom + toCsv(headers, rows);
  }

  /**
   * Human review/correction. Corrected values are re-validated against the
   * campaign question (the client's claimed validation is not trusted), and a
   * human qualification verdict is applied to the lead through the same guarded
   * transition path as automated outcomes, audited as a user action.
   */
  async reviewAnswers(callId, actor, { answers = [], qualification = null } = {}, meta = {}) {
    const call = await CallRecord.findOne({ _id: callId, createdBy: actor });
    if (!call) throw new NotFoundError('CallRecord', callId);
    if (!call.resultsProcessedAt) throw new ConflictError('The call is still in progress; review it after it ends');
    const campaign = await CallCampaign.findById(call.campaignId);
    const questions = new Map((campaign?.questionnaire?.questions || []).map((q) => [q.fieldKey, q]));
    const byKey = new Map(answers.map((a) => [a.questionFieldKey, a]));
    for (const key of byKey.keys()) {
      if (!call.answers.some((a) => a.questionFieldKey === key) && !questions.has(key)) {
        throw new ValidationError(`Unknown question: ${key}`);
      }
    }
    call.answers = call.answers.map((a) => {
      const correction = byKey.get(a.questionFieldKey);
      if (!correction) return a;
      // Validate against the campaign question, or — if the questionnaire has
      // since changed — against the type the answer was captured with.
      const question = questions.get(a.questionFieldKey)
        || { fieldKey: a.questionFieldKey, label: a.label || a.questionFieldKey, type: a.type || 'short_text' };
      if (correction.normalizedValue !== undefined && correction.normalizedValue !== null && correction.normalizedValue !== '') {
        const raw = reviewValueToText(correction.normalizedValue);
        const checked = validateAnswer(question, raw);
        if (checked.validation === 'invalid') {
          throw new ValidationError(`"${question.label}": ${checked.reason || 'invalid value'}`);
        }
        a.normalizedValue = checked.normalizedValue;
        a.validation = checked.validation;
      } else if (correction.validation === 'unknown') {
        a.normalizedValue = null;
        a.validation = 'unknown';
      }
      a.reviewStatus = 'corrected';
      a.source = 'human_review';
      return a;
    });
    // A reviewer may also supply an answer the AI never captured.
    for (const [key, correction] of byKey) {
      if (call.answers.some((a) => a.questionFieldKey === key)) continue;
      const question = questions.get(key);
      if (!question || correction.normalizedValue === undefined || correction.normalizedValue === null || correction.normalizedValue === '') continue;
      const raw = reviewValueToText(correction.normalizedValue);
      const checked = validateAnswer(question, raw);
      if (checked.validation === 'invalid') throw new ValidationError(`"${question.label}": ${checked.reason || 'invalid value'}`);
      call.answers.push({
        questionFieldKey: key, questionnaireVersion: campaign.questionnaireVersion, label: question.label, type: question.type,
        rawAnswer: raw, normalizedValue: checked.normalizedValue, mapTo: question.mapTo || null, validation: checked.validation,
        confirmed: false, source: 'human_review', reviewStatus: 'corrected',
      });
    }
    const previousQualification = call.qualification;
    if (qualification) call.qualification = qualification;
    call.reviewRequired = false;
    await call.save();

    let leadTransition = null;
    const action = ({
      qualified: 'mark_qualified', unqualified: 'mark_unqualified', do_not_contact: 'mark_do_not_contact', callback: 'schedule_callback',
    })[qualification];
    if (action && campaign && !campaign.isTest && call.provider !== 'livekit_web' && qualification !== previousQualification) {
      const recipient = await CampaignRecipient.findById(call.recipientId);
      leadTransition = await this._applyOutcomeToLead({
        call, campaign, recipient,
        outcome: { qualification, action, ruleId: null, reason: 'human_review', requiresReview: false, callback: null },
        disposition: call.disposition, actorType: 'user', actorId: actor,
      });
      if (recipient && String(recipient.lastCallId) === String(call._id)) {
        await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { qualification } });
      }
      await refreshCampaignSummary(call.campaignId);
    }
    auditService.logEvent({ eventType: 'ai_calling.call.reviewed', userId: actor, ipAddress: meta.ipAddress || 'internal', result: 'success', module: 'ai-calling', details: { callId, qualification, leadTransition } });
    return call.toObject();
  }

  async retryRecipients(campaignId, actor, { recipientIds = [] } = {}, meta = {}) {
    const campaign = await CallCampaign.findOne({ _id: campaignId, createdBy: actor });
    if (!campaign) throw new NotFoundError('CallCampaign', campaignId);
    const filter = { campaignId, 'eligibility.eligible': true, state: { $in: ['exhausted', 'failed'] } };
    if (recipientIds.length) filter._id = { $in: recipientIds };
    if (['cancelled'].includes(campaign.status)) throw new ConflictError('A cancelled campaign cannot be retried');
    const result = await CampaignRecipient.updateMany(filter, { $set: { state: 'queued', nextAttemptAt: null, leaseUntil: null } });
    // A paused campaign stays paused (the user resumes it); a finished one restarts.
    if (result.modifiedCount > 0 && ['completed', 'running'].includes(campaign.status)) {
      if (campaign.status === 'completed') {
        await CallCampaign.updateOne({ _id: campaignId, status: 'completed' }, { $set: { status: 'running', completedAt: null } });
      }
      await this._scheduleTick(campaignId, 0);
    }
    await refreshCampaignSummary(campaignId);
    auditService.logEvent({ eventType: 'ai_calling.campaign.retry', userId: actor, ipAddress: meta.ipAddress || 'internal', result: 'success', module: 'ai-calling', details: { campaignId, retried: result.modifiedCount } });
    return { retried: result.modifiedCount };
  }

  _analyticsMatch(actor, { from, to, campaignId } = {}) {
    const match = { createdBy: new mongoose.Types.ObjectId(actor), ...NOT_WEB_TEST };
    if (campaignId) match.campaignId = new mongoose.Types.ObjectId(campaignId);
    if (from || to) match.createdAt = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to) } : {}) };
    return match;
  }

  async analytics(actor, { from, to, campaignId } = {}) {
    const match = this._analyticsMatch(actor, { from, to, campaignId });
    const answeredCond = { $cond: [{ $in: ['$disposition', ['answered_completed', 'answered_partial']] }, 1, 0] };
    const [byDisposition, byQualification, byDay, totals, campaigns] = await Promise.all([
      CallRecord.aggregate([{ $match: match }, { $group: { _id: '$disposition', count: { $sum: 1 } } }]),
      CallRecord.aggregate([{ $match: match }, { $group: { _id: '$qualification', count: { $sum: 1 } } }]),
      CallRecord.aggregate([
        { $match: match },
        { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          calls: { $sum: 1 }, answered: { $sum: answeredCond },
          qualified: { $sum: { $cond: [{ $eq: ['$qualification', 'qualified'] }, 1, 0] } },
        } },
        { $sort: { _id: 1 } }, { $limit: 180 },
      ]),
      CallRecord.aggregate([{ $match: match }, { $group: {
        _id: null, calls: { $sum: 1 }, answered: { $sum: answeredCond },
        totalSeconds: { $sum: '$durationSeconds' }, cost: { $sum: '$cost.amount' },
        reviews: { $sum: { $cond: ['$reviewRequired', 1, 0] } },
        callbacks: { $sum: { $cond: [{ $eq: ['$disposition', 'callback_requested'] }, 1, 0] } },
        qualified: { $sum: { $cond: [{ $eq: ['$qualification', 'qualified'] }, 1, 0] } },
      } }]),
      CallCampaign.countDocuments({ createdBy: actor }),
    ]);
    const t = totals[0] || { calls: 0, answered: 0, totalSeconds: 0, cost: 0, reviews: 0, callbacks: 0, qualified: 0 };
    return {
      campaigns,
      totalCalls: t.calls,
      answered: t.answered,
      answerRate: t.calls ? Number((t.answered / t.calls).toFixed(3)) : null,
      qualified: t.qualified,
      qualificationRate: t.calls ? Number((t.qualified / t.calls).toFixed(3)) : null,
      callbacks: t.callbacks,
      avgCallSeconds: t.calls ? Math.round(t.totalSeconds / t.calls) : 0,
      totalCost: Number((t.cost || 0).toFixed(4)),
      reviews: t.reviews,
      byDisposition,
      byQualification,
      byDay: byDay.map((d) => ({ date: d._id, calls: d.calls, answered: d.answered, qualified: d.qualified })),
    };
  }

  /** Analytics as a CSV (daily time series + a totals row). */
  async analyticsCsv(actor, filters = {}) {
    const data = await this.analytics(actor, filters);
    const headers = ['date', 'calls', 'answered', 'qualified'];
    const rows = [...data.byDay];
    rows.push({ date: 'TOTAL', calls: data.totalCalls, answered: data.answered, qualified: data.qualified });
    return String.fromCharCode(0xFEFF) + toCsv(headers, rows);
  }

  // ------------------------------------------------- browser test simulation
  /**
   * Stateless browser test harness. The client holds the conversation state and
   * posts the user's typed turn; the server runs the SAME question engine and
   * answer validation used on real calls (no telephony, no OpenAI required), so
   * admins can verify questionnaire wording, branching and status rules before
   * spending money on phone calls. The real voice path adds OpenAI Realtime +
   * LiveKit on top of this exact engine.
   */
  async simulate(campaignId, actor, { state = null, userText = null, disclose = false } = {}) {
    const campaign = await CallCampaign.findOne({ _id: campaignId, createdBy: actor }).lean();
    if (!campaign) throw new NotFoundError('CallCampaign', campaignId);
    let s = state || engine.initConversationState();
    if (disclose) s = engine.markDisclosed(s);

    if (userText != null && s.disclosed && !s.endedReason) {
      const action = engine.nextAction(campaign.questionnaire, s);
      if (action.type === 'ask' || action.type === 'clarify') {
        const result = validateAnswer(action.question, userText);
        s = engine.applyAnswer(s, action.question.fieldKey, { ...result, rawAnswer: userText });
      } else if (action.type === 'confirm') {
        s = /^(y|yes|correct|right|ja)/i.test(userText.trim())
          ? engine.markConfirmed(s, action.question.fieldKey)
          : engine.applyAnswer(s, action.question.fieldKey, { validation: 'invalid', normalizedValue: null, rawAnswer: userText });
      }
    }

    const next = engine.nextAction(campaign.questionnaire, s);
    const prog = engine.progress(campaign.questionnaire, s);
    let outcomePreview = null;
    if (next.type === 'finish' || next.type === 'end') {
      const validValues = {};
      for (const q of campaign.questionnaire.questions || []) {
        const e = s.answers?.[q.fieldKey];
        if (e?.validation === 'valid') validValues[q.fieldKey] = e.normalizedValue;
      }
      const disposition = next.reason || (prog.unresolvedRequired.length ? 'answered_partial' : 'answered_completed');
      outcomePreview = evaluateOutcome({
        statusRules: campaign.statusRules, answers: validValues, disposition,
        hasUnresolvedRequired: prog.unresolvedRequired.length > 0, control: s.control || {},
      });
    }
    return { state: s, nextAction: this._serializeAction(next), progress: prog, outcomePreview };
  }

  // ------------------------------------------------- browser WebRTC voice test
  /**
   * Start a real-time browser voice test: dispatch the agent into a LiveKit room
   * and mint a join token so the admin can speak to it from their browser (no
   * phone, no SIP). This exercises the full OpenAI Realtime + tool-API path short
   * of PSTN. Requires LiveKit + OpenAI to be configured; otherwise it fails
   * honestly rather than pretending. The call is always isTest (never mutates a lead).
   */
  async startWebTest(campaignId, actor, { leadId = null } = {}) {
    const campaign = await CallCampaign.findOne({ _id: campaignId, createdBy: actor });
    if (!campaign) throw new NotFoundError('CallCampaign', campaignId);
    if (!livekit.livekitReady) {
      throw new ServiceUnavailableError('Browser voice test needs LiveKit configured (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET) and the agent worker running. Use the text Simulate console meanwhile.');
    }

    // Attach the test to a recipient for lead context; pick the requested lead,
    // else the first recipient of the campaign.
    let recipient = null;
    if (leadId) recipient = await CampaignRecipient.findOne({ campaignId, leadId });
    if (!recipient) recipient = await CampaignRecipient.findOne({ campaignId }).sort({ createdAt: 1 });
    if (!recipient) throw new ValidationError('This campaign has no leads to provide call context. Add leads first.');

    // Browser tests use NEGATIVE attempt numbers so they can never collide with
    // the (recipientId, attemptNumber) slot a real dial will need.
    const priorTests = await CallRecord.countDocuments({ recipientId: recipient._id, attemptNumber: { $lt: 0 } });
    const attemptNumber = -(priorTests + 1);
    const internalCallId = `webtest_${recipient._id}_${attemptNumber}_${crypto.randomBytes(4).toString('hex')}`;
    const roomName = `crm-call-${internalCallId}`;

    const call = await CallRecord.create({
      campaignId: campaign._id, recipientId: recipient._id, leadId: recipient.leadId,
      internalCallId, attemptNumber, isTest: true, provider: 'livekit_web',
      roomName, state: 'ringing', queuedAt: new Date(), initiatedAt: new Date(),
      conversationState: engine.initConversationState(), createdBy: actor,
    });

    const apiBase = process.env.PUBLIC_API_BASE_URL || `http://localhost:${process.env.PORT || 9097}`;
    const dispatch = await livekit.dispatchAgent({
      roomName,
      metadata: {
        campaignId: String(campaign._id), callId: internalCallId, mode: 'web',
        agentToolApi: `${apiBase}/api/v1/ai-calling/agent`,
        agentToken: issueAgentToken(internalCallId, (campaign.agentConfig?.maxCallSeconds || 300) + 600),
        voice: campaign.agentConfig?.voice, language: campaign.agentConfig?.language,
      },
    });
    if (dispatch.outcome !== 'accepted') {
      await CallRecord.updateOne({ _id: call._id }, { $set: { state: 'failed', disposition: 'failed', failureMessage: dispatch.errorMessage, endedAt: new Date(), resultsProcessedAt: new Date() } });
      throw new ServiceUnavailableError(`Could not dispatch the voice agent: ${dispatch.errorMessage}. Is the agent worker running?`);
    }

    const token = livekit.issueJoinToken({
      roomName, identity: `admin-${actor}`, name: 'Tester',
      ttlSeconds: (campaign.agentConfig?.maxCallSeconds || 300) + 120,
    });
    auditService.logEvent({ eventType: 'ai_calling.web_test.started', userId: actor, result: 'success', module: 'ai-calling', details: { campaignId, callId: internalCallId } });
    return { callId: internalCallId, roomName, url: livekit.wsUrl, token };
  }

  // ------------------------------------------------- suppression admin
  async suppressNumber({ phone, leadId, reason = 'admin', note }, actor) {
    let e164 = null;
    if (phone) {
      const normalized = normalizePhone(phone, 'CH');
      e164 = normalized.valid ? normalized.e164 : null;
    } else if (leadId) {
      const lead = await Lead.findOne({ _id: leadId, isDeleted: false }).select('_id phone mobile address').lean();
      if (!lead) throw new NotFoundError('Lead', leadId);
      e164 = validDestination(lead);
    }
    if (!e164) throw new ValidationError('A valid phone number is required');
    const hash = phoneHash(e164);
    await CallSuppression.updateOne(
      { phoneHash: hash },
      { $set: { leadId: leadId || null, reason, note: note || null, source: 'manual', createdBy: actor, suppressedAt: new Date() } },
      { upsert: true },
    );
    await CampaignRecipient.updateMany({ phoneHash: hash, state: { $in: ['draft', 'queued', 'retry_scheduled'] } }, { $set: { state: 'suppressed', 'eligibility.eligible': false } });
    if (leadId) await CallConsent.updateOne(
      { createdBy: actor, leadId, phoneHash: hash },
      {
        $set: { status: 'revoked', revokedAt: new Date(), changedBy: actor },
        $setOnInsert: {
          evidence: note || `Suppressed: ${reason}`, source: 'manual_suppression', capturedAt: new Date(),
          createdBy: actor, leadId, phoneHash: hash,
        },
      },
      { upsert: true },
    );
    return { suppressed: true };
  }

  // Leads are company-wide (shared), so consent is read and enforced company-wide:
  // the latest decision by anyone is authoritative. Records stay per-author for audit.
  async getConsent(leadId, actor) { // eslint-disable-line no-unused-vars
    const lead = await Lead.findOne({ _id: leadId, isDeleted: false }).select('_id phone mobile address').lean();
    if (!lead) throw new NotFoundError('Lead', leadId);
    const e164 = validDestination(lead);
    const consent = e164
      ? (await latestConsentByLead([phoneHash(e164)])).get(`${leadId}:${phoneHash(e164)}`) || null
      : null;
    return { consent, status: consentStatus(consent), destinationAvailable: Boolean(e164) };
  }

  async updateConsent(leadId, input, actor, meta = {}) {
    const lead = await Lead.findOne({ _id: leadId, isDeleted: false }).select('_id phone mobile address').lean();
    if (!lead) throw new NotFoundError('Lead', leadId);
    const e164 = validDestination(lead);
    if (!e164) throw new ValidationError('Lead needs a valid phone number before call consent can be recorded');
    const hash = phoneHash(e164);
    const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();
    const consent = await CallConsent.findOneAndUpdate(
      { createdBy: actor, leadId, phoneHash: hash },
      {
        $set: {
          status: input.status, evidence: input.evidence || '', source: input.source || 'manual',
          capturedAt, expiresAt: input.expiresAt || null,
          revokedAt: input.status === 'granted' ? null : new Date(), changedBy: actor,
        },
        $setOnInsert: { createdBy: actor, leadId, phoneHash: hash },
      },
      { upsert: true, returnDocument: 'after' },
    );
    if (input.status === 'granted') {
      await CampaignRecipient.updateMany(
        { leadId, phoneHash: hash, state: { $in: ['ineligible', 'suppressed'] }, 'eligibility.reasons': { $in: ['consent_required', 'consent_expired', 'consent_revoked'] } },
        [
          { $set: { 'eligibility.reasons': { $filter: { input: '$eligibility.reasons', as: 'reason', cond: { $not: { $in: ['$$reason', ['consent_required', 'consent_expired', 'consent_revoked']] } } } } } },
          { $set: {
            'eligibility.eligible': { $eq: [{ $size: '$eligibility.reasons' }, 0] },
            state: { $cond: [{ $eq: [{ $size: '$eligibility.reasons' }, 0] }, 'draft', '$state'] },
          } },
        ],
        { updatePipeline: true },
      );
    } else {
      await CampaignRecipient.updateMany(
        { leadId, phoneHash: hash, state: { $in: ['draft', 'queued', 'retry_scheduled'] } },
        { $set: { state: 'suppressed', 'eligibility.eligible': false, 'eligibility.reasons': ['consent_revoked'] } },
      );
    }
    const affectedCampaignIds = await CampaignRecipient.distinct('campaignId', { leadId, phoneHash: hash });
    if (input.status === 'granted' && affectedCampaignIds.length) {
      // Re-enabled recipients of an already-started campaign go straight back to the queue.
      const started = await CallCampaign.find({ _id: { $in: affectedCampaignIds }, status: { $in: ['running', 'scheduled', 'paused'] } }).select('_id').lean();
      if (started.length) {
        await CampaignRecipient.updateMany(
          { campaignId: { $in: started.map((c) => c._id) }, leadId, phoneHash: hash, state: 'draft', 'eligibility.eligible': true },
          { $set: { state: 'queued' } },
        );
      }
    }
    await Promise.all(affectedCampaignIds.map((campaignId) => refreshCampaignSummary(campaignId)));
    auditService.logEvent({
      eventType: 'ai_calling.consent.changed', userId: actor, ipAddress: meta.ipAddress || 'internal',
      result: 'success', module: 'ai-calling', details: { leadId, status: input.status, source: input.source || 'manual' },
    });
    return consent.toObject();
  }
}

/**
 * The worker may report only telephony-level outcomes. Once a human answered,
 * "no_answer"/"busy" are impossible and ignored (the outcome is derived from the
 * conversation); "voicemail" stays valid because a voicemail box answers too.
 */
export function sanitizeReportedDisposition(disposition, call) {
  if (!['voicemail', 'no_answer', 'busy', 'failed'].includes(disposition)) return null;
  if (call?.answeredAt && ['no_answer', 'busy'].includes(disposition)) return null;
  return disposition;
}

/**
 * Per-call cost. A provider-reported amount wins; otherwise, when the operator
 * configures a blended rate (AI_CALLING_COST_PER_MINUTE, e.g. realtime model +
 * carrier minutes), an ESTIMATE is computed from billed minutes and flagged as
 * such. Without either the amount stays 0 — we never invent prices.
 */
export function estimateCallCost(call, reported = null, rate = Number(process.env.AI_CALLING_COST_PER_MINUTE || 0)) {
  const currency = reported?.currency || process.env.AI_CALLING_COST_CURRENCY || 'USD';
  const breakdown = reported?.breakdown || null;
  if (reported && Number(reported.amount) > 0) return { amount: Number(reported.amount), currency, breakdown };
  if (rate > 0 && call.durationSeconds > 0) {
    const billedMinutes = Math.ceil(call.durationSeconds / 60);
    return { amount: Number((billedMinutes * rate).toFixed(4)), currency, breakdown: { ...(breakdown || {}), estimate: true, ratePerMinute: rate, billedMinutes } };
  }
  return { amount: 0, currency, breakdown };
}

/**
 * Reviewer corrections arrive as typed values; run them through the same
 * validator the agent's spoken answers use, in the validator's own vocabulary.
 */
function reviewValueToText(value) {
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.join(', ');
  return String(value ?? '');
}

/** 'live' | 'gone' | 'unknown' — provider-side room state for reconciliation. */
async function roomStatus(roomName) {
  if (!roomName || typeof livekit.roomStatus !== 'function') return 'unknown';
  try { return await livekit.roomStatus({ roomName }); } catch { return 'unknown'; }
}

function sanitize(payload) {
  if (!payload || typeof payload !== 'object') return {};
  try {
    const clone = JSON.parse(JSON.stringify(payload));
    for (const k of ['token', 'apiKey', 'authToken', 'Authorization', 'secret']) if (k in clone) clone[k] = '[REDACTED]';
    return clone;
  } catch { return {}; }
}

export default new AiCallingService();
