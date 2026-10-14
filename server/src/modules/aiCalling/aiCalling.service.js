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
import { leadContext, buildSystemPrompt } from './engine/leadContext.js';

const MAX_FILTERED_RECIPIENTS = 5000;
const callConsentRequired = () => process.env.AI_CALLING_REQUIRE_CONSENT !== 'false';

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

/** Local-time call-window evaluation. Returns { open, delayMs } in the schedule's tz. */
export function windowState(schedule, now = new Date()) {
  const tz = schedule?.timezone || 'UTC';
  let hour = 0; let minute = 0; let weekday = 1;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(now);
    hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
    const wd = parts.find((p) => p.type === 'weekday')?.value;
    weekday = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 })[wd] ?? 1;
  } catch { /* default to open on tz errors rather than stranding a campaign */ return { open: true, delayMs: 0 }; }

  const days = schedule?.daysOfWeek?.length ? schedule.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
  const parse = (v) => { const [h, m] = String(v || '00:00').split(':').map(Number); return h * 60 + (m || 0); };
  const start = parse(schedule?.callWindow?.start);
  const end = parse(schedule?.callWindow?.end);
  const nowMin = hour * 60 + minute;
  const dayOk = days.includes(weekday);
  const inWindow = start <= end ? (nowMin >= start && nowMin < end) : (nowMin >= start || nowMin < end);
  if (dayOk && inWindow) return { open: true, delayMs: 0 };
  // Not open — delay to the next window start today, else ~1h and re-check.
  let minutesUntil = start - nowMin;
  if (minutesUntil <= 0) minutesUntil += 24 * 60;
  return { open: false, delayMs: Math.min(minutesUntil, 60) * 60_000 };
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
      { $match: { campaignId: cid } },
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
  const campaign = await CallCampaign.findById(campaignId).select('status').lean();
  if (pending === 0 && total > 0 && campaign && !['cancelled', 'draft', 'paused'].includes(campaign.status)) {
    update.status = 'completed';
    update.completedAt = new Date();
  }
  await CallCampaign.updateOne({ _id: campaignId }, { $set: update });
  emitToOwner(campaign?.createdBy, 'ai-calling:summary', { campaignId: String(campaignId), summary });
  return summary;
}

class AiCallingService {
  // ---------------------------------------------------------------- campaigns
  async createCampaign(input, actor, meta = {}) {
    assertQuestionnaire(input.questionnaire);
    const leadIds = await resolveLeadIds(input.selection);
    if (!leadIds.length) throw new ValidationError('No leads match the selected recipients');
    if (leadIds.length > (input.schedule?.maxCallsPerDay ? 100000 : 100000)) { /* soft cap handled below */ }

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
    const [suppressionRows, consentRows] = await Promise.all([
      CallSuppression.find({ phoneHash: { $in: candidateHashes } }).select('phoneHash').lean(),
      callConsentRequired()
        ? CallConsent.find({ createdBy: actor, phoneHash: { $in: candidateHashes } }).lean()
        : [],
    ]);
    const suppressed = new Set(suppressionRows.map((d) => d.phoneHash));
    const consentByLead = new Map(consentRows.map((row) => [`${row.leadId}:${row.phoneHash}`, row]));

    const seen = new Set();
    const docs = computed.map(({ lead, e164, hash }) => {
      const reasons = [];
      if (!e164) reasons.push('missing_phone');
      if (hash && suppressed.has(hash)) reasons.push('suppressed');
      const consent = hash ? consentByLead.get(`${lead._id}:${hash}`) : null;
      if (callConsentRequired() && hash && (
        consent?.status !== 'granted' || (consent.expiresAt && new Date(consent.expiresAt) <= new Date())
      )) reasons.push(consent?.expiresAt && new Date(consent.expiresAt) <= new Date() ? 'consent_expired' : 'consent_required');
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
    const campaign = await CallCampaign.findOne({ _id: id, createdBy: actor });
    if (!campaign) throw new NotFoundError('CallCampaign', id);
    if (!['draft', 'paused', 'scheduled'].includes(campaign.status)) {
      throw new ConflictError('Only draft, scheduled or paused campaigns can be started');
    }
    const eligible = await CampaignRecipient.countDocuments({ campaignId: id, state: { $in: ['draft', 'queued', 'retry_scheduled'] }, 'eligibility.eligible': true });
    if (!eligible) throw new ConflictError('Campaign has no eligible recipients to call');

    const runAt = scheduledAt ? new Date(scheduledAt) : campaign.scheduledAt;
    const delay = runAt && runAt > new Date() ? runAt.getTime() - Date.now() : 0;
    campaign.status = delay ? 'scheduled' : 'running';
    campaign.scheduledAt = runAt || null;
    campaign.startedAt ||= delay ? null : new Date();
    campaign.pausedAt = null;
    campaign.updatedBy = actor;
    await campaign.save();

    // Move draft → queued so the tick can lease them.
    await CampaignRecipient.updateMany(
      { campaignId: id, state: 'draft', 'eligibility.eligible': true },
      { $set: { state: 'queued' } },
    );
    await queueManager.addJob(OUTBOUND_CALL_QUEUE, `tick-${id}`, { campaignId: String(id), kind: 'tick' }, {
      jobId: `tick-${id}-${Date.now()}`, delay, attempts: 1,
    });
    await refreshCampaignSummary(id);
    auditService.logEvent({
      eventType: 'ai_calling.campaign.started', userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'ai-calling', details: { campaignId: id, eligible, scheduledAt: runAt },
    });
    return this.getCampaign(id, actor);
  }

  async pauseCampaign(id, actor, meta = {}) {
    const campaign = await CallCampaign.findOne({ _id: id, createdBy: actor });
    if (!campaign) throw new NotFoundError('CallCampaign', id);
    if (!['running', 'scheduled', 'queued'].includes(campaign.status)) throw new ConflictError('Campaign is not running');
    campaign.status = 'paused';
    campaign.pausedAt = new Date();
    campaign.updatedBy = actor;
    await campaign.save();
    auditService.logEvent({ eventType: 'ai_calling.campaign.paused', userId: actor, ipAddress: meta.ipAddress || 'internal', result: 'success', module: 'ai-calling', details: { campaignId: id } });
    return this.getCampaign(id, actor);
  }

  async cancelCampaign(id, actor, meta = {}) {
    const campaign = await CallCampaign.findOne({ _id: id, createdBy: actor });
    if (!campaign) throw new NotFoundError('CallCampaign', id);
    if (['completed', 'cancelled'].includes(campaign.status)) throw new ConflictError('Campaign cannot be cancelled');
    campaign.status = 'cancelled';
    campaign.cancelledAt = new Date();
    campaign.updatedBy = actor;
    await campaign.save();
    // Stop pending work. In-flight calls are left to finish and reconcile.
    await CampaignRecipient.updateMany(
      { campaignId: id, state: { $in: ['draft', 'queued', 'retry_scheduled'] } },
      { $set: { state: 'cancelled' } },
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
      CampaignRecipient.find(filter).sort({ createdAt: 1 }).skip((page - 1) * limit).limit(limit)
        .populate('leadId', 'leadNumber name phone mobile address status').lean(),
      CampaignRecipient.countDocuments(filter),
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // ----------------------------------------------------------- queue / tick
  /**
   * Lease and dispatch due recipients for a campaign, honouring concurrency,
   * call window and daily caps. Re-enqueues itself while work remains. Idempotent
   * and safe across restarts: all state lives in the recipient documents.
   */
  async tickCampaign(campaignId) {
    const campaign = await CallCampaign.findById(campaignId);
    if (!campaign) return { stopped: true };
    if (['paused', 'cancelled', 'completed', 'draft'].includes(campaign.status)) return { stopped: true, status: campaign.status };
    if (campaign.status === 'scheduled' && campaign.scheduledAt && campaign.scheduledAt > new Date()) {
      await queueManager.addJob(OUTBOUND_CALL_QUEUE, `tick-${campaignId}`, { campaignId: String(campaignId), kind: 'tick' },
        { delay: campaign.scheduledAt.getTime() - Date.now(), attempts: 1 });
      return { rescheduled: true };
    }
    if (campaign.status !== 'running') { campaign.status = 'running'; campaign.startedAt ||= new Date(); await campaign.save(); }

    const schedule = campaign.schedule || {};
    const win = windowState(schedule);
    if (!win.open) {
      await queueManager.addJob(OUTBOUND_CALL_QUEUE, `tick-${campaignId}`, { campaignId: String(campaignId), kind: 'tick' },
        { delay: win.delayMs, attempts: 1 });
      return { outsideWindow: true, retryInMs: win.delayMs };
    }

    // Reclaim expired leases (crashed workers) before counting in-flight.
    await CampaignRecipient.updateMany(
      { campaignId, state: { $in: ['dialing'] }, leaseUntil: { $lt: new Date() } },
      { $set: { state: 'queued', leaseUntil: null } },
    );

    const inFlight = await CampaignRecipient.countDocuments({ campaignId, state: { $in: ['dialing', 'in_progress', 'processing'] } });
    const concurrency = Math.max(1, schedule.maxConcurrency || 1);
    let slots = concurrency - inFlight;
    if (slots <= 0) {
      await queueManager.addJob(OUTBOUND_CALL_QUEUE, `tick-${campaignId}`, { campaignId: String(campaignId), kind: 'tick' }, { delay: 15_000, attempts: 1 });
      return { busy: true, inFlight };
    }

    // Daily cap.
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const todayCalls = await CallRecord.countDocuments({ campaignId, initiatedAt: { $gte: dayStart } });
    if (schedule.maxCallsPerDay && todayCalls >= schedule.maxCallsPerDay) {
      await queueManager.addJob(OUTBOUND_CALL_QUEUE, `tick-${campaignId}`, { campaignId: String(campaignId), kind: 'tick' }, { delay: 30 * 60_000, attempts: 1 });
      return { dailyCapReached: true };
    }
    slots = Math.min(slots, (schedule.maxCallsPerDay || Infinity) - todayCalls);

    let dispatched = 0;
    for (let i = 0; i < slots; i += 1) {
      const recipient = await this._claimNextRecipient(campaignId);
      if (!recipient) break;
      try {
        await this._dispatchCall(campaign, recipient);
        dispatched += 1;
      } catch (error) {
        logger.error('Call dispatch failed', { module: 'ai-calling', campaignId: String(campaignId), recipientId: String(recipient._id), error: error.message });
        await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { state: 'queued', leaseUntil: null } });
      }
    }

    const remaining = await CampaignRecipient.countDocuments({
      campaignId, state: { $in: ['queued', 'retry_scheduled', 'dialing', 'in_progress', 'processing'] },
    });
    if (remaining > 0) {
      await queueManager.addJob(OUTBOUND_CALL_QUEUE, `tick-${campaignId}`, { campaignId: String(campaignId), kind: 'tick' },
        { delay: dispatched > 0 ? 10_000 : 20_000, attempts: 1 });
    } else {
      await refreshCampaignSummary(campaignId);
    }
    return { dispatched, remaining };
  }

  /** Atomically claim one due recipient (queued, or retry due) with a lease. */
  async _claimNextRecipient(campaignId) {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + 2 * 60_000);
    return CampaignRecipient.findOneAndUpdate(
      {
        campaignId,
        'eligibility.eligible': true,
        $or: [
          { state: 'queued' },
          { state: 'retry_scheduled', nextAttemptAt: { $lte: now } },
        ],
      },
      { $set: { state: 'dialing', leaseUntil } },
      { sort: { createdAt: 1 }, returnDocument: 'after' },
    );
  }

  async _dispatchCall(campaign, recipient) {
    // Re-check suppression immediately before dialling.
    if (recipient.phoneHash && await CallSuppression.exists({ phoneHash: recipient.phoneHash })) {
      await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { state: 'suppressed', leaseUntil: null, 'eligibility.eligible': false, 'eligibility.reasons': ['suppressed'] } });
      await refreshCampaignSummary(campaign._id);
      return { suppressed: true };
    }
    if (callConsentRequired()) {
      const consent = await CallConsent.findOne({
        createdBy: recipient.createdBy,
        leadId: recipient.leadId,
        phoneHash: recipient.phoneHash,
        status: 'granted',
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      }).lean();
      if (!consent) {
        await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: {
          state: 'suppressed', leaseUntil: null, 'eligibility.eligible': false,
          'eligibility.reasons': ['consent_required'],
        } });
        await refreshCampaignSummary(campaign._id);
        return { suppressed: true, reason: 'consent_required' };
      }
    }

    const attemptNumber = recipient.attemptCount + 1;
    const internalCallId = `call_${recipient._id}_${attemptNumber}_${crypto.randomBytes(4).toString('hex')}`;
    const roomName = `crm-call-${internalCallId}`;

    const call = await CallRecord.create({
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

    await CampaignRecipient.updateOne({ _id: recipient._id }, { $inc: { attemptCount: 1 }, $set: { lastCallId: call._id, leaseUntil: new Date(Date.now() + 5 * 60_000) } });

    const apiBase = process.env.PUBLIC_API_BASE_URL || `http://localhost:${process.env.PORT || 9097}`;
    const routed = await routeOutboundCall({
      to: recipient.phoneSnapshot,
      country: recipient.country,
      roomName,
      internalCallId,
      metadata: {
        campaignId: String(campaign._id),
        callId: internalCallId,
        agentToolApi: `${apiBase}/api/v1/ai-calling/agent`,
        agentToken: issueAgentToken(internalCallId, campaign.agentConfig?.maxCallSeconds ? campaign.agentConfig.maxCallSeconds + 600 : 1800),
        voice: campaign.agentConfig?.voice,
        language: campaign.agentConfig?.language,
      },
    });
    const { result } = routed;
    await CallProviderAttempt.insertMany(routed.attempts.map((attempt, index) => ({
      callId: call._id, campaignId: campaign._id, recipientId: recipient._id,
      attemptIndex: index + 1, provider: attempt.provider, outcome: attempt.outcome,
      providerCallId: attempt.providerCallId || null, errorCode: attempt.errorCode || null,
      errorMessage: attempt.errorMessage || null, responseStatus: attempt.responseStatus || null,
      fallbackReason: index > 0 ? (result.fallbackReason || null) : null,
      createdBy: recipient.createdBy,
    })), { ordered: true });

    if (result.outcome === 'accepted') {
      await CallRecord.updateOne({ _id: call._id }, { $set: {
        state: 'ringing', provider: result.provider, providerCallId: result.providerCallId,
        fallbackFrom: result.fallbackFrom || null, fallbackReason: result.fallbackReason || null,
      } });
      emitToOwner(campaign.createdBy, 'ai-calling:call', { campaignId: String(campaign._id), callId: internalCallId, state: 'ringing' });
      return { accepted: true, callId: internalCallId };
    }
    if (result.outcome === 'ambiguous') {
      // We don't know if the call was placed. Mark for reconciliation, never auto-retry.
      await CallRecord.updateOne({ _id: call._id }, { $set: { state: 'needs_reconcile', failureCode: result.errorCode, failureMessage: result.errorMessage, 'reconciliation.needed': true, 'reconciliation.note': 'Ambiguous dispatch outcome' } });
      await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { state: 'failed', leaseUntil: null, finalDisposition: 'needs_reconcile' } });
      await refreshCampaignSummary(campaign._id);
      return { ambiguous: true };
    }
    // Rejected. A permanent rejection (bad number, not configured, policy) is
    // terminal — retrying it only wastes attempts. A transient one may retry.
    await CallRecord.updateOne({ _id: call._id }, { $set: { state: 'failed', disposition: 'failed', failureCode: result.errorCode, failureMessage: result.errorMessage, endedAt: new Date() } });
    if (result.safeToRetry === false) {
      await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { state: 'failed', leaseUntil: null, finalDisposition: 'failed' } });
    } else {
      await this._scheduleRetryOrFail(campaign, recipient, 'failed');
    }
    await refreshCampaignSummary(campaign._id);
    return { rejected: true, reason: result.errorMessage };
  }

  async _scheduleRetryOrFail(campaign, recipient, disposition) {
    const schedule = campaign.schedule || {};
    const retryable = ['no_answer', 'busy', 'failed', 'voicemail'].includes(disposition);
    const attempts = recipient.attemptCount; // already incremented
    if (retryable && attempts < (schedule.maxAttemptsPerLead || 2)) {
      const nextAttemptAt = new Date(Date.now() + (schedule.retryDelayMinutes || 120) * 60_000);
      await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { state: 'retry_scheduled', nextAttemptAt, leaseUntil: null, finalDisposition: disposition } });
    } else {
      const terminal = retryable ? 'exhausted' : 'failed';
      await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { state: terminal, leaseUntil: null, finalDisposition: disposition } });
    }
  }

  // ------------------------------------------------- agent tool API (live call)
  async _loadCallForAgent(internalCallId) {
    const call = await CallRecord.findOne({ internalCallId });
    if (!call) throw new NotFoundError('CallRecord', internalCallId);
    const campaign = await CallCampaign.findById(call.campaignId).lean();
    if (!campaign) throw new NotFoundError('CallCampaign', call.campaignId);
    return { call, campaign };
  }

  /** Context + first action for the agent when the call connects. */
  async getCallContext(internalCallId) {
    const { call, campaign } = await this._loadCallForAgent(internalCallId);
    const lead = await Lead.findById(call.leadId).select('name website address providerMeta sourceMetadata notes').lean();
    if (call.state === 'ringing' || call.state === 'initiating') {
      await CallRecord.updateOne({ _id: call._id, state: { $in: ['ringing', 'initiating'] } }, { $set: { state: 'in_progress', answeredAt: new Date() } });
      await CampaignRecipient.updateOne({ _id: call.recipientId }, { $set: { state: 'in_progress' } });
      emitToOwner(campaign.createdBy, 'ai-calling:call', { campaignId: String(campaign._id), callId: internalCallId, state: 'in_progress' });
    }
    const state = call.conversationState || engine.initConversationState();
    return {
      callId: internalCallId,
      agentConfig: campaign.agentConfig,
      disclosure: (campaign.agentConfig?.disclosure || '').replace('{company}', campaign.agentConfig?.organizationName || 'our company'),
      systemPrompt: buildSystemPrompt({ agentConfig: campaign.agentConfig, lead, objective: campaign.agentConfig?.objective }),
      leadContext: leadContext(lead),
      ...(campaign.agentConfig?.shareLeadNotes && lead?.notes ? { leadNotes: String(lead.notes).slice(0, 1000) } : {}),
      nextAction: this._serializeAction(engine.nextAction(campaign.questionnaire, state)),
    };
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
    const { call, campaign } = await this._loadCallForAgent(internalCallId);
    const state = engine.markDisclosed(call.conversationState || engine.initConversationState());
    await CallRecord.updateOne({ _id: call._id }, { $set: { conversationState: state } });
    return { nextAction: this._serializeAction(engine.nextAction(campaign.questionnaire, state)) };
  }

  /** The constrained record_answer tool. Validation happens server-side. */
  async agentRecordAnswer(internalCallId, { fieldKey, rawAnswer }) {
    const { call, campaign } = await this._loadCallForAgent(internalCallId);
    const question = (campaign.questionnaire.questions || []).find((q) => q.fieldKey === fieldKey);
    if (!question) throw new ValidationError(`Unknown question: ${fieldKey}`);
    const result = validateAnswer(question, rawAnswer);
    let state = engine.applyAnswer(call.conversationState || engine.initConversationState(), fieldKey, { ...result, rawAnswer });
    await CallRecord.updateOne({ _id: call._id }, { $set: { conversationState: state } });
    const action = engine.nextAction(campaign.questionnaire, state);
    emitToOwner(campaign.createdBy, 'ai-calling:answer', { campaignId: String(campaign._id), callId: internalCallId, fieldKey, validation: result.validation });
    return { accepted: true, validation: result.validation, nextAction: this._serializeAction(action) };
  }

  async agentMarkUnknown(internalCallId, { fieldKey }) {
    return this.agentRecordAnswer(internalCallId, { fieldKey, rawAnswer: '' });
  }

  async agentConfirm(internalCallId, { fieldKey }) {
    const { call, campaign } = await this._loadCallForAgent(internalCallId);
    const state = engine.markConfirmed(call.conversationState || engine.initConversationState(), fieldKey);
    await CallRecord.updateOne({ _id: call._id }, { $set: { conversationState: state } });
    return { nextAction: this._serializeAction(engine.nextAction(campaign.questionnaire, state)) };
  }

  async agentRequestCallback(internalCallId, { when, note }) {
    const { call } = await this._loadCallForAgent(internalCallId);
    const state = engine.endConversation(call.conversationState || engine.initConversationState(), 'callback_requested');
    await CallRecord.updateOne({ _id: call._id }, { $set: { conversationState: { ...state, control: { callbackRequestedAt: when || null, callbackText: note || null } } } });
    return { acknowledged: true, nextAction: { type: 'end', reason: 'callback_requested' } };
  }

  async agentDoNotContact(internalCallId) {
    const { call } = await this._loadCallForAgent(internalCallId);
    const state = engine.endConversation(call.conversationState || engine.initConversationState(), 'do_not_contact');
    await CallRecord.updateOne({ _id: call._id }, { $set: { conversationState: state } });
    return { acknowledged: true, nextAction: { type: 'end', reason: 'do_not_contact' } };
  }

  async agentDecline(internalCallId) {
    const { call } = await this._loadCallForAgent(internalCallId);
    const state = engine.endConversation(call.conversationState || engine.initConversationState(), 'declined');
    await CallRecord.updateOne({ _id: call._id }, { $set: { conversationState: state } });
    return { acknowledged: true, nextAction: { type: 'end', reason: 'declined' } };
  }

  /**
   * The agent (or the worker's on_disconnect handler) signals the call is over.
   * Triggers idempotent post-call processing.
   */
  async agentEndCall(internalCallId, { disposition = null, durationSeconds = null, transcriptRef = null, cost = null } = {}) {
    const { call } = await this._loadCallForAgent(internalCallId);
    return this.processCallResults(call._id, { disposition, durationSeconds, transcriptRef, cost, source: 'agent_end' });
  }

  // ------------------------------------------------- post-call processing
  /**
   * Idempotent. Persists the structured answers, evaluates status rules, applies
   * exactly one validated lead-status transition, creates callbacks/suppression,
   * notifies the owner, updates recipient retry state and the campaign summary.
   */
  async processCallResults(callId, { disposition = null, durationSeconds = null, transcriptRef = null, recordingRef = null, cost = null } = {}) {
    const call = await CallRecord.findById(callId);
    if (!call) throw new NotFoundError('CallRecord', callId);
    if (call.resultsProcessedAt) return { duplicate: true, callId: call.internalCallId };

    const campaign = await CallCampaign.findById(call.campaignId);
    const recipient = await CampaignRecipient.findById(call.recipientId);
    const state = call.conversationState || engine.initConversationState();
    const control = state.control || {};

    // Determine disposition from the engine state if the telephony layer didn't give one.
    const prog = engine.progress(campaign.questionnaire, state);
    let finalDisposition = disposition;
    if (!finalDisposition) {
      if (state.endedReason === 'do_not_contact') finalDisposition = 'do_not_contact';
      else if (state.endedReason === 'callback_requested') finalDisposition = 'callback_requested';
      else if (state.endedReason === 'declined') finalDisposition = 'declined';
      else if (prog.unresolvedRequired.length === 0 && prog.total > 0) finalDisposition = 'answered_completed';
      else if (prog.answered > 0) finalDisposition = 'answered_partial';
      else finalDisposition = 'no_answer';
    }

    // Flatten validated answers for rule evaluation + persistence.
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

    const answered = ['answered_completed', 'answered_partial', 'declined', 'callback_requested', 'do_not_contact'].includes(finalDisposition);
    const callState = answered ? (finalDisposition === 'no_answer' ? 'no_answer' : 'completed')
      : (['no_answer', 'busy', 'voicemail'].includes(finalDisposition) ? finalDisposition : 'failed');

    // Persist the call record (authoritative, retained even if later steps fail).
    call.state = callState;
    call.disposition = finalDisposition;
    call.qualification = outcome.qualification;
    call.answers = answerDocs;
    call.reviewRequired = outcome.requiresReview;
    if (durationSeconds != null) call.durationSeconds = durationSeconds;
    if (transcriptRef) call.transcriptRef = transcriptRef;
    if (recordingRef) call.recordingRef = recordingRef;
    if (cost) call.cost = { amount: Number(cost.amount) || 0, currency: cost.currency || 'USD', breakdown: cost.breakdown || null };
    call.endedAt ||= new Date();
    call.resultsProcessedAt = new Date();
    await call.save();

    // Apply CRM side-effects only for real campaigns (never for browser/test calls).
    if (!campaign.isTest) {
      await this._applyOutcomeToLead({ call, campaign, recipient, outcome, disposition: finalDisposition });
    }

    // Recipient terminal state / retry.
    if (['no_answer', 'busy', 'voicemail', 'failed'].includes(finalDisposition)) {
      await this._scheduleRetryOrFail(campaign, recipient, finalDisposition);
    } else {
      await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { state: 'completed', leaseUntil: null, finalDisposition, qualification: outcome.qualification } });
    }

    await refreshCampaignSummary(call.campaignId);
    emitToOwner(campaign.createdBy, 'ai-calling:call', { campaignId: String(campaign._id), callId: call.internalCallId, state: callState, disposition: finalDisposition, qualification: outcome.qualification });
    return { processed: true, callId: call.internalCallId, disposition: finalDisposition, qualification: outcome.qualification, action: outcome.action };
  }

  /** Map the rule-engine outcome to a validated lead transition + side-effects. */
  async _applyOutcomeToLead({ call, campaign, recipient, outcome, disposition }) {
    const lead = await Lead.findById(call.leadId);
    if (!lead) return;

    // Record contact timestamp regardless of outcome when the call connected.
    if (['answered_completed', 'answered_partial', 'declined', 'callback_requested', 'do_not_contact'].includes(disposition)) {
      lead.lastContactedAt = new Date();
      lead.lastContactChannel = 'phone';
    }

    const targetStatus = ACTION_TO_LEAD_STATUS[outcome.action] ?? null;
    const previousStatus = lead.status;
    let newStatus = previousStatus;

    // Guardrails: never move a protected status; never downgrade a human win.
    const allowed = targetStatus
      && !PROTECTED_LEAD_STATUSES.has(previousStatus)
      && Object.values(LEAD_STATUS).includes(targetStatus)
      && !outcome.requiresReview;

    if (allowed && targetStatus !== previousStatus) {
      // Don't flip qualified → contacted (never weaken a stronger state).
      const weakening = previousStatus === LEAD_STATUS.QUALIFIED && targetStatus === LEAD_STATUS.CONTACTED;
      if (!weakening) {
        newStatus = targetStatus;
        lead.status = targetStatus;
      }
    }
    await lead.save();

    if (newStatus !== previousStatus) {
      await LeadCallTransition.create({
        leadId: lead._id, campaignId: campaign._id, callId: call._id,
        previousStatus, newStatus, qualification: outcome.qualification,
        ruleId: outcome.ruleId, reason: outcome.reason, actorType: 'system', createdBy: campaign.createdBy,
      });
    }

    // Do-not-contact: suppress + revoke, and never dial again in this/other campaigns.
    if (outcome.action === 'mark_do_not_contact' && recipient?.phoneHash) {
      await CallSuppression.updateOne(
        { phoneHash: recipient.phoneHash },
        { $setOnInsert: { leadId: lead._id, reason: 'do_not_contact', source: 'call_request', suppressedAt: new Date() } },
        { upsert: true },
      );
      await CallConsent.updateOne(
        { createdBy: campaign.createdBy, leadId: lead._id, phoneHash: recipient.phoneHash },
        {
          $set: { status: 'revoked', revokedAt: new Date(), changedBy: campaign.createdBy },
          $setOnInsert: {
            evidence: 'Recipient requested do not contact during call', source: 'call_request',
            capturedAt: new Date(), createdBy: campaign.createdBy, leadId: lead._id, phoneHash: recipient.phoneHash,
          },
        },
        { upsert: true },
      );
      await CampaignRecipient.updateMany(
        { phoneHash: recipient.phoneHash, state: { $in: ['draft', 'queued', 'retry_scheduled'] } },
        { $set: { state: 'suppressed', 'eligibility.eligible': false } },
      );
    }

    // Callback → owner notification (reuses the CRM notification service).
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
      }, campaign.createdBy).catch((e) => logger.warn('callback notification failed', { error: e.message }));
    }

    // Human review needed → notify.
    if (outcome.requiresReview) {
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
      }, campaign.createdBy).catch((e) => logger.warn('review notification failed', { error: e.message }));
    }
  }

  // ------------------------------------------------- webhooks (telephony)
  /**
   * Idempotent telephony webhook handler. Advances call state and, on a terminal
   * un-answered/failed state, drives post-call processing so retries are scheduled.
   */
  async applyWebhookEvent({ provider, providerCallId, internalCallId, eventType, occurredAt = new Date(), providerEventId = null, payload = {} }) {
    const eventKey = providerEventId
      ? `${provider}:event:${providerEventId}`
      : `${provider}:${providerCallId || internalCallId}:${eventType}:${occurredAt instanceof Date ? occurredAt.getTime() : occurredAt}`;
    try {
      await CallWebhookEvent.create({ eventKey, provider, providerCallId: providerCallId || null, eventType, normalizedState: normalizeTelephonyStatus(eventType), occurredAt, payload: sanitize(payload) });
    } catch (error) {
      if (error?.code === 11000) return { duplicate: true };
      throw error;
    }
    const call = await CallRecord.findOne(internalCallId ? { internalCallId } : { providerCallId });
    if (!call) return { matched: false };

    const normalized = normalizeTelephonyStatus(eventType);
    if (!normalized) return { matched: true, ignored: true };

    if (normalized === 'in_progress' && ['ringing', 'initiating'].includes(call.state)) {
      await CallRecord.updateOne({ _id: call._id }, { $set: { state: 'in_progress', answeredAt: call.answeredAt || occurredAt } });
      await CampaignRecipient.updateOne({ _id: call.recipientId }, { $set: { state: 'in_progress' } });
      return { matched: true, state: 'in_progress' };
    }

    // Terminal telephony outcomes.
    if (['no_answer', 'busy', 'voicemail', 'failed'].includes(normalized)) {
      if (!call.resultsProcessedAt) {
        await this.processCallResults(call._id, { disposition: normalized, durationSeconds: payload.duration || 0 });
      }
      return { matched: true, state: normalized };
    }
    if (normalized === 'completed') {
      // The call hung up. If the agent already ended it, this is a no-op; otherwise
      // process whatever was collected.
      if (!call.resultsProcessedAt) {
        await this.processCallResults(call._id, { durationSeconds: payload.duration || call.durationSeconds });
      }
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
   * Recover calls stuck in a non-terminal technical state (a crashed worker, a
   * lost webhook, an ambiguous dispatch). Idempotent and safe to run on a timer:
   * it only ever advances a stuck call toward a terminal, reconciled state and
   * never re-dials. Reconciling an in-flight call relies on processCallResults'
   * resultsProcessedAt guard so a late webhook can't double-apply.
   */
  async reconcileStuckCalls({ now = new Date(), limit = 200 } = {}) {
    const nowMs = now.getTime();
    const RING_GRACE_MS = 5 * 60_000;       // ringing with no answer this long → no_answer
    const RECONCILE_GRACE_MS = 10 * 60_000; // ambiguous dispatch unresolved this long → fail
    const results = { noAnswer: 0, timedOut: 0, failed: 0, reclaimed: 0 };

    // 1. Ringing/initiating that never connected → treat as no-answer (retry logic applies).
    const ringing = await CallRecord.find({
      state: { $in: ['ringing', 'initiating'] }, resultsProcessedAt: null,
      initiatedAt: { $lt: new Date(nowMs - RING_GRACE_MS) },
    }).select('_id').limit(limit).lean();
    for (const c of ringing) {
      await this.processCallResults(c._id, { disposition: 'no_answer' }).catch((e) => logger.warn('reconcile no_answer failed', { callId: String(c._id), error: e.message }));
      results.noAnswer += 1;
    }

    // 2. in_progress calls that ran past their max duration + grace → process what we have.
    const active = await CallRecord.find({ state: 'in_progress', resultsProcessedAt: null })
      .select('_id campaignId answeredAt initiatedAt createdAt').limit(limit).lean();
    for (const c of active) {
      const campaign = await CallCampaign.findById(c.campaignId).select('agentConfig').lean();
      const maxMs = ((campaign?.agentConfig?.maxCallSeconds || 300) + 120) * 1000;
      const started = new Date(c.answeredAt || c.initiatedAt || c.createdAt).getTime();
      if (nowMs - started > maxMs) {
        await this.processCallResults(c._id, { durationSeconds: Math.round((nowMs - started) / 1000) })
          .catch((e) => logger.warn('reconcile timeout failed', { callId: String(c._id), error: e.message }));
        results.timedOut += 1;
      }
    }

    // 3. Ambiguous dispatches left unresolved → conservatively fail (never assume success).
    const stuck = await CallRecord.find({
      state: 'needs_reconcile', 'reconciliation.resolvedAt': null,
      createdAt: { $lt: new Date(nowMs - RECONCILE_GRACE_MS) },
    }).limit(limit);
    for (const call of stuck) {
      call.state = 'failed';
      call.disposition = 'failed';
      call.reconciliation.resolvedAt = new Date();
      call.reconciliation.note = 'Auto-reconciled: ambiguous dispatch never confirmed';
      call.resultsProcessedAt ||= new Date();
      await call.save();
      const recipient = await CampaignRecipient.findById(call.recipientId);
      const campaign = await CallCampaign.findById(call.campaignId);
      if (recipient && campaign) await this._scheduleRetryOrFail(campaign, recipient, 'failed');
      await refreshCampaignSummary(call.campaignId);
      results.failed += 1;
    }

    // 4. Reclaim recipients wedged in processing with an expired lease and no live call.
    const reclaim = await CampaignRecipient.updateMany(
      { state: 'processing', leaseUntil: { $lt: now } },
      { $set: { state: 'queued', leaseUntil: null } },
    );
    results.reclaimed = reclaim.modifiedCount || 0;

    return results;
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
    return { data, transitions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
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

  async reviewAnswers(callId, actor, { answers = [], qualification = null } = {}) {
    const call = await CallRecord.findOne({ _id: callId, createdBy: actor });
    if (!call) throw new NotFoundError('CallRecord', callId);
    const byKey = new Map(answers.map((a) => [a.questionFieldKey, a]));
    call.answers = call.answers.map((a) => {
      const correction = byKey.get(a.questionFieldKey);
      if (!correction) return a;
      a.normalizedValue = correction.normalizedValue ?? a.normalizedValue;
      a.validation = correction.validation || a.validation;
      a.reviewStatus = 'corrected';
      a.source = 'human_review';
      return a;
    });
    if (qualification) call.qualification = qualification;
    call.reviewRequired = false;
    await call.save();
    auditService.logEvent({ eventType: 'ai_calling.call.reviewed', userId: actor, result: 'success', module: 'ai-calling', details: { callId } });
    return call.toObject();
  }

  async retryRecipients(campaignId, actor, { recipientIds = [] } = {}, meta = {}) {
    const campaign = await CallCampaign.findOne({ _id: campaignId, createdBy: actor });
    if (!campaign) throw new NotFoundError('CallCampaign', campaignId);
    const filter = { campaignId, 'eligibility.eligible': true, state: { $in: ['exhausted', 'failed'] } };
    if (recipientIds.length) filter._id = { $in: recipientIds };
    const result = await CampaignRecipient.updateMany(filter, { $set: { state: 'queued', nextAttemptAt: null, leaseUntil: null } });
    if (result.modifiedCount > 0 && ['completed', 'running', 'paused'].includes(campaign.status)) {
      if (campaign.status !== 'running') { campaign.status = 'running'; await campaign.save(); }
      await queueManager.addJob(OUTBOUND_CALL_QUEUE, `tick-${campaignId}`, { campaignId: String(campaignId), kind: 'tick' }, { attempts: 1 });
    }
    await refreshCampaignSummary(campaignId);
    auditService.logEvent({ eventType: 'ai_calling.campaign.retry', userId: actor, ipAddress: meta.ipAddress || 'internal', result: 'success', module: 'ai-calling', details: { campaignId, retried: result.modifiedCount } });
    return { retried: result.modifiedCount };
  }

  _analyticsMatch(actor, { from, to, campaignId } = {}) {
    const match = { createdBy: new mongoose.Types.ObjectId(actor) };
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

    const priorAttempts = await CallRecord.countDocuments({ recipientId: recipient._id });
    const attemptNumber = priorAttempts + 1;
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
        campaignId: String(campaign._id), callId: internalCallId,
        agentToolApi: `${apiBase}/api/v1/ai-calling/agent`,
        agentToken: issueAgentToken(internalCallId, (campaign.agentConfig?.maxCallSeconds || 300) + 600),
        voice: campaign.agentConfig?.voice, language: campaign.agentConfig?.language,
      },
    });
    if (dispatch.outcome !== 'accepted') {
      await CallRecord.updateOne({ _id: call._id }, { $set: { state: 'failed', disposition: 'failed', failureMessage: dispatch.errorMessage } });
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
    const normalized = normalizePhone(phone, 'CH');
    if (!normalized.valid) throw new ValidationError('A valid phone number is required');
    const hash = phoneHash(normalized.e164);
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

  async getConsent(leadId, actor) {
    const lead = await Lead.findOne({ _id: leadId, createdBy: actor, isDeleted: false }).select('_id phone mobile address').lean();
    if (!lead) throw new NotFoundError('Lead', leadId);
    const e164 = validDestination(lead);
    const consent = e164
      ? await CallConsent.findOne({ createdBy: actor, leadId, phoneHash: phoneHash(e164) }).lean()
      : null;
    return { consent, destinationAvailable: Boolean(e164) };
  }

  async updateConsent(leadId, input, actor, meta = {}) {
    const lead = await Lead.findOne({ _id: leadId, createdBy: actor, isDeleted: false }).select('_id phone mobile address').lean();
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
        { createdBy: actor, leadId, phoneHash: hash, state: 'ineligible', 'eligibility.reasons': { $in: ['consent_required', 'consent_expired'] } },
        [
          { $set: { 'eligibility.reasons': { $filter: { input: '$eligibility.reasons', as: 'reason', cond: { $not: { $in: ['$$reason', ['consent_required', 'consent_expired']] } } } } } },
          { $set: {
            'eligibility.eligible': { $eq: [{ $size: '$eligibility.reasons' }, 0] },
            state: { $cond: [{ $eq: [{ $size: '$eligibility.reasons' }, 0] }, 'draft', '$state'] },
          } },
        ],
        { updatePipeline: true },
      );
    } else {
      await CampaignRecipient.updateMany(
        { createdBy: actor, leadId, phoneHash: hash, state: { $in: ['draft', 'queued', 'retry_scheduled'] } },
        { $set: { state: 'suppressed', 'eligibility.eligible': false, 'eligibility.reasons': ['consent_revoked'] } },
      );
    }
    const affectedCampaignIds = await CampaignRecipient.distinct('campaignId', { createdBy: actor, leadId, phoneHash: hash });
    await Promise.all(affectedCampaignIds.map((campaignId) => refreshCampaignSummary(campaignId)));
    auditService.logEvent({
      eventType: 'ai_calling.consent.changed', userId: actor, ipAddress: meta.ipAddress || 'internal',
      result: 'success', module: 'ai-calling', details: { leadId, status: input.status, source: input.source || 'manual' },
    });
    return consent.toObject();
  }
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
