import crypto from 'node:crypto';
import mongoose from 'mongoose';
import CallCampaign from './callCampaign.model.js';
import CampaignRecipient from './campaignRecipient.model.js';
import CallRecord from './callRecord.model.js';
import CallProviderAttempt from './callProviderAttempt.model.js';
import CallSuppression from './callSuppression.model.js';
import CallConsent from './callConsent.model.js';
import AiCallingSettings from './aiCallingSettings.model.js';
import PairedDevice from '../pairedPhone/pairedDevice.model.js';
import pairedPhoneService from '../pairedPhone/pairedPhone.service.js';
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
import { isConfirmation, validateAnswer } from './engine/answerValidation.js';
import * as engine from './engine/questionEngine.js';
import { evaluateOutcome } from './engine/statusRuleEngine.js';
import { buildCallNotes } from './engine/callNotes.js';
import { conversationInsights } from './engine/conversationInsights.js';
import { leadContext, buildSystemPrompt, disclosureText } from './engine/leadContext.js';
import { windowState, recipientWindow, nextWindowOpen, nextDialTime } from './engine/callWindow.js';
import { recordCallMetric, observeDuration, observeDispatchLatency } from './aiCalling.metrics.js';
import MessageSuppression from '../messaging/suppression.model.js';
import { destinationHash } from '../messaging/destinationHash.js';

export { windowState };

// Trusted local diagnostic capability; JSON request bodies cannot supply this
// Symbol. A verification call cannot require the audio proof it is collecting.
// Only a bounded, single-recipient test may use it; normal campaign gates stay on.
export const AUDIO_VERIFICATION_TEST = Symbol('owner-supervised-audio-test');

const MAX_FILTERED_RECIPIENTS = 5000;
const PROCESSING_LEASE_MS = 2 * 60_000;   // post-call processing claim
const TICK_LEASE_MS = 90_000;             // one tick at a time per campaign
const DISPATCH_LEASE_MS = 2 * 60_000;     // claim → provider request window
const AGENT_CONTEXT_TIMEOUT_MS = Number(process.env.AGENT_CONTEXT_TIMEOUT_MS) || 8000; // worker accepted → loads the call
const TERMINAL_CALL_STATES = new Set(['completed', 'no_answer', 'busy', 'voicemail', 'failed', 'cancelled']);
const REACHED_DISPOSITIONS = ['answered_completed', 'answered_partial', 'declined', 'callback_requested', 'do_not_contact'];
// Paired phone: the gateway still owns the phone call while its leg is in one of these states.
const PAIRED_GATEWAY_LIVE = new Set(['queued', 'claimed', 'dialing']);
// How long the gateway gets to report the end of a paired call after the agent left it.
const PAIRED_END_GRACE_MS = 90_000;
// Gateway end reasons after an answer that are our failure, not an unanswered call.
// A recipient parked for an uncertain outcome is changed only by the owner's reconcile/retry.
const NOT_PARKED = Object.freeze({ finalDisposition: { $ne: 'needs_reconcile' } });
const PAIRED_SYSTEM_END_REASONS = new Set(['agent_left', 'audio_failed', 'audio_lost', 'max_duration']);
// Web (browser) voice tests are attached to a real recipient for lead context but
// must never count as campaign traffic or touch the recipient's state.
// The same holds for "Preview as customer" sessions of SMS link campaigns.
const TEST_PROVIDERS = ['livekit_web', 'web_link_preview'];
const isTestProvider = (provider) => TEST_PROVIDERS.includes(provider);
const NOT_WEB_TEST = { provider: { $nin: TEST_PROVIDERS } };
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
export function assertQuestionnaire(questionnaire) {
  const questions = questionnaire?.questions || [];
  if (!questions.length) throw new ValidationError('A campaign needs at least one question');
  const keys = new Set();
  for (const q of questions) {
    if (!q.fieldKey?.trim() || !q.label?.trim() || !q.text?.trim()) throw new ValidationError('Every question needs a field key, label and question text');
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
  const ordered = [...questions].sort((a, b) => (a.order || 0) - (b.order || 0));
  const prior = new Set();
  for (const q of ordered) {
    for (const group of ['all', 'any']) for (const clause of q.condition?.[group] || []) {
      if (clause.field && !prior.has(clause.field)) throw new ValidationError(`Question "${q.label}" must follow the question used in its condition`);
    }
    prior.add(q.fieldKey);
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
  const [stateRows, reasonRows, qualRows, callAgg, reconcileCount] = await Promise.all([
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
    // Uncertain outcomes parked for a human (never redialed automatically).
    CampaignRecipient.countDocuments({ campaignId: cid, state: 'failed', finalDisposition: 'needs_reconcile' }),
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
    failed: Math.max(0, (s.failed || 0) - reconcileCount), // parked ones are counted in needsReconcile
    retryScheduled: s.retry_scheduled || 0,
    qualified: qual.qualified || 0,
    unqualified: qual.unqualified || 0,
    callbacks: qual.callback || 0,
    needsReview: (qual.review || 0) + reconcileCount,
    needsReconcile: reconcileCount,
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
  const campaign = await CallCampaign.findById(campaignId).select('status createdBy agentId').lean();
  if (pending === 0 && campaign && (total > 0 || campaign.agentId) && !['cancelled', 'draft', 'paused'].includes(campaign.status)) {
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
  async createCampaign(input, actor, meta = {}, origin = {}) {
    assertQuestionnaire(input.questionnaire);
    const transport = await this._resolveTransport(input, actor);
    const leadIds = await resolveLeadIds(input.selection);
    if (!leadIds.length) throw new ValidationError('No leads match the selected recipients');

    const leads = await Lead.find({ _id: { $in: leadIds }, isDeleted: false })
      .select('_id name phone mobile address status').lean();
    if (!leads.length) throw new ValidationError('Selected leads are unavailable');

    const campaign = await CallCampaign.create({
      ...origin,
      name: input.name,
      description: input.description || '',
      status: 'draft',
      questionnaireVersion: 1,
      questionnaire: input.questionnaire,
      statusRules: input.statusRules || [],
      agentConfig: input.agentConfig || {},
      channel: input.channel || 'voice',
      ...transport,
      ...(input.channel === 'web_link' ? { linkConfig: input.linkConfig || {} } : {}),
      schedule: input.schedule || {},
      selection: { ...input.selection, leadIds, selectedAt: new Date() },
      timezone: input.schedule?.timezone || input.timezone || 'UTC',
      scheduledAt: input.scheduledAt || null,
      isTest: Boolean(input.isTest),
      createdBy: actor,
      updatedBy: actor,
    });

    // Build recipients with eligibility (same computation as the pre-save preview).
    const computed = await this._computeEligibility(leads, { isLink: campaign.channel === 'web_link' });
    const docs = computed.map(({ lead, e164, hash, reasons }) => ({
      campaignId: campaign._id,
      leadId: lead._id,
      phoneSnapshot: e164,
      phoneHash: hash,
      country: lead.address?.country || null,
      state: reasons.length ? (reasons.includes('suppressed') ? 'suppressed' : 'ineligible') : 'draft',
      eligibility: { eligible: reasons.length === 0, reasons },
      createdBy: actor,
    }));
    await CampaignRecipient.insertMany(docs, { ordered: false });
    if (origin.initializationPending) await CallCampaign.updateOne({ _id: campaign._id }, { $set: { initializationPending: false } });
    await refreshCampaignSummary(campaign._id);

    auditService.logEvent({
      eventType: 'ai_calling.campaign.created', userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'ai-calling',
      details: { campaignId: campaign._id, selected: leadIds.length, isTest: campaign.isTest },
    });
    return this.getCampaign(campaign._id, actor);
  }

  /**
   * Compute per-lead call/SMS eligibility: missing phone, suppression / do-not-call,
   * call consent (voice only), and duplicate numbers within the set. Pure read — used
   * both to build a campaign's recipients and to preview eligibility before saving, so
   * the two can never disagree. Returns [{ lead, e164, hash, reasons }].
   */
  async _computeEligibility(leads, { isLink }) {
    const computed = leads.map((lead) => {
      const e164 = validDestination(lead);
      return { lead, e164, hash: e164 ? phoneHash(e164) : null };
    });
    const candidateHashes = computed.filter((c) => c.hash).map((c) => c.hash);
    // Link campaigns reach the lead by SMS: SMS suppression applies, voice-call consent does not.
    const needsCallConsent = !isLink && callConsentRequired();
    const smsHashes = isLink ? computed.filter((c) => c.e164).map((c) => destinationHash('sms', c.e164)) : [];
    const [suppressionRows, consentByLead, smsSuppressed] = await Promise.all([
      CallSuppression.find({ phoneHash: { $in: candidateHashes } }).select('phoneHash').lean(),
      needsCallConsent ? latestConsentByLead(candidateHashes) : new Map(),
      isLink ? MessageSuppression.find({ channel: 'sms', destinationHash: { $in: smsHashes } }).select('destinationHash').lean() : [],
    ]);
    const suppressed = new Set(suppressionRows.map((d) => d.phoneHash));
    const smsSuppressedSet = new Set(smsSuppressed.map((d) => d.destinationHash));
    const seen = new Set();
    return computed.map(({ lead, e164, hash }) => {
      const reasons = [];
      if (!e164) reasons.push('missing_phone');
      if (hash && (suppressed.has(hash) || (isLink && smsSuppressedSet.has(destinationHash('sms', e164))))) reasons.push('suppressed');
      const consent = hash ? consentStatus(consentByLead.get(`${lead._id}:${hash}`)) : 'missing';
      if (needsCallConsent && hash && consent !== 'granted') reasons.push(consent === 'expired' ? 'consent_expired' : 'consent_required');
      if (hash && seen.has(hash)) reasons.push('duplicate_phone');
      if (hash) seen.add(hash);
      return { lead, e164, hash, reasons };
    });
  }

  /**
   * Preview — before a campaign is created — whether the chosen leads can actually be
   * reached, so consent / phone / suppression problems surface during selection instead
   * of only when the campaign is started. Read-only; nothing is persisted.
   */
  async previewEligibility(actor, { leadIds = [], channel = 'voice' } = {}) {
    const ids = [...new Set(leadIds.map(String))];
    const leads = await Lead.find({ _id: { $in: ids }, isDeleted: false })
      .select('_id name phone mobile address status').lean();
    const computed = await this._computeEligibility(leads, { isLink: channel === 'web_link' });
    const reasonCounts = {};
    const perLead = computed.map(({ lead, e164, reasons }) => {
      for (const r of reasons) reasonCounts[r] = (reasonCounts[r] || 0) + 1;
      return { leadId: String(lead._id), name: lead.name, status: lead.status, phone: e164, eligible: reasons.length === 0, reasons };
    });
    return {
      total: ids.length,
      found: leads.length,
      unavailable: ids.length - leads.length,
      eligible: perLead.filter((l) => l.eligible).length,
      reasonCounts,
      leads: perLead,
    };
  }

  // ------------------------------------------------- voice kill switch
  async isVoicePaused() {
    if (process.env.AI_VOICE_CALLING_ENABLED === 'false') return true;
    if (this._voicePausedCache && Date.now() - this._voicePausedCache.at < 5_000) return this._voicePausedCache.value;
    const doc = await AiCallingSettings.findOne({ key: 'global' }).lean();
    this._voicePausedCache = { value: Boolean(doc?.voicePaused), at: Date.now() };
    return this._voicePausedCache.value;
  }

  async getVoiceSettings() {
    const doc = await AiCallingSettings.findOne({ key: 'global' }).lean();
    return {
      voicePaused: Boolean(doc?.voicePaused) || process.env.AI_VOICE_CALLING_ENABLED === 'false',
      pausedByEnv: process.env.AI_VOICE_CALLING_ENABLED === 'false',
      pausedReason: doc?.pausedReason || '',
      pausedAt: doc?.pausedAt || null,
    };
  }

  async setVoicePaused(actor, { voicePaused, reason = '' }, meta = {}) {
    await AiCallingSettings.updateOne({ key: 'global' }, { $set: {
      voicePaused: Boolean(voicePaused), pausedReason: voicePaused ? reason : '', pausedAt: voicePaused ? new Date() : null, updatedBy: actor,
    } }, { upsert: true });
    this._voicePausedCache = null;
    auditService.logEvent({
      eventType: voicePaused ? 'ai_calling.voice_paused' : 'ai_calling.voice_resumed', userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'ai-calling', details: { reason },
    });
    return this.getVoiceSettings();
  }

  /** Voice campaigns: cloud SIP or the owner's paired phone (must be theirs and not revoked). */
  async _resolveTransport({ channel, transport, pairedDeviceId }, actor) {
    if (channel === 'web_link' || transport !== 'paired_phone') return { transport: 'cloud_sip', pairedDeviceId: null };
    if (!pairedDeviceId) throw new ValidationError('Choose the paired phone this campaign calls from');
    const device = await PairedDevice.findOne({ _id: pairedDeviceId, createdBy: actor, revokedAt: null }).select('_id').lean();
    if (!device) throw new ValidationError('Paired phone not found, or it was revoked');
    return { transport: 'paired_phone', pairedDeviceId: device._id };
  }

  /** Read-only preflight used before allocating an agent campaign. */
  async assertLaunchAvailable(config, actor) {
    if (await this.isVoicePaused()) throw new ConflictError('All calling is stopped. Resume calling in Connections first');
    const queue = await queueManager.getQueueStats(OUTBOUND_CALL_QUEUE).catch(() => null);
    if (!queue || !Number.isFinite(queue.workers) || queue.workers < 1) throw new ServiceUnavailableError('The calling service is offline. Reconnect the outbound calling worker');
    if (config.transport === 'paired_phone') {
      const device = await PairedDevice.findOne({ _id: config.pairedDeviceId, createdBy: actor, revokedAt: null }).lean();
      if (!device) throw new ConflictError('Choose an available paired phone in the agent settings');
      if (!device.audioVerifiedAt) throw new ConflictError('Verify two-way call sound in Connections before launching');
    } else {
      const health = await telephonyHealth();
      if (!health.configured || !health.eligible) {
        const detail = health.reason === 'no_sip_trunk' ? 'No cloud phone line is configured.' : health.reason ? `Connection check: ${health.reason.replaceAll('_', ' ')}.` : 'Configure and verify the LiveKit SIP route in Connections.';
        throw new ConflictError(`Cloud calling is unavailable. ${detail} To call through your ESP32 and phone SIM, choose My paired phone in the campaign's calling connection.`);
      }
    }
  }

  async getCampaign(id, actor) {
    const campaign = await CallCampaign.findOne({ _id: id, createdBy: actor }).lean();
    if (!campaign) throw new NotFoundError('CallCampaign', id);
    return campaign;
  }

  /** Complete an interrupted agent launch using its persisted lead selection.
   * Upserts fill only missing recipients; they never reset attempts or outcomes. */
  async recoverCampaignInitialization(id, actor) {
    const campaign = await this.getCampaign(id, actor);
    if (!campaign.initializationPending || campaign.status !== 'draft') return;
    const leads = await Lead.find({ _id: { $in: campaign.selection.leadIds }, isDeleted: false }).select('_id name phone mobile address status').lean();
    const computed = await this._computeEligibility(leads, { isLink: false });
    if (computed.length) await CampaignRecipient.bulkWrite(computed.map(({ lead, e164, hash, reasons }) => ({ updateOne: {
      filter: { campaignId: campaign._id, leadId: lead._id },
      update: { $setOnInsert: {
        campaignId: campaign._id, leadId: lead._id, phoneSnapshot: e164, phoneHash: hash, country: lead.address?.country || null,
        state: reasons.length ? (reasons.includes('suppressed') ? 'suppressed' : 'ineligible') : 'draft',
        eligibility: { eligible: reasons.length === 0, reasons }, createdBy: actor,
      } }, upsert: true,
    } })), { ordered: false });
    await CallCampaign.updateOne({ _id: id, createdBy: actor, status: 'draft' }, { $set: { initializationPending: false } });
    await refreshCampaignSummary(id);
  }

  /** Owner-scoped calling readiness; reading it never queues or places a call. */
  async campaignRunStatus(id, actor, now = new Date()) {
    const campaign = await this.getCampaign(id, actor);
    const isVoice = campaign.channel !== 'web_link';
    const [pending, queue, voicePaused, device, pendingRows] = await Promise.all([
      CampaignRecipient.countDocuments({ campaignId: id, state: { $in: ['draft', 'queued', 'retry_scheduled'] }, 'eligibility.eligible': true }),
      isVoice ? queueManager.getQueueStats(OUTBOUND_CALL_QUEUE).catch(() => null) : null,
      isVoice ? this.isVoicePaused() : false,
      campaign.transport === 'paired_phone' ? PairedDevice.findOne({ _id: campaign.pairedDeviceId, createdBy: actor, revokedAt: null }).lean() : null,
      CampaignRecipient.find({ campaignId: id, state: { $in: ['draft', 'queued', 'retry_scheduled'] }, 'eligibility.eligible': true }).select('country nextAttemptAt state').lean(),
    ]);
    const blockers = [];
    const waits = [];
    if (campaign.initializationPending) blockers.push({ code: 'preparing', message: 'This launch is still being prepared. Retry Start Campaign from the agent to recover its original lead selection.' });
    if (isVoice && (!queue || queue.workers === 0)) blockers.push({ code: 'worker_offline', message: 'The calling service is offline. Ask your administrator to reconnect it, then try again.' });
    if (voicePaused) blockers.push({ code: 'voice_paused', message: 'All calling is stopped. Choose Resume calling in AI Calling before starting this campaign.' });
    if (!pending && !campaign.summary?.inProgress) blockers.push({ code: 'no_pending_leads', message: 'There are no eligible leads waiting to be called. Check Recipients for missing phone numbers, consent, or completed calls.' });
    if (campaign.transport === 'paired_phone') {
      if (!device) blockers.push({ code: 'device_missing', message: 'Choose an available paired phone for this campaign.' });
      else {
        if (!device.audioVerifiedAt) blockers.push({ code: 'audio_not_verified', message: 'Verify two-way call sound in Paired phones first.' });
        const readiness = await pairedPhoneService.readiness(device._id, now);
        if (!readiness.ok && pending > 0 && !campaign.summary?.inProgress) waits.push({ code: 'phone_wait', message: 'Your phone is not ready for the next call. Check Paired phones above.', reasons: readiness.reasons });
      }
    }
    const window = windowState(campaign.schedule || {}, now);
    const immediate = campaign.runMode === 'immediate';
    const scheduled = campaign.status === 'scheduled' && campaign.scheduledAt > now;
    if (campaign.executionEndsAt && campaign.executionEndsAt <= now) blockers.push({ code: 'execution_ended', message: 'The campaign execution period has ended. Launch a new campaign to contact remaining leads.' });
    if (isVoice && !immediate && !window.open) waits.push({ code: 'calling_hours', message: 'Waiting for scheduled calling hours. Choose Start calling now to begin immediately.' });
    if (scheduled) waits.unshift({ code: 'scheduled', message: 'This campaign will activate automatically at its scheduled launch time.' });
    const activation = scheduled ? new Date(campaign.scheduledAt) : now;
    const dueRows = pendingRows.filter(r => !r.nextAttemptAt || r.nextAttemptAt <= now);
    if (isVoice && (immediate || window.open) && !scheduled && pendingRows.length) {
      if (!immediate && pendingRows.every(r => !recipientWindow(r.country, { now }).open)) waits.push({ code: 'recipient_quiet_hours', message: 'Waiting for recipients’ local quiet hours to end. Each lead is checked again before calling.' });
      else if (!dueRows.length) waits.push({ code: pendingRows.every(r => r.state === 'retry_scheduled') ? 'retry_backoff' : 'deferred_leads', message: 'Waiting for the next eligible lead attempt. Retry delays and recipient quiet hours still apply.' });
    }
    const starts = new Map();
    for (const row of pendingRows) {
      const at = new Date(Math.max(activation.getTime(), row.nextAttemptAt?.getTime() || 0));
      const key = `${row.country || ''}:${at.getTime()}`;
      if (!starts.has(key)) starts.set(key, immediate ? at : nextDialTime(campaign.schedule || {}, row.country, at));
    }
    const openings = [...starts.values()].filter(Boolean).sort((a, b) => a - b);
    const opening = openings[0] || (immediate ? activation : nextWindowOpen(campaign.schedule || {}, activation));
    const candidate = waits.length || scheduled ? opening : campaign.nextTickAt || opening;
    const nextAt = campaign.executionEndsAt && candidate && candidate >= campaign.executionEndsAt ? null : candidate;
    return {
      status: campaign.status, displayStatus: campaign.status === 'running' ? (campaign.summary?.inProgress ? 'calling' : waits.length || campaign.waitReason ? 'waiting' : 'queued') : campaign.status, pending, inProgress: campaign.summary?.inProgress || 0,
      canStart: (['draft', 'paused', 'scheduled'].includes(campaign.status) || (campaign.status === 'running' && (!immediate || ['calling_hours', 'recipient_quiet_hours'].includes(campaign.waitReason)))) && !blockers.length,
      runMode: immediate ? 'immediate' : 'scheduled',
      blockers, waits, nextAt, checkedAt: now,
      sequential: campaign.transport === 'paired_phone' || (campaign.schedule?.maxConcurrency || 1) === 1,
      schedule: { timezone: campaign.schedule?.timezone || 'UTC', callWindow: campaign.schedule?.callWindow, daysOfWeek: campaign.schedule?.daysOfWeek },
    };
  }

  async listCampaigns(actor, { page = 1, limit = 25, status, channel, agentId } = {}) {
    const filter = { createdBy: actor };
    if (status) filter.status = status;
    if (agentId) filter.agentId = agentId;
    if (channel === 'web_link') filter.channel = 'web_link';
    else if (channel === 'voice') filter.channel = { $ne: 'web_link' };
    const [data, total] = await Promise.all([
      CallCampaign.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      CallCampaign.countDocuments(filter),
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async updateCampaign(id, input, actor) {
    const campaign = await CallCampaign.findOne({ _id: id, createdBy: actor });
    if (!campaign) throw new NotFoundError('CallCampaign', id);
    if (campaign.agentId) throw new ConflictError('Agent campaign configuration is an immutable snapshot. Edit the agent for a future campaign');
    if (!['draft', 'paused'].includes(campaign.status)) throw new ConflictError('Only draft or paused campaigns can be edited');
    if (campaign.status === 'paused') {
      const inFlight = await CallRecord.exists({
        campaignId: campaign._id,
        state: { $in: ['initiating', 'ringing', 'in_progress', 'processing_results'] },
        resultsProcessedAt: null,
      });
      if (inFlight) throw new ConflictError('Wait for active calls to finish before editing this paused campaign');
    }
    if (input.questionnaire) {
      assertQuestionnaire(input.questionnaire);
      campaign.questionnaire = input.questionnaire;
      campaign.questionnaireVersion += 1;
    }
    if (input.linkConfig !== undefined && campaign.channel !== 'web_link') throw new ValidationError('linkConfig is only for SMS link campaigns');
    if (input.transport !== undefined || input.pairedDeviceId !== undefined) {
      const t = await this._resolveTransport({ channel: campaign.channel, transport: input.transport ?? campaign.transport, pairedDeviceId: input.pairedDeviceId ?? campaign.pairedDeviceId }, actor);
      campaign.transport = t.transport;
      campaign.pairedDeviceId = t.pairedDeviceId;
    }
    for (const key of ['name', 'description', 'statusRules', 'agentConfig', 'schedule', 'scheduledAt', 'linkConfig']) {
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

  async _assertAudioVerificationTest(campaign) {
    if (!campaign.isTest || campaign.transport !== 'paired_phone'
      || campaign.schedule?.maxAttemptsPerLead !== 1 || campaign.schedule?.maxCallsPerDay !== 1
      || campaign.schedule?.maxConcurrency !== 1
      || await CampaignRecipient.countDocuments({ campaignId: campaign._id }) !== 1
      || await CallRecord.exists({ campaignId: campaign._id })) {
      throw new ValidationError('An audio verification test must be a fresh, single-recipient paired-phone test with one attempt and one call');
    }
  }

  /**
   * Explain why a start was refused for lack of eligible recipients. Starting only
   * fails this way when every recipient is held, so the breakdown (how many, for what,
   * and what to do) is far more useful than "no eligible recipients".
   */
  async _noEligibleRecipientsMessage(campaignId, channel) {
    const cid = new mongoose.Types.ObjectId(campaignId);
    const rows = await CampaignRecipient.aggregate([
      { $match: { campaignId: cid, 'eligibility.eligible': { $ne: true } } },
      { $unwind: '$eligibility.reasons' },
      { $group: { _id: '$eligibility.reasons', count: { $sum: 1 } } },
    ]);
    const total = await CampaignRecipient.countDocuments({ campaignId: cid });
    if (!total) return 'This campaign has no leads. Add leads to it, then start it.';
    const verb = channel === 'web_link' ? 'texted' : 'called';
    // Collapse the consent variants: the fix (record consent) is the same for all three.
    const counts = new Map();
    for (const r of rows) {
      const key = ['consent_required', 'consent_expired', 'consent_revoked'].includes(r._id) ? 'consent' : r._id;
      counts.set(key, (counts.get(key) || 0) + r.count);
    }
    const FIX = {
      consent: (n) => `${n} lead${n === 1 ? ' needs' : 's need'} recorded call consent — open each lead's AI Calls tab and Record verified consent, then start again`,
      missing_phone: (n) => `${n} lead${n === 1 ? ' has' : 's have'} no valid phone number`,
      suppressed: (n) => `${n} lead${n === 1 ? ' is' : 's are'} on the do-not-contact / suppression list`,
      duplicate_phone: (n) => `${n} share a phone number already used by another recipient`,
      lead_unavailable: (n) => `${n} lead${n === 1 ? ' is' : 's are'} no longer available (deleted or converted)`,
    };
    const parts = [...counts.entries()].filter(([, n]) => n > 0).map(([k, n]) => (FIX[k] ? FIX[k](n) : `${n}: ${k}`));
    const why = parts.length ? ` ${parts.join('; ')}.` : '';
    return `None of this campaign's ${total} lead${total === 1 ? '' : 's'} can be ${verb} right now.${why}`;
  }

  async startCampaign(id, actor, { scheduledAt, sequential = false, startNow = false, [AUDIO_VERIFICATION_TEST]: audioVerificationTest = false } = {}, meta = {}) {
    const campaign = await CallCampaign.findOne({ _id: id, createdBy: actor }).lean();
    if (!campaign) throw new NotFoundError('CallCampaign', id);
    if (campaign.executionEndsAt && campaign.executionEndsAt <= new Date()) throw new ConflictError('This campaign execution period has ended. Launch a new campaign from its agent');
    if (campaign.initializationPending) throw new ConflictError('This launch is still being prepared. Retry Start Campaign from the agent to recover its original lead selection');
    if (audioVerificationTest) await this._assertAudioVerificationTest(campaign);
    const immediate = startNow && campaign.channel !== 'web_link';
    if (immediate && scheduledAt) throw new ValidationError('Choose Start calling now or a future scheduled start');
    const switchingToImmediate = immediate && campaign.status === 'running'
      && (campaign.runMode !== 'immediate' || ['calling_hours', 'recipient_quiet_hours'].includes(campaign.waitReason));
    if (!['draft', 'paused', 'scheduled'].includes(campaign.status) && !switchingToImmediate) {
      throw new ConflictError('Only draft, scheduled or paused campaigns can be started');
    }
    const eligible = await CampaignRecipient.countDocuments({ campaignId: id, state: { $in: ['draft', 'queued', 'retry_scheduled'] }, 'eligibility.eligible': true });
    if (!eligible) throw new ConflictError(await this._noEligibleRecipientsMessage(id, campaign.channel));
    if (campaign.channel !== 'web_link' && await this.isVoicePaused()) {
      throw new ConflictError('AI voice calling is paused (kill switch). Resume it in AI Calling settings first.');
    }
    if (campaign.channel !== 'web_link' && campaign.transport === 'paired_phone') {
      const device = campaign.pairedDeviceId ? await PairedDevice.findOne({ _id: campaign.pairedDeviceId, createdBy: actor }).lean() : null;
      if (!device || device.revokedAt) throw new ConflictError('The paired phone for this campaign is missing or revoked; choose another device');
      if (!device.audioVerifiedAt && !audioVerificationTest) throw new ConflictError('Two-way call audio has not been verified on this paired phone yet. Run the audio test and verify it first.');
    }

    if (campaign.channel !== 'web_link' && !audioVerificationTest) {
      const queue = await queueManager.getQueueStats(OUTBOUND_CALL_QUEUE).catch(() => null);
      if (!queue || queue.workers === 0) throw new ServiceUnavailableError('The calling service is offline. Ask your administrator to reconnect it, then try again.');
    }
    // Explicit null means Start now; omission preserves a saved future start.
    const runAt = immediate ? null : scheduledAt === undefined ? campaign.scheduledAt : scheduledAt ? new Date(scheduledAt) : null;
    const delay = runAt && runAt > new Date() ? runAt.getTime() - Date.now() : 0;
    const runToken = crypto.randomBytes(8).toString('hex');
    // Compare-and-set on status: a double click or a concurrent pause/cancel can't
    // both win, and a cancelled campaign can never be restarted.
    const started = await CallCampaign.findOneAndUpdate(
      { _id: id, createdBy: actor, status: campaign.status,
        ...(switchingToImmediate ? { tickToken: campaign.tickToken || null } : {}),
        $or: [{ tickLeaseUntil: null }, { tickLeaseUntil: { $lt: new Date() } }],
      },
      { $set: {
        status: delay ? 'scheduled' : 'running',
        scheduledAt: runAt || null,
        activatedAt: campaign.activatedAt || new Date(),
        startedAt: campaign.startedAt || (delay || campaign.agentId ? null : new Date()),
        pausedAt: null,
        updatedBy: actor,
        runMode: immediate ? 'immediate' : 'scheduled',
        waitReason: null,
        ...(switchingToImmediate ? { deviceWait: { reasons: [], at: null } } : {}),
        ...(campaign.channel !== 'web_link' && !audioVerificationTest ? { tickToken: runToken } : {}),
        ...(sequential && !campaign.agentId && campaign.channel !== 'web_link' ? { 'schedule.maxConcurrency': 1 } : {}),
      } },
      { returnDocument: 'after' },
    );
    if (!started) throw new ConflictError('Campaign state changed concurrently; refresh and try again');

    // Move draft → queued so the tick can lease them.
    await CampaignRecipient.updateMany(
      { campaignId: id, state: 'draft', 'eligibility.eligible': true },
      { $set: { state: 'queued' } },
    );
    if (immediate) {
      // Queued leads may have been deferred by a previous scheduled-hours run.
      // Retry backoff is separate and remains on retry_scheduled recipients.
      await CampaignRecipient.updateMany({ campaignId: id, state: 'queued', 'eligibility.eligible': true }, { $set: { nextAttemptAt: null } });
    }
    // A link campaign never dials: its links are sent from the user's phone (SMS queue).
    if (campaign.channel !== 'web_link' && !audioVerificationTest) {
      try { await this._scheduleTick(id, delay, runToken); }
      catch (error) {
        // Invalidate a possibly accepted-but-unacknowledged queue job and restore
        // the prior state only while this start still owns it. Never undo a pause/cancel.
        const restored = await CallCampaign.updateOne({ _id: id, status: started.status, tickToken: runToken,
          $or: [{ lastTickAt: null }, { lastTickAt: { $lt: started.updatedAt } }],
        }, { $set: {
          status: campaign.status, scheduledAt: campaign.scheduledAt || null, startedAt: campaign.startedAt || null,
          pausedAt: campaign.pausedAt || null, tickToken: campaign.tickToken || null, nextTickAt: campaign.nextTickAt || null,
          runMode: campaign.runMode || 'scheduled',
          ...(sequential && !campaign.agentId ? { 'schedule.maxConcurrency': campaign.schedule?.maxConcurrency || 1 } : {}),
        } });
        // A Redis acknowledgement can be lost AFTER a worker took the job.
        // Its atomic tick claim is stronger evidence than the enqueue error.
        const workerConfirmed = !restored.modifiedCount && await CallCampaign.exists({ _id: id, status: { $in: ['running', 'scheduled'] }, lastTickAt: { $gte: started.updatedAt } });
        logger.warn('Campaign enqueue acknowledgement failed', { module: 'ai-calling', campaignId: String(id), workerConfirmed: Boolean(workerConfirmed), error: error.message });
        if (!workerConfirmed) throw new ServiceUnavailableError('The calling queue is unavailable or did not confirm the start. Check live call status before trying again.');
      }
    }
    await refreshCampaignSummary(id);
    auditService.logEvent({
      eventType: 'ai_calling.campaign.started', userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'ai-calling', details: { campaignId: id, eligible, scheduledAt: runAt, runMode: immediate ? 'immediate' : 'scheduled' },
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

  /**
   * Permanently delete a campaign and everything tied to it (recipients, call
   * attempts, provider attempts, transitions, webhook events). An active campaign
   * is refused — pause or cancel it first — and so is one with a live call, so a
   * running dial loop can never reference a deleted campaign.
   */
  async deleteCampaign(id, actor) {
    const campaign = await CallCampaign.findOne({ _id: id, createdBy: actor }).lean();
    if (!campaign) throw new NotFoundError('CallCampaign', id);
    if (['running', 'queued', 'scheduled'].includes(campaign.status)) {
      throw new ConflictError('Pause or cancel the campaign before deleting it');
    }
    const activeCall = await CallRecord.exists({ campaignId: id, state: { $in: ['initiating', 'ringing', 'in_progress', 'processing_results'] } });
    if (activeCall) throw new ConflictError('The campaign has a call in progress; wait for it to finish or cancel the campaign first');

    const callIds = (await CallRecord.find({ campaignId: id }).select('_id').lean()).map((c) => c._id);
    await Promise.all([
      CampaignRecipient.deleteMany({ campaignId: id }),
      LeadCallTransition.deleteMany({ campaignId: id }),
      callIds.length ? CallWebhookEvent.deleteMany({ callId: { $in: callIds } }) : Promise.resolve(),
    ]);
    await CallRecord.deleteMany({ campaignId: id });
    // CallProviderAttempt is append-only audit evidence and is intentionally left in place.
    await CallCampaign.deleteOne({ _id: id, createdBy: actor });
    auditService.logEvent({
      eventType: 'ai_calling.campaign.deleted', userId: actor, result: 'success', module: 'ai-calling',
      details: { campaignId: String(id), name: campaign.name, status: campaign.status },
    });
    return { deleted: true, campaignId: String(id) };
  }

  /** Delete several campaigns; each is attempted independently so one refusal does not block the rest. */
  async deleteCampaigns(campaignIds, actor) {
    const ids = [...new Set((campaignIds || []).map(String))];
    const result = { deleted: 0, skipped: [] };
    for (const id of ids) {
      try { await this.deleteCampaign(id, actor); result.deleted += 1; }
      catch (e) { result.skipped.push({ id, reason: e.message }); }
    }
    return result;
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

  /**
   * Remove recipients from a campaign (bulk). A recipient that is mid-call — being
   * dialed, connected, or having its results written, or holding a live dispatch
   * lease, or with a call still being processed — is skipped, so an in-flight call
   * is never orphaned. Everything else (draft, ineligible, suppressed, queued,
   * terminal) is removed; its past call history stays (CallRecords reference the
   * lead and campaign, not the recipient). The lead is also dropped from the
   * campaign's explicit selection so it is not re-enrolled.
   */
  async removeRecipients(campaignId, actor, { recipientIds = [] } = {}, meta = {}) {
    const campaign = await this.getCampaign(campaignId, actor);
    const ids = [...new Set(recipientIds.map(String))];
    const recipients = await CampaignRecipient.find({ _id: { $in: ids }, campaignId }).lean();
    const now = Date.now();
    const ACTIVE = new Set(['dialing', 'in_progress', 'processing']);
    const removable = [];
    const skipped = [];
    const foundIds = new Set(recipients.map((r) => String(r._id)));
    for (const id of ids) if (!foundIds.has(id)) skipped.push({ id, reason: 'not_found' });
    await Promise.all(recipients.map(async (r) => {
      const leased = r.leaseUntil && new Date(r.leaseUntil).getTime() > now;
      let liveCall = false;
      if (r.lastCallId && !ACTIVE.has(r.state)) {
        const call = await CallRecord.findById(r.lastCallId).select('resultsProcessedAt state').lean();
        liveCall = Boolean(call && !call.resultsProcessedAt && !TERMINAL_CALL_STATES.has(call.state));
      }
      if (ACTIVE.has(r.state) || leased || liveCall) skipped.push({ id: String(r._id), reason: 'in_call' });
      else removable.push(r);
    }));
    if (removable.length) {
      const removableIds = removable.map((r) => r._id);
      await CampaignRecipient.deleteMany({ _id: { $in: removableIds }, campaignId });
      const leadIds = [...new Set(removable.map((r) => String(r.leadId)).filter(Boolean))];
      if (leadIds.length && !campaign.agentId) {
        await CallCampaign.updateOne({ _id: campaignId, createdBy: actor }, { $pull: { 'selection.leadIds': { $in: leadIds } }, $set: { updatedBy: actor } });
      }
      await refreshCampaignSummary(campaignId);
      auditService.logEvent({
        eventType: 'ai_calling.recipients_removed', userId: actor, ipAddress: meta.ipAddress || 'internal',
        userAgent: meta.userAgent, result: 'success', module: 'ai-calling',
        details: { campaignId: String(campaignId), removed: removable.length, skipped: skipped.length },
      });
    }
    return { removed: removable.length, skipped };
  }

  // ----------------------------------------------------------- queue / tick
  /**
   * Enqueue the next tick for a campaign. Each enqueue mints a fresh tickToken,
   * which supersedes every older pending tick: duplicate chains (double start,
   * resume racing a delayed tick, the watchdog) collapse to exactly one.
   */
  async _scheduleTick(campaignId, delay = 0, token = crypto.randomBytes(8).toString('hex')) {
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
  async tickCampaign(campaignId, token = null, { [AUDIO_VERIFICATION_TEST]: audioVerificationTest = false } = {}) {
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
      return await this._runTick(campaign, { audioVerificationTest });
    } finally {
      await CallCampaign.updateOne({ _id: campaignId, tickLeaseUntil: campaign.tickLeaseUntil }, { $set: { tickLeaseUntil: null } });
    }
  }

  async _runTick(campaign, { audioVerificationTest = false } = {}) {
    const campaignId = campaign._id;
    if (['paused', 'cancelled', 'completed', 'draft', 'failed'].includes(campaign.status)) return { stopped: true, status: campaign.status };
    if (campaign.channel === 'web_link') return { stopped: true, reason: 'web_link_never_dials' };
    if (audioVerificationTest) await this._assertAudioVerificationTest(campaign);
    if (campaign.executionEndsAt && campaign.executionEndsAt <= new Date()) {
      await CampaignRecipient.updateMany({ campaignId, state: { $in: ['draft', 'queued', 'retry_scheduled'] } },
        { $set: { state: 'cancelled', leaseUntil: null } });
      await CallCampaign.updateOne({ _id: campaignId }, { $set: { waitReason: 'execution_ended' } });
      await refreshCampaignSummary(campaignId);
      const active = await CampaignRecipient.countDocuments({ campaignId, state: { $in: ['dialing', 'in_progress', 'processing'] } });
      if (active) await this._scheduleTick(campaignId, 15_000);
      return { executionEnded: true };
    }
    if (await this.isVoicePaused()) {
      await CallCampaign.updateOne({ _id: campaignId }, { $set: { waitReason: 'voice_paused' } });
      await this._scheduleTick(campaignId, 60_000);
      recordCallMetric('campaign', 'kill_switch_wait');
      return { voicePaused: true };
    }
    if (campaign.status === 'scheduled' && campaign.scheduledAt && campaign.scheduledAt > new Date()) {
      await this._scheduleTick(campaignId, campaign.scheduledAt.getTime() - Date.now());
      return { rescheduled: true };
    }
    if (campaign.status !== 'running') {
      await CallCampaign.updateOne({ _id: campaignId, status: campaign.status }, { $set: { status: 'running', startedAt: campaign.startedAt || (campaign.agentId ? null : new Date()) } });
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
    if (!win.open && !audioVerificationTest && campaign.runMode !== 'immediate') {
      await CallCampaign.updateOne({ _id: campaignId }, { $set: { waitReason: 'calling_hours' } });
      await this._scheduleTick(campaignId, win.delayMs);
      return { outsideWindow: true, retryInMs: win.delayMs };
    }
    if (campaign.waitReason) await CallCampaign.updateOne({ _id: campaignId }, { $set: { waitReason: null } });

    // Recover recipients whose dispatch lease expired (crashed worker) — safely.
    await this._recoverExpiredDispatches({ campaignId });

    const isPaired = campaign.transport === 'paired_phone';
    if (isPaired) {
      // One phone, one call: wait for the device (cooldown, caps, connection) BEFORE claiming a lead.
      const ready = await pairedPhoneService.readiness(campaign.pairedDeviceId, new Date(), { audioVerificationTest });
      if (!ready.ok) {
        const wait = Math.min(10 * 60_000, Math.max(15_000, ready.retryInMs || 30_000));
        await CallCampaign.updateOne({ _id: campaignId }, { $set: { deviceWait: { reasons: ready.reasons, at: new Date() } } });
        await this._scheduleTick(campaignId, wait);
        recordCallMetric('campaign', 'paired_device_wait');
        return { deviceNotReady: true, reasons: ready.reasons, retryInMs: wait };
      }
      await CallCampaign.updateOne({ _id: campaignId }, { $set: { deviceWait: { reasons: [], at: null } } });
    }
    const inFlight = await CampaignRecipient.countDocuments({ campaignId, state: { $in: ['dialing', 'in_progress', 'processing'] } });
    const concurrency = isPaired ? 1 : Math.max(1, schedule.maxConcurrency || 1);
    let slots = concurrency - inFlight;
    if (slots <= 0) {
      await this._scheduleTick(campaignId, 15_000);
      return { busy: true, inFlight };
    }

    // Daily cap (campaign-local calendar day).
    const todayCalls = await CallRecord.countDocuments({ campaignId, ...NOT_WEB_TEST, initiatedAt: { $gte: startOfLocalDay(schedule.timezone) } });
    if (schedule.maxCallsPerDay && todayCalls >= schedule.maxCallsPerDay) {
      await CallCampaign.updateOne({ _id: campaignId }, { $set: { waitReason: 'daily_cap' } });
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
        const result = await this._dispatchCall(campaign, recipient, { audioVerificationTest });
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
    if (remaining > 0 && !audioVerificationTest) {
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

  async _dispatchCall(campaign, recipient, { audioVerificationTest = false } = {}) {
    // --- Pre-dial gates, re-checked for EVERY call, immediately before dialling.
    const fresh = await CallCampaign.findById(campaign._id).select('status runMode').lean();
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
    if (!audioVerificationTest) {
      if (campaign.executionEndsAt && new Date(campaign.executionEndsAt) <= new Date()) {
        await this._releaseClaim(recipient._id, { state: 'cancelled' });
        return { skipped: 'execution_ended' };
      }
      const gate = windowState(campaign.schedule || {});
      if (!gate.open && fresh.runMode !== 'immediate') {
        await this._releaseClaim(recipient._id, { deferMs: gate.delayMs });
        return { deferred: 'campaign_calling_hours' };
      }
    }
    const local = recipientWindow(recipient.country);
    if (!local.open && !audioVerificationTest && fresh.runMode !== 'immediate') {
      await CallCampaign.updateOne({ _id: campaign._id }, { $set: { waitReason: 'recipient_quiet_hours' } });
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
    const isPaired = campaign.transport === 'paired_phone';
    if (isPaired) {
      const lock = await pairedPhoneService.acquire(campaign.pairedDeviceId, { callId: callObjectId, recipientId: recipient._id, owner: campaign.createdBy, audioVerificationTest });
      if (!lock.ok) {
        await this._releaseClaim(recipient._id, { deferMs: Math.max(15_000, lock.retryInMs || 30_000) });
        recordCallMetric('dispatch', 'paired_device_not_ready');
        return { deferred: 'paired_device_not_ready', reasons: lock.reasons };
      }
    }
    const releaseDevice = () => (isPaired ? pairedPhoneService.release(campaign.pairedDeviceId, callObjectId) : Promise.resolve());
    const pointed = await CampaignRecipient.updateOne(
      { _id: recipient._id, state: 'dialing', attemptCount: recipient.attemptCount },
      { $inc: { attemptCount: 1 }, $set: { lastCallId: callObjectId, leaseUntil: new Date(Date.now() + DISPATCH_LEASE_MS) } },
    );
    if (!pointed.modifiedCount) {
      await releaseDevice();
      return { skipped: 'claim_lost' };
    }

    await CallRecord.create({
      _id: callObjectId,
      campaignId: campaign._id,
      recipientId: recipient._id,
      leadId: recipient.leadId,
      internalCallId,
      attemptNumber,
      isTest: campaign.isTest,
      provider: isPaired ? 'paired_phone' : 'livekit_sip',
      pairedDeviceId: isPaired ? campaign.pairedDeviceId : null,
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
    if (campaign.agentId) await CallCampaign.updateOne({ _id: campaign._id, startedAt: null }, { $set: { startedAt: new Date() } });
    const dispatchStarted = Date.now();
    const routed = await routeOutboundCall({
      to: recipient.phoneSnapshot, country: recipient.country, roomName, internalCallId, metadata,
      transport: isPaired ? 'paired_phone' : 'cloud_sip', pairedDeviceId: campaign.pairedDeviceId, callRecordId: callObjectId,
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
      await CallCampaign.updateOne({ _id: campaign._id }, { $set: { waitReason: null } });
      await CallRecord.updateOne({ _id: callObjectId, state: 'initiating' }, { $set: {
        state: 'ringing', provider: result.provider, providerCallId: result.providerCallId,
        fallbackFrom: result.fallbackFrom || null, fallbackReason: result.fallbackReason || null,
      } });
      // The live call now owns the recipient; no lease (the reconciler watches the call).
      await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { leaseUntil: null } });
      await refreshCampaignSummary(campaign._id);
      emitToOwner(campaign.createdBy, 'ai-calling:call', { campaignId: String(campaign._id), callId: internalCallId, state: 'ringing' });
      return { dialled: true, accepted: true, callId: internalCallId };
    }
    if (result.outcome === 'ambiguous') {
      await this._markAmbiguous(callObjectId, recipient._id, campaign, result.errorCode, result.errorMessage);
      return { dialled: true, ambiguous: true };
    }
    // Rejected. A permanent rejection (bad number, not configured, policy) is
    // terminal — retrying it only wastes attempts. A transient one may retry.
    await releaseDevice();
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
    const res = await CallRecord.updateOne({ _id: callId, resultsProcessedAt: null }, { $set: {
      state: 'needs_reconcile', reviewRequired: true, failureCode: code || 'AMBIGUOUS_DISPATCH', failureMessage: message || 'Ambiguous dispatch outcome',
      'reconciliation.needed': true, 'reconciliation.note': 'Ambiguous dispatch outcome — not retried automatically',
    } });
    // Processed meanwhile (its end report won the race): the recipient already holds the real outcome.
    if (!res.matchedCount) return false;
    await CampaignRecipient.updateOne({ _id: recipientId, lastCallId: callId }, { $set: { state: 'failed', leaseUntil: null, nextAttemptAt: null, finalDisposition: 'needs_reconcile' } });
    await refreshCampaignSummary(campaign._id);
    recordCallMetric('reconcile', 'ambiguous_parked');
    this._notifyParked(campaign, callId);
    return true;
  }

  _notifyParked(campaign, callId) {
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
   * The gateway lost track of a call that was already processed. A reached lead stays reached but
   * goes to review; anything else is parked and its scheduled retry withdrawn, so only the owner
   * can decide to call again (reconcileCall).
   */
  async _parkProcessedCall(callId, code, message) {
    const call = await CallRecord.findById(callId).lean();
    if (!call || call.state === 'needs_reconcile' || call.state === 'cancelled' || call.reconciliation?.resolvedAt) return;
    if (REACHED_DISPOSITIONS.includes(call.disposition)) {
      await CallRecord.updateOne({ _id: callId }, { $set: { reviewRequired: true, 'reconciliation.note': `${code}: ${message}`.slice(0, 500) } });
      return;
    }
    const parked = await CallRecord.updateOne({ _id: callId, state: { $ne: 'needs_reconcile' }, 'reconciliation.resolvedAt': null }, { $set: {
      state: 'needs_reconcile', disposition: 'needs_review', reviewRequired: true, failureCode: code, failureMessage: message,
      'reconciliation.needed': true, 'reconciliation.note': 'Outcome unknown after the call was processed — retry withdrawn',
    } });
    if (!parked.modifiedCount) return;
    await CampaignRecipient.updateOne(
      { _id: call.recipientId, lastCallId: call._id, state: { $in: ['retry_scheduled', 'exhausted', 'failed'] } },
      { $set: { state: 'failed', leaseUntil: null, nextAttemptAt: null, finalDisposition: 'needs_reconcile' } },
    );
    await refreshCampaignSummary(call.campaignId);
    recordCallMetric('reconcile', 'ambiguous_parked_late');
    const campaign = await CallCampaign.findById(call.campaignId).select('createdBy').lean();
    if (campaign) this._notifyParked(campaign, callId);
  }

  /** Paired phone gone silent about a call: park it (never redialed) and hold the device. */
  async _parkPairedSilent(call, code, message) {
    const campaign = await CallCampaign.findById(call.campaignId).lean();
    if (!campaign || !(await this._markAmbiguous(call._id, call.recipientId, campaign, code, message))) return;
    await pairedPhoneService.markAttention(call.pairedDeviceId, call._id, 'The gateway never reported how a call ended; check the phone, end any call by hand, then clear the device');
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
      if (call.state === 'initiating' && call.provider === 'paired_phone') {
        // Only the gateway dials, and only a queued call can be claimed: no queue entry → never dialed;
        // a queued one is cancelled atomically unless the gateway already claimed it.
        const neverQueued = !call.gateway?.state;
        const cancelled = neverQueued ? false : await pairedPhoneService.cancelUndialed(call, 'dispatch interrupted before the call was handed to the gateway');
        if (neverQueued) {
          await CallRecord.updateOne({ _id: call._id }, { $set: { state: 'cancelled', failureCode: 'NOT_DISPATCHED', failureMessage: 'Dispatch interrupted before the gateway got the call (recovered)', resultsProcessedAt: new Date(), endedAt: new Date() } });
          await CampaignRecipient.updateOne({ _id: r._id, state: 'dialing' }, { $set: { state: 'queued', leaseUntil: null }, $inc: { attemptCount: -1 } });
          await pairedPhoneService.release(call.pairedDeviceId, call._id);
          recovered += 1;
          continue;
        }
        if (cancelled) {
          recovered += 1;
          continue;
        }
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
      await CampaignRecipient.updateOne({ _id: recipient._id, ...NOT_PARKED }, { $set: {
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
      await CampaignRecipient.updateOne({ _id: recipient._id, ...NOT_PARKED }, { $set: { state: 'retry_scheduled', nextAttemptAt, leaseUntil: null, finalDisposition: disposition } });
    } else {
      const terminal = retryable ? 'exhausted' : 'failed';
      await CampaignRecipient.updateOne({ _id: recipient._id, ...NOT_PARKED }, { $set: { state: terminal, leaseUntil: null, finalDisposition: disposition } });
    }
  }

  // ------------------------------------------------- agent tool API (live call)
  async _loadCallForAgent(internalCallId, { mutable = false } = {}) {
    const call = await CallRecord.findOne({ internalCallId });
    if (!call) throw new NotFoundError('CallRecord', internalCallId);
    // Once a call is processed its answers are evidence; a late or replayed tool
    // call from the worker must not rewrite them.
    if (mutable && (call.resultsProcessedAt || call.endedAt || TERMINAL_CALL_STATES.has(call.state))) {
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
        { _id: call._id, resultsProcessedAt: null, endedAt: null, stateVersion: version || { $in: [0, null] } },
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
      persistTranscript: true,
      participantIdentity: call.provider === 'livekit_web' ? `admin-${call.createdBy}` : `sip-${internalCallId}`,
      agentConfig: campaign.agentConfig,
      disclosure: disclosureText(campaign.agentConfig || {}),
      systemPrompt: buildSystemPrompt({
        agentConfig: campaign.agentConfig, lead, objective: campaign.agentConfig?.objective,
        questions: [...(campaign.questionnaire?.questions || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
      }),
      leadContext: leadContext(lead),
      ...(campaign.agentConfig?.shareLeadNotes && lead?.notes ? { leadNotes: String(lead.notes).slice(0, 1000) } : {}),
      nextAction: this._serializeAction(engine.nextAction(campaign.questionnaire, state, { maxRepeats: engine.VOICE_QUESTION_REPEATS })),
    };
  }

  /** Save a completed speech turn from the authenticated voice worker. */
  async agentTranscript(internalCallId, { role, text, itemId = null, interrupted = false, at = null }) {
    const clean = String(text || '').trim().slice(0, 4000);
    if (!clean) return { stored: false };
    const now = new Date();
    const id = `${role}:${itemId || crypto.randomUUID()}`;
    const received = at ? new Date(at) : now;
    const spokenAt = Number.isFinite(received.getTime()) && Math.abs(received.getTime() - now.getTime()) < 24 * 3600_000 ? received : now;
    // Atomic deduplication handles network retries and concurrent deliveries.
    // Late final utterances may arrive just after the phone reports hang-up.
    const result = await CallRecord.findOneAndUpdate({
      internalCallId, 'transcript.itemId': { $ne: id },
      $or: [{ endedAt: null }, { endedAt: { $gte: new Date(now.getTime() - 5 * 60_000) } }],
    }, {
      $push: { transcript: { $each: [{ itemId: id, role, text: clean, interrupted, at: spokenAt }], $sort: { at: 1 }, $slice: -300 } },
      $inc: { transcriptVersion: 1 },
      $set: { transcriptUpdatedAt: now, transcriptExpiresAt: new Date(now.getTime() + 90 * 86400_000) },
    }, { returnDocument: 'after', projection: { _id: 1, campaignId: 1, createdBy: 1, transcriptVersion: 1 } }).lean();
    if (!result) return { stored: false };
    emitToOwner(result.createdBy, 'ai-calling:transcript', { campaignId: String(result.campaignId), recordId: String(result._id), callId: internalCallId, version: result.transcriptVersion });
    return { stored: true, version: result.transcriptVersion };
  }

  async agentActivity(internalCallId, { agentState, speaker }) {
    const call = await CallRecord.findOneAndUpdate({ internalCallId, resultsProcessedAt: null, endedAt: null }, {
      $set: { agentActivity: { agentState, speaker, at: new Date() } },
    }, { returnDocument: 'after', projection: { _id: 1, campaignId: 1, createdBy: 1 } }).lean();
    if (!call) return { stored: false };
    emitToOwner(call.createdBy, 'ai-calling:activity', { campaignId: String(call.campaignId), recordId: String(call._id), callId: internalCallId });
    return { stored: true };
  }

  /** The callee actually picked up (worker observed SIP callStatus=active). Idempotent. */
  async agentAnswered(internalCallId, at = new Date()) {
    const call = await CallRecord.findOneAndUpdate(
      { internalCallId, state: { $in: ['ringing', 'initiating'] }, resultsProcessedAt: null },
      { $set: { state: 'in_progress', answeredAt: at } },
      { returnDocument: 'after' },
    );
    if (!call) return { acknowledged: true, changed: false };
    if (!isTestProvider(call.provider)) {
      await CampaignRecipient.updateOne({ _id: call.recipientId, lastCallId: call._id }, { $set: { state: 'in_progress' } });
      // Keep the "In progress" figure in step with the live-call list (it was only refreshed at the end).
      await refreshCampaignSummary(call.campaignId);
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
    return { nextAction: this._serializeAction(engine.nextAction(campaign.questionnaire, state, { maxRepeats: engine.VOICE_QUESTION_REPEATS })) };
  }

  /** Idempotent question retry, including silence when the model has no speech turn to process. */
  async agentNoResponse(internalCallId, { fieldKey, requestId, reason }) {
    const { campaign, state } = await this._mutateConversation(internalCallId, (s, c) => {
      if (!s.disclosed || s.endedReason) throw new ConflictError('The questionnaire is not accepting responses');
      const seen = Object.entries(s.answers).find(([, value]) => value.noResponseIds?.includes(requestId));
      if (seen) {
        if (seen[0] !== fieldKey) throw new ConflictError('This retry event belongs to another question');
        return { state: s };
      }
      const action = engine.nextAction(c.questionnaire, s, { maxRepeats: engine.VOICE_QUESTION_REPEATS });
      if (!['ask', 'clarify', 'confirm'].includes(action.type) || action.question?.fieldKey !== fieldKey) throw new ConflictError('Only the current question may be repeated');
      return { state: engine.applyNoResponse(s, fieldKey, { requestId, reason, confirming: action.type === 'confirm' }) };
    });
    emitToOwner(campaign.createdBy, 'ai-calling:answer', { campaignId: String(campaign._id), callId: internalCallId, fieldKey, validation: 'invalid' });
    const nextAction = this._serializeAction(engine.nextAction(campaign.questionnaire, state, { maxRepeats: engine.VOICE_QUESTION_REPEATS }));
    return { nextAction, repeats: Math.min(engine.VOICE_QUESTION_REPEATS, state.answers[fieldKey]?.noResponseCount || 0), skipped: nextAction.question?.fieldKey !== fieldKey };
  }

  /** The constrained record_answer tool. Validation happens server-side; the model's value is untrusted. */
  async agentRecordAnswer(internalCallId, { fieldKey, rawAnswer }) {
    let validation = null;
    const { campaign, state } = await this._mutateConversation(internalCallId, (s, c) => {
      const question = (c.questionnaire.questions || []).find((q) => q.fieldKey === fieldKey);
      if (!question) throw new ValidationError(`Unknown question: ${fieldKey}`);
      if (!s.disclosed) throw new ConflictError('Deliver the AI disclosure (disclose tool) before recording answers');
      if (s.endedReason) throw new ConflictError('The conversation has ended; no more answers may be collected');
      if (!engine.conditionMet(question.condition, s.answers || {})) throw new ConflictError('The question condition is not met');
      const result = validateAnswer(question, rawAnswer);
      validation = result.validation;
      return { state: engine.applyAnswer(s, fieldKey, { ...result, rawAnswer, confirmed: false }) };
    });
    emitToOwner(campaign.createdBy, 'ai-calling:answer', { campaignId: String(campaign._id), callId: internalCallId, fieldKey, validation });
    return { accepted: true, validation, nextAction: this._serializeAction(engine.nextAction(campaign.questionnaire, state, { maxRepeats: engine.VOICE_QUESTION_REPEATS })) };
  }

  /** Capture several explicitly volunteered answers in one speech turn atomically. */
  async agentRecordAnswers(internalCallId, { answers }) {
    let validations;
    const { campaign, state } = await this._mutateConversation(internalCallId, (s, c) => {
      if (!s.disclosed) throw new ConflictError('Deliver the AI disclosure before recording answers');
      if (s.endedReason) throw new ConflictError('The conversation has ended; no more answers may be collected');
      const questions = new Map((c.questionnaire.questions || []).map(q => [q.fieldKey, q]));
      const supplied = new Map(answers.map(answer => [answer.fieldKey, answer.rawAnswer]));
      if (supplied.size !== answers.length) throw new ValidationError('Each question may appear only once');
      for (const fieldKey of supplied.keys()) if (!questions.has(fieldKey)) throw new ValidationError(`Unknown question: ${fieldKey}`);
      validations = [];
      let next = s;
      for (const question of [...questions.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) {
        if (!supplied.has(question.fieldKey)) continue;
        if (!engine.conditionMet(question.condition, next.answers || {})) {
          validations.push({ fieldKey: question.fieldKey, accepted: false, reason: 'condition_not_met' });
          continue;
        }
        const rawAnswer = supplied.get(question.fieldKey);
        const result = validateAnswer(question, rawAnswer);
        // A correction to a critical value must be read back again.
        next = engine.applyAnswer(next, question.fieldKey, { ...result, rawAnswer, confirmed: false });
        validations.push({ fieldKey: question.fieldKey, accepted: true, validation: result.validation });
      }
      return { state: next };
    });
    emitToOwner(campaign.createdBy, 'ai-calling:answer', { campaignId: String(campaign._id), callId: internalCallId });
    return { accepted: true, validations, nextAction: this._serializeAction(engine.nextAction(campaign.questionnaire, state, { maxRepeats: engine.VOICE_QUESTION_REPEATS })) };
  }

  async agentMarkUnknown(internalCallId, { fieldKey }) {
    return this.agentRecordAnswer(internalCallId, { fieldKey, rawAnswer: '' });
  }

  /**
   * A critical answer was read back and confirmed. When the agent passes the person's
   * reply (the worker passes the transcript, not the model's paraphrase), it must be a
   * clear yes: "thanks, bye" is not a confirmation. After the original read-back and three repeats without confirmation the
   * call moves on and the answer stays unconfirmed for a person to check — never a loop.
   */
  async agentConfirm(internalCallId, { fieldKey, reply = null, requestId }) {
    const { campaign, state } = await this._mutateConversation(internalCallId, (s, c) => {
      if (!s.disclosed || s.endedReason) throw new ConflictError('The questionnaire is not accepting responses');
      if (requestId) {
        const seen = Object.entries(s.answers).find(([, entry]) => entry.confirmResponseIds?.includes(requestId));
        if (seen) {
          if (seen[0] !== fieldKey) throw new ConflictError('This confirmation event belongs to another question');
          return { state: s };
        }
      }
      const action = engine.nextAction(c.questionnaire, s, { maxRepeats: engine.VOICE_QUESTION_REPEATS });
      if (action.type !== 'confirm' || action.question?.fieldKey !== fieldKey) throw new ConflictError('Only the current read-back can be confirmed');
      const entry = { ...s.answers[fieldKey] };
      if (requestId) entry.confirmResponseIds = [...(entry.confirmResponseIds || []), requestId].slice(-12);
      if (reply != null && isConfirmation(reply)) entry.confirmed = true;
      else {
        entry.confirmRejections = (entry.confirmRejections || 0) + 1;
        if (engine.confirmationMisses(entry) > engine.VOICE_QUESTION_REPEATS) entry.confirmSkipped = true;
      }
      return { state: { ...s, answers: { ...s.answers, [fieldKey]: entry } } };
    });
    const entry = state.answers[fieldKey];
    emitToOwner(campaign.createdBy, 'ai-calling:answer', { campaignId: String(campaign._id), callId: internalCallId, fieldKey });
    return { confirmed: Boolean(entry.confirmed), skipped: Boolean(entry.confirmSkipped), nextAction: this._serializeAction(engine.nextAction(campaign.questionnaire, state, { maxRepeats: engine.VOICE_QUESTION_REPEATS })) };
  }

  /** Clear one answer so the question is asked again (customer edits an answer before submitting). */
  async agentResetAnswer(internalCallId, { fieldKey }) {
    const { campaign, state } = await this._mutateConversation(internalCallId, (s, c) => {
      if (!(c.questionnaire.questions || []).some((q) => q.fieldKey === fieldKey)) throw new ValidationError(`Unknown question: ${fieldKey}`);
      const answers = { ...s.answers };
      delete answers[fieldKey];
      return { state: { ...s, answers } };
    });
    return { state, nextAction: this._serializeAction(engine.nextAction(campaign.questionnaire, state, { maxRepeats: engine.VOICE_QUESTION_REPEATS })) };
  }

  async agentRequestCallback(internalCallId, { when, note, human = false }) {
    await this._mutateConversation(internalCallId, (s) => ({
      state: {
        ...engine.endConversation(s, 'callback_requested'),
        control: { callbackRequestedAt: when || null, callbackText: note || null, ...(human ? { humanRequested: true } : {}) },
      },
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
  async agentEndCall(internalCallId, { disposition = null, durationSeconds = null, transcriptRef = null, cost = null, failureCode = null, failureMessage = null, callNotes = null } = {}) {
    const { call, campaign } = await this._loadCallForAgent(internalCallId);
    // A provider may finish first. A late agent recap enriches the notes once,
    // without reapplying outcomes or replacing an earlier agent recap.
    if (call.resultsProcessedAt && callNotes) {
      const notes = buildCallNotes({ campaign, call, answers: call.answers || [], disposition: call.disposition || 'needs_review', agentNotes: callNotes });
      notes.blockers = [...new Set([...notes.blockers, ...(call.callNotes?.blockers || [])])].slice(0, 20);
      await CallRecord.updateOne({ _id: call._id, 'callNotes.source': { $ne: 'ai_agent' } }, { $set: { callNotes: notes } });
    }
    if (failureMessage && !call.resultsProcessedAt && !call.failureMessage) {
      await CallRecord.updateOne({ _id: call._id, failureMessage: null }, { $set: { failureCode: failureCode || 'AGENT_FAILED', failureMessage } });
    }
    // (Already parked: nothing to wait for; processing saves the answers and keeps it parked.)
    if (call.provider === 'paired_phone' && !call.resultsProcessedAt && call.state !== 'needs_reconcile'
      && PAIRED_GATEWAY_LIVE.has(call.gateway?.state)) {
      return this._deferPairedEnd(call, { disposition, durationSeconds, transcriptRef, cost, callNotes });
    }
    return this.processCallResults(call._id, { disposition, durationSeconds, transcriptRef, cost, callNotes, source: 'agent_end' });
  }

  /**
   * Paired phone: only the gateway knows how the phone call ended. The agent leaving (its goodbye,
   * the phone leg vanishing on a USB unplug, a human takeover) is no evidence that the line is
   * down, so its /end is kept as a hint for processCallResults and the room is closed: the gateway
   * then hangs up and reports, or the reconciler parks the call if it never does.
   */
  async _deferPairedEnd(call, hint) {
    if (call.gateway?.state === 'queued') {
      // Not claimed yet: withdraw it from the gateway atomically. Nothing was dialed; the attempt
      // still counts (retry policy) so an agent that keeps failing cannot loop forever.
      const pulled = await CallRecord.updateOne(
        { _id: call._id, 'gateway.state': 'queued', resultsProcessedAt: null },
        { $set: { 'gateway.state': 'cancelled', 'gateway.endReason': 'agent_ended_before_claim', failureCode: 'AGENT_ENDED_BEFORE_DIAL', failureMessage: 'The voice agent ended before the phone dialed; nothing was dialed' } },
      );
      if (pulled.modifiedCount) return this.processCallResults(call._id, { disposition: 'failed', callNotes: hint.callNotes, source: 'agent_end' });
    }
    await CallRecord.updateOne(
      { _id: call._id, resultsProcessedAt: null, 'agentEnd.at': null },
      { $set: { agentEnd: {
        at: new Date(), disposition: hint.disposition || null, durationSeconds: hint.durationSeconds ?? null,
        transcriptRef: hint.transcriptRef || null, cost: hint.cost || null,
        ...(hint.callNotes ? { callNotes: { ...hint.callNotes, source: 'ai_agent', generatedAt: new Date() } } : {}),
      } } },
    );
    if (call.roomName && typeof livekit.endCall === 'function') livekit.endCall({ roomName: call.roomName }).catch(() => {});
    return { deferred: true, callId: call.internalCallId };
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
  async processCallResults(callId, { disposition = null, durationSeconds = null, transcriptRef = null, recordingRef = null, cost = null, callNotes = null, source = 'system' } = {}) {
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
    // Paired phone: the agent's deferred /end (see _deferPairedEnd) fills in what this caller didn't report.
    const hint = call.agentEnd || {};
    const reported = {
      disposition: disposition ?? hint.disposition ?? null,
      durationSeconds: durationSeconds ?? hint.durationSeconds ?? null,
      transcriptRef: transcriptRef ?? hint.transcriptRef ?? null,
      cost: cost ?? hint.cost ?? null,
    };
    const gw = call.gateway || {};
    const state = engine.normalizeState(call.conversationState);
    // Already parked as ambiguous (e.g. the paired-phone gateway lost the call): a later end report
    // (agent /end, webhook) must not turn it into no_answer/completed, which could schedule a
    // redial or move the lead. Keep it parked; save what was collected for the human review.
    const parkedAmbiguous = call.state === 'needs_reconcile';
    const control = state.control || {};
    const prog = engine.progress(campaign.questionnaire, state);

    const requiredGaps = (campaign.questionnaire.questions || []).filter(q => q.required && engine.conditionMet(q.condition, state.answers || {}) && (state.answers?.[q.fieldKey]?.validation !== 'valid' || q.confirmCritical && !state.answers?.[q.fieldKey]?.confirmed)).map(q => q.fieldKey);

    // A re-run after a crash reuses the disposition persisted by the first run.
    let finalDisposition = call.disposition || sanitizeReportedDisposition(reported.disposition, call);
    if (!finalDisposition) {
      if (state.endedReason === 'do_not_contact') finalDisposition = 'do_not_contact';
      else if (state.endedReason === 'callback_requested') finalDisposition = 'callback_requested';
      else if (state.endedReason === 'declined') finalDisposition = 'declined';
      else if (requiredGaps.length === 0 && prog.total > 0 && prog.valid > 0) finalDisposition = 'answered_completed';
      else if (prog.answered > 0) finalDisposition = 'answered_partial';
      // Reached a human who heard the disclosure, then hung up: they were reached
      // (don't redial as if unanswered), but nothing qualifies → review.
      else if (state.disclosed) finalDisposition = 'answered_partial';
      else finalDisposition = 'no_answer';
    }
    // Paired phone: a person took the answered call over on the handset. The lead was reached,
    // whatever the AI collected or the line reported afterwards (no_answer/failed would redial).
    if (gw.takenOverAt && !REACHED_DISPOSITIONS.includes(finalDisposition)) finalDisposition = 'answered_partial';
    // Paired phone: answered, then our side failed (agent gone, call audio failed) before anything
    // was collected. That is a failed call, not an unanswered one.
    let systemFailure = null;
    if (finalDisposition === 'no_answer' && call.provider === 'paired_phone' && (call.answeredAt || gw.audioOpenedAt)
      && PAIRED_SYSTEM_END_REASONS.has(gw.endReason)) {
      finalDisposition = 'failed';
      systemFailure = `PAIRED_${gw.endReason.toUpperCase()}`;
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
        clarifications: entry.clarifications || 0, noResponseCount: entry.noResponseCount || 0, reason: entry.reason || null, source: 'agent_tool',
        reviewStatus: entry.validation === 'valid' ? 'none' : 'pending',
      });
      if (entry.validation === 'valid') validValues[q.fieldKey] = entry.normalizedValue;
    }

    const outcome = evaluateOutcome({
      statusRules: campaign.statusRules, answers: validValues, disposition: finalDisposition,
      hasUnresolvedRequired: requiredGaps.length > 0, control,
    });

    const reached = REACHED_DISPOSITIONS.includes(finalDisposition);
    // A parked (uncertain) call is never "no answer"/"failed" in the figures: nobody knows yet.
    if (parkedAmbiguous && !reached) finalDisposition = 'needs_review';
    const callState = reached ? 'completed'
      : (['no_answer', 'busy', 'voicemail'].includes(finalDisposition) ? finalDisposition : 'failed');

    // 1. Persist the call record (authoritative, retained even if later steps fail).
    const endedAt = call.endedAt || now;
    const measured = call.answeredAt ? Math.max(0, Math.round((endedAt - call.answeredAt) / 1000)) : 0;
    call.state = parkedAmbiguous ? 'needs_reconcile' : callState;
    call.disposition = finalDisposition;
    call.qualification = outcome.qualification;
    call.answers = answerDocs;
    // Paired phone: lost call audio or a human takeover means the AI's record is incomplete.
    call.reviewRequired = outcome.requiresReview || parkedAmbiguous || Boolean(gw.audioLostAt || gw.takenOverAt || gw.command?.kind === 'takeover');
    if (systemFailure && !call.failureCode) {
      call.failureCode = systemFailure;
      call.failureMessage = `The call was answered, then ended by the gateway (${gw.endReason}) before the AI collected anything`;
    }
    call.durationSeconds = reported.durationSeconds != null ? reported.durationSeconds : (call.durationSeconds || measured);
    if (reported.transcriptRef) call.transcriptRef = reported.transcriptRef;
    if (recordingRef) call.recordingRef = recordingRef;
    call.cost = estimateCallCost(call, reported.cost);
    call.endedAt = endedAt;
    // Always keep a recap, even on disconnects or provider-driven completion.
    call.callNotes = buildCallNotes({
      campaign, call, answers: answerDocs, disposition: finalDisposition,
      unresolvedRequired: requiredGaps,
      agentNotes: callNotes || hint.callNotes || (call.callNotes?.source === 'ai_agent' ? call.callNotes : null), now,
    });
    await call.save();

    // 2. CRM side-effects only for real campaign calls (never browser/test calls).
    if (!campaign.isTest && !isTestProvider(call.provider) && !parkedAmbiguous) {
      await this._applyOutcomeToLead({ call, campaign, recipient, outcome, disposition: finalDisposition });
    }

    // 3. Recipient terminal state / retry (web tests never touch the recipient; an ambiguous call
    //    already parked its recipient as failed/needs_reconcile: only a human may retry it).
    if (recipient && !isTestProvider(call.provider) && !parkedAmbiguous) await this._finalizeRecipient(campaign, recipient, call);

    // 4. Stamp processed — from here every other finisher is a no-op.
    await CallRecord.updateOne({ _id: call._id }, { $set: { resultsProcessedAt: new Date(), processingLeaseUntil: null } });
    // A park that landed while this run held the claim (gateway outcome_unknown, reconciler) wins;
    // _finalizeRecipient already refused to overwrite the parked recipient.
    if (!parkedAmbiguous) {
      await CallRecord.updateOne(
        { _id: call._id, 'reconciliation.needed': true, 'reconciliation.resolvedAt': null, state: { $ne: 'needs_reconcile' } },
        { $set: { state: 'needs_reconcile', reviewRequired: true, ...(reached ? {} : { disposition: 'needs_review' }) } },
      );
    }
    if (call.pairedDeviceId) await pairedPhoneService.release(call.pairedDeviceId, call._id, { endedAt });

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
      set.lastContactChannel = call.provider === 'web_link' ? 'sms' : 'phone';
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
      // "Don't contact me" also stops every SMS to this number (link reminders included).
      if (recipient.phoneSnapshot) {
        await MessageSuppression.updateOne(
          { channel: 'sms', destinationHash: destinationHash('sms', recipient.phoneSnapshot) },
          { $setOnInsert: { leadId: lead._id, reason: 'opt_out', source: call.provider === 'web_link' ? 'link_assistant' : 'ai_call', suppressedAt: new Date(), createdBy: campaign.createdBy } },
          { upsert: true },
        );
      }
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
    }).sort({ initiatedAt: 1 }).limit(100).select({ transcript: { $slice: -30 } }).populate('leadId', 'leadNumber name').lean();

    const now = Date.now();
    return calls.map((c) => {
      const state = c.conversationState || engine.initConversationState();
      const prog = engine.progress(campaign.questionnaire, state);
      const action = engine.nextAction(campaign.questionnaire, state, { maxRepeats: engine.VOICE_QUESTION_REPEATS });
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
        answered: prog.valid,
        total: prog.total,
        agentName: campaign.agentSnapshot?.name || campaign.agentConfig?.agentName || 'AI agent',
        agentActivity: c.agentActivity || null,
        transcriptPreview: c.transcript || [],
        transcriptVersion: c.transcriptVersion || 0,
        elapsedSeconds: startedAt ? Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 1000)) : 0,
        isTest: c.isTest,
        transport: c.provider === 'paired_phone' ? 'paired_phone' : 'cloud_sip',
        gateway: c.provider === 'paired_phone' ? {
          state: c.gateway?.state || null,
          audioOpen: Boolean(c.gateway?.audioOpenedAt) && !c.gateway?.audioLostAt,
          audioLost: Boolean(c.gateway?.audioLostAt),
          takenOver: Boolean(c.gateway?.takenOverAt),
          command: c.gateway?.command?.kind || null,
          audio: c.gateway?.audio || null,
          audioAgeSeconds: c.gateway?.audioAt ? Math.round((now - new Date(c.gateway.audioAt).getTime()) / 1000) : null,
        } : null,
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
    // Expiry removes conversation text without deleting the call audit record.
    await CallRecord.updateMany({ transcriptExpiresAt: { $lte: now }, 'transcript.0': { $exists: true } }, { $set: { transcript: [] } });

    // 0. Paired phone: the agent left, and the gateway never said how the phone call ended.
    const unreported = await CallRecord.find({
      provider: 'paired_phone', resultsProcessedAt: null, state: { $in: ['initiating', 'ringing', 'in_progress'] },
      'agentEnd.at': { $lt: new Date(nowMs - PAIRED_END_GRACE_MS) },
    }).select('_id campaignId recipientId pairedDeviceId').limit(limit).lean();
    for (const c of unreported) {
      // A person still on the phone (taken over) keeps the call open; the gateway reports its end.
      if (await pairedPhoneService.phoneStillInCall(c.pairedDeviceId, c._id, now)) { results.stillLive += 1; continue; }
      await this._parkPairedSilent(c, 'GATEWAY_NO_END_REPORT', 'The voice agent left, but the paired-phone gateway never reported how the phone call ended');
      results.parked += 1;
    }

    // 1. Ringing/initiating long past any ring timeout. Ask the provider first:
    //    a room that still has the SIP leg is a live call we must not touch.
    const ringing = await CallRecord.find({
      resultsProcessedAt: null, initiatedAt: { $lt: new Date(nowMs - RING_GRACE_MS) },
      // 'initiating' without dispatchStartedAt never reached the provider; the
      // dispatch-lease recovery owns those.
      $or: [{ state: 'ringing' }, { state: 'initiating', dispatchStartedAt: { $ne: null } }],
    }).select('_id roomName recipientId campaignId provider').limit(limit).lean();
    for (const c of ringing) {
      if (c.provider === 'paired_phone') {
        const full = await CallRecord.findById(c._id).lean();
        if (full?.gateway?.state === 'queued' && await pairedPhoneService.cancelUndialed(full, 'gateway never claimed the call')) {
          results.reclaimed += 1;
          continue;
        }
      }
      const room = await roomStatus(c.roomName);
      if (room === 'gone' && c.provider === 'paired_phone') {
        // The gateway left without reporting how the call ended: it may have reached the lead.
        const campaign = await CallCampaign.findById(c.campaignId).lean();
        if (campaign) await this._markAmbiguous(c._id, c.recipientId, campaign, 'GATEWAY_SILENT', 'The paired-phone gateway disappeared without reporting the call outcome');
        const pd = await CallRecord.findById(c._id).select('pairedDeviceId').lean();
        await pairedPhoneService.markAttention(pd?.pairedDeviceId, c._id, 'The gateway disappeared during a call; check the phone, then clear the device');
        results.parked += 1;
        continue;
      }
      if (room === 'live') { results.stillLive += 1; continue; }
      if (room === 'gone') {
        await this.processCallResults(c._id, { disposition: 'no_answer', source: 'reconcile' })
          .catch((e) => logger.warn('reconcile no_answer failed', { module: 'ai-calling', callId: String(c._id), error: e.message }));
        results.noAnswer += 1;
      } else {
        // Provider state unknown → we cannot prove the lead was not reached.
        const campaign = await CallCampaign.findById(c.campaignId).lean();
        if (campaign && !isTestProvider(c.provider)) {
          await this._markAmbiguous(c._id, c.recipientId, campaign, 'PROVIDER_STATE_UNKNOWN', 'Call never reported an outcome and the provider could not be queried');
        } else {
          await CallRecord.updateOne({ _id: c._id }, { $set: { state: 'needs_reconcile', 'reconciliation.needed': true } });
        }
        results.parked += 1;
      }
    }

    // 1b. Paired-phone calls still queued for a gateway that never claimed them: never dialed.
    const unclaimed = await CallRecord.find({
      provider: 'paired_phone', 'gateway.state': 'queued', resultsProcessedAt: null,
      'gateway.queuedAt': { $lt: new Date(nowMs - 90_000) },
    }).limit(limit).lean();
    for (const c of unclaimed) {
      if (await pairedPhoneService.cancelUndialed(c, 'gateway never claimed the call')) results.reclaimed += 1;
    }

    // 2. in_progress calls past max duration + grace → process what we have (and hang up).
    const active = await CallRecord.find({ state: 'in_progress', resultsProcessedAt: null })
      .select('_id campaignId recipientId provider pairedDeviceId answeredAt initiatedAt createdAt').limit(limit).lean();
    for (const c of active) {
      const campaign = await CallCampaign.findById(c.campaignId).select('agentConfig').lean();
      const maxMs = ((campaign?.agentConfig?.maxCallSeconds || 300) + 120) * 1000;
      const started = new Date(c.answeredAt || c.initiatedAt || c.createdAt).getTime();
      if (nowMs - started > maxMs && c.provider === 'paired_phone') {
        // The gateway hangs up at its own limit and reports it; silence past that is an unknown outcome.
        if (await pairedPhoneService.phoneStillInCall(c.pairedDeviceId, c._id, now)) { results.stillLive += 1; continue; }
        await this._parkPairedSilent(c, 'GATEWAY_NO_END_REPORT', 'The call passed its maximum length without an end report from the paired-phone gateway');
        results.parked += 1;
        continue;
      }
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
  async monitorCall(callId, actor) {
    const call = await CallRecord.findOne({ _id: callId, createdBy: actor }).lean();
    if (!call) throw new NotFoundError('CallRecord', callId);
    if (call.endedAt || call.resultsProcessedAt || !['initiating', 'ringing', 'in_progress'].includes(call.state)) throw new ConflictError('This call is no longer live');
    if (!call.roomName || call.gateway?.takenOverAt || call.gateway?.audioLostAt) throw new ConflictError('Live audio is unavailable for this call');
    if (call.provider === 'paired_phone') {
      const gateway = await PairedDevice.exists({ _id: call.pairedDeviceId, createdBy: actor, revokedAt: null, 'gateway.monitorSafe': true, lastHeartbeatAt: { $gte: new Date(Date.now() - 30_000) } });
      if (!gateway) throw new ServiceUnavailableError('Update or reconnect the phone gateway before listening to this call');
    }
    if (typeof livekit.issueJoinToken !== 'function') throw new ServiceUnavailableError('Live audio monitoring is not configured');
    const token = livekit.issueJoinToken({ roomName: call.roomName, identity: `monitor-${actor}-${crypto.randomUUID()}`, name: 'Call listener', ttlSeconds: 120, canPublish: false });
    if (!token || !livekit.wsUrl) throw new ServiceUnavailableError('Live audio monitoring is not configured');
    return { url: livekit.wsUrl, token, roomName: call.roomName, callId: String(call._id) };
  }

  async getCall(callId, actor) {
    const call = await CallRecord.findOne({ _id: callId, createdBy: actor })
      .populate('campaignId', 'name agentSnapshot agentConfig questionnaire questionnaireVersion').populate('leadId', 'leadNumber name phone mobile email status').lean();
    if (!call) throw new NotFoundError('CallRecord', callId);
    const campaign = call.campaignId;
    if (campaign) {
      const state = engine.normalizeState(call.conversationState);
      const action = engine.nextAction(campaign.questionnaire, state, { maxRepeats: engine.VOICE_QUESTION_REPEATS });
      const prog = engine.progress(campaign.questionnaire, state);
      call.callContext = {
        agentName: campaign.agentSnapshot?.name || campaign.agentConfig?.agentName || 'AI agent',
        objective: campaign.agentConfig?.objective || '',
        phase: action.type, currentQuestion: action.question?.text || null,
        answered: prog.valid, total: prog.total,
        questions: (campaign.questionnaire?.questions || []).map(q => ({ fieldKey: q.fieldKey, label: q.label, text: q.text, required: q.required })),
      };
      if (!call.resultsProcessedAt) call.answers = (campaign.questionnaire?.questions || []).flatMap(q => {
        const answer = state.answers?.[q.fieldKey];
        return answer ? [{ questionFieldKey: q.fieldKey, label: q.label, type: q.type, rawAnswer: answer.rawAnswer || '', normalizedValue: answer.normalizedValue, validation: answer.validation, noResponseCount: answer.noResponseCount || 0, reason: answer.reason || null, confirmed: Boolean(answer.confirmed), source: 'agent_tool' }] : [];
      });
    }
    if (call.transcriptExpiresAt && call.transcriptExpiresAt <= new Date()) call.transcript = [];
    Object.assign(call, conversationInsights({
      questionnaire: campaign?.questionnaire, state: call.conversationState, answers: call.answers, transcript: call.transcript,
      disposition: call.disposition, terminal: Boolean(call.endedAt || call.resultsProcessedAt || TERMINAL_CALL_STATES.has(call.state)),
      incomplete: Boolean(call.gateway?.audioLostAt || call.gateway?.takenOverAt || call.reconciliation?.needed),
    }));
    return call;
  }

  /**
   * Owner-scoped, filterable call history for the operations UI. The list is a
   * bounded summary; full answers and reconciliation controls remain on getCall.
   */
  async listCalls(actor, {
    page = 1,
    limit = 20,
    campaignId,
    state,
    disposition,
    reviewRequired,
    search = '',
    includeTests = false,
  } = {}) {
    const filter = { createdBy: actor };
    if (!includeTests) Object.assign(filter, NOT_WEB_TEST, { isTest: { $ne: true } });
    if (campaignId) filter.campaignId = campaignId;
    if (state) filter.state = state;
    if (disposition) filter.disposition = disposition;
    if (reviewRequired !== undefined) filter.reviewRequired = reviewRequired;

    const term = String(search || '').trim();
    if (term) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      const [leadIds, campaignIds] = await Promise.all([
        Lead.find({ $or: [{ name: regex }, { leadNumber: regex }] }).distinct('_id'),
        CallCampaign.find({ createdBy: actor, name: regex }).distinct('_id'),
      ]);
      filter.$or = [
        { leadId: { $in: leadIds } },
        { campaignId: { $in: campaignIds } },
        { internalCallId: regex },
      ];
    }

    const [data, total] = await Promise.all([
      CallRecord.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select('internalCallId attemptNumber state disposition qualification durationSeconds reviewRequired provider failureCode failureMessage reconciliation initiatedAt answeredAt endedAt createdAt campaignId leadId')
        .populate('campaignId', 'name')
        .populate('leadId', 'leadNumber name')
        .lean(),
      CallRecord.countDocuments(filter),
    ]);
    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async historyForLead(leadId, actor, { page = 1, limit = 25 } = {}) {
    const filter = { leadId, createdBy: actor };
    const [data, total, transitions] = await Promise.all([
      CallRecord.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).select('-transcript').populate('campaignId', 'name').lean(),
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
    if (action && campaign && !campaign.isTest && !isTestProvider(call.provider) && qualification !== previousQualification) {
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

  /**
   * The owner resolves a call whose outcome is unknown (parked as needs_reconcile), after checking
   * the phone's call log or speaking to the lead. This is the only way such a call leaves review:
   *   reached     → the lead was reached: completed (with an optional qualification applied to the lead);
   *   not_reached → closed as not reached, no further calls;
   *   retry       → not reached, call again (queued; the campaign's own gates apply at dial time).
   * One resolution per call (atomic); audited.
   */
  async reconcileCall(callId, actor, { resolution, qualification = null, note = '' } = {}, meta = {}) {
    if (!mongoose.isValidObjectId(callId)) throw new NotFoundError('CallRecord', callId);
    const call = await CallRecord.findOne({ _id: callId, createdBy: actor });
    if (!call) throw new NotFoundError('CallRecord', callId);
    if (call.state !== 'needs_reconcile' || call.reconciliation?.resolvedAt) {
      throw new ConflictError('Only a call with an unknown outcome can be reconciled, and only once');
    }
    if (call.provider === 'paired_phone' && await pairedPhoneService.phoneStillInCall(call.pairedDeviceId, call._id)) {
      throw new ConflictError('The paired phone still reports a call. End it on the phone first');
    }
    const campaign = await CallCampaign.findById(call.campaignId);
    if (resolution === 'retry' && (!campaign || campaign.status === 'cancelled')) throw new ConflictError('A cancelled campaign cannot call again');

    const now = new Date();
    const claimed = await CallRecord.updateOne(
      { _id: call._id, state: 'needs_reconcile', 'reconciliation.resolvedAt': null },
      { $set: { 'reconciliation.resolvedAt': now, 'reconciliation.resolvedBy': actor, 'reconciliation.resolution': resolution, ...(note ? { 'reconciliation.note': String(note).slice(0, 500) } : {}) } },
    );
    if (!claimed.modifiedCount) throw new ConflictError('This call was reconciled meanwhile');
    // Parked before any end report: save what the AI collected first (stays parked, frees the device lock).
    if (!call.resultsProcessedAt) await this.processCallResults(call._id, { source: 'reconcile' });

    const fresh = await CallRecord.findById(call._id);
    const recipient = await CampaignRecipient.findById(fresh.recipientId);
    const isLatest = recipient && String(recipient.lastCallId) === String(fresh._id);
    let leadTransition = null;
    if (resolution === 'reached') {
      fresh.state = 'completed';
      if (!REACHED_DISPOSITIONS.includes(fresh.disposition)) fresh.disposition = 'answered_partial';
      if (qualification) fresh.qualification = qualification;
      fresh.reviewRequired = !qualification; // answers still to be checked unless the owner settled it
      await fresh.save();
      if (isLatest) {
        await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { state: 'completed', leaseUntil: null, nextAttemptAt: null, finalDisposition: fresh.disposition, qualification: fresh.qualification } });
      }
      const action = ({ qualified: 'mark_qualified', unqualified: 'mark_unqualified', do_not_contact: 'mark_do_not_contact', callback: 'schedule_callback' })[qualification];
      if (action && campaign && !campaign.isTest && !isTestProvider(fresh.provider)) {
        leadTransition = await this._applyOutcomeToLead({
          call: fresh, campaign, recipient,
          outcome: { qualification, action, ruleId: null, reason: 'reconciled', requiresReview: false, callback: null },
          disposition: fresh.disposition, actorType: 'user', actorId: actor,
        });
      }
    } else {
      fresh.state = 'failed';
      fresh.disposition = 'no_answer';
      fresh.reviewRequired = false;
      await fresh.save();
      if (isLatest) {
        await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: resolution === 'retry'
          ? { state: 'queued', leaseUntil: null, nextAttemptAt: null, finalDisposition: null }
          : { state: 'failed', leaseUntil: null, nextAttemptAt: null, finalDisposition: 'no_answer' } });
      }
      if (resolution === 'retry' && isLatest && ['completed', 'running'].includes(campaign.status)) {
        if (campaign.status === 'completed') {
          await CallCampaign.updateOne({ _id: campaign._id, status: 'completed' }, { $set: { status: 'running', completedAt: null } });
        }
        await this._scheduleTick(campaign._id, 0);
      }
    }
    await refreshCampaignSummary(fresh.campaignId);
    auditService.logEvent({
      eventType: 'ai_calling.call.reconciled', userId: actor, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent,
      result: 'success', module: 'ai-calling', details: { callId: fresh.internalCallId, resolution, qualification, leadTransition },
    });
    emitToOwner(actor, 'ai-calling:call', { campaignId: String(fresh.campaignId), callId: fresh.internalCallId, state: fresh.state, disposition: fresh.disposition });
    return fresh.toObject();
  }

  async retryRecipients(campaignId, actor, { recipientIds = [] } = {}, meta = {}) {
    const campaign = await CallCampaign.findOne({ _id: campaignId, createdBy: actor });
    if (!campaign) throw new NotFoundError('CallCampaign', campaignId);
    if (campaign.executionEndsAt && campaign.executionEndsAt <= new Date()) throw new ConflictError('This campaign execution period has ended. Launch a new campaign from the agent to retry');
    // Uncertain outcomes are excluded: the lead may have been reached. They are resolved one by one
    // (reconcileCall), which is also where the owner can choose to call again.
    const filter = { campaignId, 'eligibility.eligible': true, state: { $in: ['exhausted', 'failed'] }, ...NOT_PARKED };
    if (recipientIds.length) filter._id = { $in: recipientIds };
    if (['cancelled'].includes(campaign.status)) throw new ConflictError('A cancelled campaign cannot be retried');
    const result = await CampaignRecipient.updateMany(filter, { $set: { state: 'queued', nextAttemptAt: null, leaseUntil: null, finalDisposition: null } });
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
      const action = engine.nextAction(campaign.questionnaire, s, { maxRepeats: engine.VOICE_QUESTION_REPEATS });
      if (action.type === 'ask' || action.type === 'clarify') {
        const result = validateAnswer(action.question, userText);
        s = engine.applyAnswer(s, action.question.fieldKey, { ...result, rawAnswer: userText });
      } else if (action.type === 'confirm') {
        s = /^(y|yes|correct|right|ja)/i.test(userText.trim())
          ? engine.markConfirmed(s, action.question.fieldKey)
          : engine.applyAnswer(s, action.question.fieldKey, { validation: 'invalid', normalizedValue: null, rawAnswer: userText });
      }
    }

    const next = engine.nextAction(campaign.questionnaire, s, { maxRepeats: engine.VOICE_QUESTION_REPEATS });
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
    // CreateDispatch succeeds even when no worker is online; fail now with the
    // real cause instead of letting the tester wait in an empty room.
    const worker = await livekit.waitForAgentWorker({ roomName });
    if (worker === 'no_worker' || worker === 'failed') {
      const failureMessage = worker === 'failed'
        ? 'The voice agent worker accepted the test but failed to start it. Check the agent worker logs (OpenAI key / model) and try again.'
        : `No voice agent worker is online for "${livekit.agentName}". Start the agent worker (cd server/agent-worker && npm run dev) and make sure its LIVEKIT_URL and LIVEKIT_AGENT_NAME match the API.`;
      await CallRecord.updateOne({ _id: call._id }, { $set: { state: 'failed', disposition: 'failed', failureMessage, endedAt: new Date(), resultsProcessedAt: new Date() } });
      await livekit.endCall({ roomName });
      throw new ServiceUnavailableError(failureMessage);
    }
    // A worker took the job; it loads the call from THIS API first (which marks a browser
    // test answered). If that never happens, the worker that took it cannot reach this CRM:
    // typically another environment's worker (e.g. production) registered under the same
    // agent name on the same LiveKit project. Say so instead of handing over a dead room.
    if (!(await this._waitForAgentContext(call._id))) {
      const failureCode = 'AGENT_UNREACHABLE';
      const failureMessage = worker === 'running'
        ? `The voice agent that took this test never contacted this CRM (${apiBase}). Another agent worker registered as "${livekit.agentName}" on the same LiveKit project (for example the production server) probably took it, or the worker cannot reach this API. Give this environment its own LIVEKIT_AGENT_NAME in server/.env and server/agent-worker/.env (or set PUBLIC_API_BASE_URL), restart both, and try again.`
        : `No voice agent loaded this test from this CRM (${apiBase}). Start the agent worker (cd server/agent-worker && npm run dev) with the same LiveKit project and LIVEKIT_AGENT_NAME ("${livekit.agentName}") as this API, and make sure no other environment's worker uses that name.`;
      await CallRecord.updateOne({ _id: call._id, answeredAt: null }, { $set: { state: 'failed', disposition: 'failed', failureCode, failureMessage: failureMessage.slice(0, 500), endedAt: new Date(), resultsProcessedAt: new Date() } });
      await livekit.endCall({ roomName });
      throw new ServiceUnavailableError(failureMessage);
    }

    const token = livekit.issueJoinToken({
      roomName, identity: `admin-${actor}`, name: 'Tester',
      ttlSeconds: (campaign.agentConfig?.maxCallSeconds || 300) + 120,
    });
    auditService.logEvent({ eventType: 'ai_calling.web_test.started', userId: actor, result: 'success', module: 'ai-calling', details: { campaignId, callId: internalCallId } });
    return { callId: internalCallId, recordId: String(call._id), roomName, url: livekit.wsUrl, token };
  }

  /** True once the agent worker has loaded this browser test's context (see getCallContext). */
  async _waitForAgentContext(callRecordId, { timeoutMs = AGENT_CONTEXT_TIMEOUT_MS, intervalMs = 250 } = {}) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const call = await CallRecord.findById(callRecordId).select('answeredAt').lean();
      if (call?.answeredAt) return true;
      if (Date.now() + intervalMs > deadline) return false;
      await new Promise((resolve) => { setTimeout(resolve, intervalMs); });
    }
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
