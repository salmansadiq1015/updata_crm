import mongoose from 'mongoose';
import CallRecord from './callRecord.model.js';
import CallCampaign from './callCampaign.model.js';
import config from '../../config/index.js';
import { isAiConfigured, createOpenAiClient } from '../../shared/ai/llmFactory.js';
import leadQualificationService from '../crm/leadQualification.service.js';
import auditService from '../auth/audit.service.js';
import notificationService from '../notifications/notification.service.js';
import queueManager from '../../shared/queue/QueueManager.js';
import logger from '../../shared/logger/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import knowledgeService from './knowledge.service.js';
import humanTransferService from './humanTransfer.service.js';
import {
  CATEGORY_FIELD, INTELLIGENCE_PROMPT_VERSION, INTELLIGENCE_VERSION, acceptProposals, buildExtractionMessages,
  markConflicts, mergeWithPrevious, parseExtraction, runStatus, toQualificationAnswers, validateCorrection,
} from './engine/callIntelligence.js';
import { COMPLIANCE_VERSION, checkCompliance } from './engine/knowledgeCompliance.js';

export const CALL_INTELLIGENCE_QUEUE = 'ai-call-intelligence';
const EXTRACTION_DELAY_MS = 20_000; // late final utterances can arrive just after hang-up
const LEASE_MS = 2 * 60_000;
const LLM_TIMEOUT_MS = 45_000;
const TEST_PROVIDERS = new Set(['livekit_web', 'web_link_preview']);
const EFFECTIVE = new Set(['accepted', 'user_accepted', 'user_edited']);
const emit = (userId, event, payload) => { try { global.io?.to(`user:${userId}`).emit(event, payload); } catch { /* best-effort */ } };

async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms); })]);
  } finally { clearTimeout(timer); }
}

/**
 * Post-call extraction of evidence-linked facts, the human review queue, and the
 * compliance check of what the agent said against the approved knowledge version.
 * The LLM only proposes; engine/callIntelligence.js decides what is evidence.
 */
class CallIntelligenceService {
  constructor() {
    // Injectable for tests: (messages) => raw model text.
    this.complete = null;
  }

  /** Hook from processCallResults: schedule extraction, settle a transfer. Never throws. */
  async onCallProcessed(callId) {
    try { await humanTransferService.afterCall(callId); } catch (error) {
      logger.warn('Transfer post-call handling failed', { module: 'ai-calling', callId: String(callId), error: error.message });
    }
    try {
      await queueManager.addJob(CALL_INTELLIGENCE_QUEUE, 'extract', { callId: String(callId) }, { delay: EXTRACTION_DELAY_MS, jobId: `intel-${callId}`, attempts: 2, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: true });
    } catch (error) {
      // No queue (tests, a worker-less process): the periodic sweep picks the call up.
      logger.debug?.('Call intelligence not queued', { module: 'ai-calling', callId: String(callId), error: error.message });
    }
  }

  async _model(messages) {
    if (this.complete) return { raw: await this.complete(messages), model: 'test' };
    const model = config.ai?.model || 'gpt-4o';
    const client = await createOpenAiClient();
    const response = await withTimeout(client.chat.completions.create({
      model, temperature: 0, max_tokens: 2500,
      ...(config.ai?.baseUrl ? {} : { response_format: { type: 'json_object' } }),
      messages,
    }, { timeout: LLM_TIMEOUT_MS }), LLM_TIMEOUT_MS);
    return { raw: response?.choices?.[0]?.message?.content || '', model, usage: response?.usage || null };
  }

  /**
   * Extract (or re-extract) one call. Idempotent: an unforced run on an unchanged
   * transcript is a no-op; a forced re-run keeps every user decision and never
   * re-writes a fact already written to the lead.
   */
  async extractForCall(callId, { force = false } = {}) {
    const now = new Date();
    const current = await CallRecord.findById(callId).select('intelligence transcriptVersion endedAt resultsProcessedAt').lean();
    if (!current) throw new NotFoundError('CallRecord', callId);
    if (!current.endedAt && !current.resultsProcessedAt) throw new ConflictError('The call has not finished yet');
    const done = ['ok', 'partial', 'skipped'].includes(current.intelligence?.status);
    if (!force && done && current.intelligence.transcriptVersion === (current.transcriptVersion || 0)) return { status: current.intelligence.status, unchanged: true };
    const claimed = await CallRecord.findOneAndUpdate({
      _id: callId, $or: [{ 'intelligence.leaseUntil': { $in: [null] } }, { 'intelligence.leaseUntil': { $lt: now } }],
    }, { $set: { 'intelligence.leaseUntil': new Date(now.getTime() + LEASE_MS), 'intelligence.startedAt': now } }, { returnDocument: 'after' }).lean();
    if (!claimed) return { status: 'running', unchanged: true };

    const previous = claimed.intelligence || {};
    const campaign = await CallCampaign.findById(claimed.campaignId).select('agentConfig isTest createdBy name').lean();
    const turns = claimed.transcriptExpiresAt && claimed.transcriptExpiresAt <= now ? [] : (claimed.transcript || []);
    const snapshot = await knowledgeService.snapshotForStamp(claimed.knowledge).catch(() => null);
    const complianceFlags = checkCompliance(turns, snapshot);
    const base = {
      version: INTELLIGENCE_VERSION, promptVersion: INTELLIGENCE_PROMPT_VERSION, transcriptVersion: claimed.transcriptVersion || 0,
      turnCount: turns.length, complianceVersion: COMPLIANCE_VERSION, complianceFlags, runs: (previous.runs || 0) + 1,
      startedAt: now, leaseUntil: null, error: null, reason: null, model: null,
    };
    const save = async (fields) => {
      const items = fields.items ?? previous.items ?? [];
      const doc = { ...base, rejected: fields.rejected ?? previous.rejected ?? [], ...fields, items, pendingReview: items.filter(i => i.status === 'needs_review').length, completedAt: new Date() };
      await CallRecord.updateOne({ _id: callId }, { $set: { intelligence: doc } });
      emit(claimed.createdBy, 'ai-calling:intelligence', { recordId: String(callId), campaignId: String(claimed.campaignId), status: doc.status, pendingReview: doc.pendingReview });
      return doc;
    };

    if (!turns.some(t => t.role === 'customer' && String(t.text || '').trim())) return save({ status: 'skipped', reason: turns.length ? 'no_lead_speech' : 'no_transcript' });
    if (!this.complete && !isAiConfigured()) return save({ status: 'skipped', reason: 'ai_not_configured' });

    let proposals;
    let model = null;
    let providerUsage = null;
    try {
      const out = await this._model(buildExtractionMessages(turns, { language: campaign?.agentConfig?.language }));
      model = out.model;
      providerUsage = out.usage || null;
      proposals = parseExtraction(out.raw);
    } catch (error) {
      logger.warn('Call intelligence extraction failed', { module: 'ai-calling', callId: String(callId), error: error.message });
      return save({ status: 'failed', error: String(error.message).slice(0, 500), reason: 'model_error' });
    }
    if (!proposals) return save({ status: 'failed', model, usage: providerUsage, error: 'The model reply was not valid JSON', reason: 'unparseable_model_output' });

    const accepted = acceptProposals(proposals, turns, { answeredAt: claimed.answeredAt });
    const items = markConflicts(mergeWithPrevious(accepted.items, previous.items || []));
    const leadWriteFailed = await this._writeAutoAccepted(claimed, campaign, items);
    const doc = await save({ status: runStatus({ items, rejected: accepted.rejected, leadWriteFailed }), model, usage: providerUsage, items, rejected: accepted.rejected });
    if (doc.pendingReview && !previous.pendingReview) {
      notificationService.create({
        channels: ['IN_APP'], recipientIds: [claimed.createdBy], type: 'ai_calling.intelligence_review', category: 'CRM', priority: 'NORMAL',
        payload: { title: 'AI call facts need review', message: `${doc.pendingReview} extracted item(s) from a call need your confirmation.`, callId: String(callId) },
        sourceModule: 'ai-calling', sourceEvent: 'INTELLIGENCE_REVIEW', sourceEntityType: 'CallRecord', sourceEntityId: claimed._id,
        idempotencyKey: `ai-call-intel-review-${callId}`,
      }, claimed.createdBy).catch(() => {});
    }
    return { status: doc.status, items: doc.items.length, pendingReview: doc.pendingReview, rejected: doc.rejected.length, complianceFlags: complianceFlags.length };
  }

  _isTestCall(call, campaign) {
    return Boolean(campaign?.isTest || call.isTest || TEST_PROVIDERS.has(call.provider));
  }

  /** Write a group of items to the lead and stamp each item's leadWrite. Returns false on failure. */
  async _writeLead(call, items, { source, userId }) {
    const answers = toQualificationAnswers(items, { source, callRecordId: String(call._id) });
    let ok = true;
    for (const answer of answers) {
      const { itemIds, transcriptRef, transcriptRefs, ...fields } = answer;
      let leadWrite;
      try {
        await leadQualificationService.mergeAnswers(call.leadId, [fields], { callRecordId: String(call._id), transcriptRef, transcriptRefs, source, userId });
        leadWrite = { status: 'applied', fieldKey: answer.fieldKey, source, reason: null, at: new Date() };
      } catch (error) {
        ok = false;
        leadWrite = { status: 'failed', fieldKey: answer.fieldKey, source, reason: String(error.message).slice(0, 300), at: new Date() };
        logger.warn('Lead qualification write from call failed', { module: 'ai-calling', callId: String(call._id), fieldKey: answer.fieldKey, error: error.message });
      }
      for (const item of items) if (itemIds.includes(item.id)) item.leadWrite = leadWrite;
    }
    return ok;
  }

  /** Auto-accepted items not yet written: write them (real calls only). Returns true when any write failed. */
  async _writeAutoAccepted(call, campaign, items) {
    const pending = items.filter(i => i.status === 'accepted' && i.leadWrite?.status !== 'applied' && i.leadWrite?.status !== 'skipped');
    if (!pending.length) return false;
    if (this._isTestCall(call, campaign)) {
      for (const item of pending) item.leadWrite = { status: 'skipped', fieldKey: CATEGORY_FIELD[item.category], source: null, reason: 'test_call', at: new Date() };
      return false;
    }
    const writable = pending.filter(i => CATEGORY_FIELD[i.category]);
    for (const item of pending) if (!CATEGORY_FIELD[item.category]) item.leadWrite = { status: 'skipped', fieldKey: null, source: null, reason: 'no_lead_field', at: new Date() };
    // Text fields carry every effective item of the call, so a write never drops an earlier one.
    const groups = new Map();
    for (const item of writable) {
      const key = CATEGORY_FIELD[item.category];
      const related = ['need', 'objection'].includes(item.category) ? items.filter(i => i.category === item.category && EFFECTIVE.has(i.status)) : [item];
      groups.set(key, related);
    }
    let failed = false;
    for (const group of groups.values()) {
      if (!(await this._writeLead(call, group, { source: 'ai_call_agent', userId: call.createdBy }))) failed = true;
    }
    return failed;
  }

  // ---- review queue -----------------------------------------------------------
  async listReviewItems(actor, { category, page = 1, limit = 25 } = {}) {
    const owner = new mongoose.Types.ObjectId(String(actor));
    const match = { createdBy: owner, 'intelligence.pendingReview': { $gt: 0 } };
    const itemMatch = { 'item.status': 'needs_review', ...(category ? { 'item.category': category } : {}) };
    const [rows, totals] = await Promise.all([
      CallRecord.aggregate([
        { $match: match }, { $sort: { endedAt: -1, _id: 1 } },
        { $project: { leadId: 1, campaignId: 1, endedAt: 1, internalCallId: 1, transcript: 1, item: '$intelligence.items' } },
        { $unwind: '$item' }, { $match: itemMatch },
        { $skip: (page - 1) * limit }, { $limit: limit },
        { $lookup: { from: 'leads', localField: 'leadId', foreignField: '_id', as: 'lead', pipeline: [{ $project: { name: 1, leadNumber: 1 } }] } },
      ]),
      CallRecord.aggregate([{ $match: match }, { $project: { item: '$intelligence.items' } }, { $unwind: '$item' }, { $match: itemMatch }, { $count: 'n' }]),
    ]);
    const total = totals[0]?.n || 0;
    return {
      data: rows.map(r => ({
        recordId: String(r._id), callId: r.internalCallId, endedAt: r.endedAt, lead: r.lead?.[0] || null, item: r.item,
        context: (r.transcript || []).slice(Math.max(0, r.item.turnIndex - 1), r.item.turnIndex + 2).map((t, i) => ({ turnIndex: Math.max(0, r.item.turnIndex - 1) + i, role: t.role, text: t.text })),
      })),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /** accept | edit | reject one extracted item. The person's decision is recorded on the item. */
  async decide(recordId, itemId, actor, { decision, value, normalized, note = '' }, meta = {}) {
    const call = await CallRecord.findOne({ _id: recordId, createdBy: actor }).lean();
    if (!call) throw new NotFoundError('CallRecord', recordId);
    const items = call.intelligence?.items || [];
    const item = items.find(i => i.id === itemId);
    if (!item) throw new NotFoundError('Extracted item', itemId);
    if (String(item.status).startsWith('user_')) throw new ConflictError('This item was already reviewed');
    const now = new Date();
    const next = { ...item, review: { decision, decidedBy: actor, decidedAt: now, previousValue: null, note: String(note || '').slice(0, 500) } };
    if (decision === 'accept') next.status = 'user_accepted';
    else if (decision === 'reject') next.status = 'user_rejected';
    else {
      const corrected = validateCorrection(item.category, { value, normalized });
      if (!corrected.ok) throw new ValidationError(`The corrected value is not valid (${corrected.reason})`);
      next.review.previousValue = { value: item.value, normalized: item.normalized };
      next.status = 'user_edited';
      next.value = corrected.value || item.value;
      next.normalized = corrected.normalized;
    }
    next.reviewReasons = item.reviewReasons || [];
    const updatedItems = items.map(i => (i.id === itemId ? next : i));
    const written = await CallRecord.updateOne(
      { _id: recordId, 'intelligence.items': { $elemMatch: { id: itemId, status: item.status } } },
      { $set: { 'intelligence.items': updatedItems, 'intelligence.pendingReview': updatedItems.filter(i => i.status === 'needs_review').length } },
    );
    if (!written.modifiedCount) throw new ConflictError('This item changed meanwhile. Reload the review queue');

    let leadWrite = null;
    let leadFieldUnchanged = false;
    const campaign = await CallCampaign.findById(call.campaignId).select('isTest').lean();
    if (decision !== 'reject' && CATEGORY_FIELD[item.category]) {
      if (this._isTestCall(call, campaign)) {
        leadWrite = { status: 'skipped', fieldKey: CATEGORY_FIELD[item.category], source: null, reason: 'test_call', at: now };
        next.leadWrite = leadWrite;
      } else {
        const source = decision === 'edit' ? 'user_correction' : 'ai_proposed_user_confirmed';
        const group = ['need', 'objection'].includes(item.category) ? updatedItems.filter(i => i.category === item.category && EFFECTIVE.has(i.status)) : [next];
        await this._writeLead(call, group, { source, userId: actor });
        leadWrite = next.leadWrite || group.find(i => i.id === itemId)?.leadWrite || null;
        for (const g of group) if (g.leadWrite) { const target = updatedItems.find(i => i.id === g.id); if (target) target.leadWrite = g.leadWrite; }
      }
      await CallRecord.updateOne({ _id: recordId }, { $set: { 'intelligence.items': updatedItems.map(i => (i.id === itemId ? { ...i, leadWrite: leadWrite || i.leadWrite } : i)) } });
    } else if (decision === 'reject' && item.leadWrite?.status === 'applied') {
      // The lead field was already written from this evidence; a rejection does not erase it silently.
      leadFieldUnchanged = true;
    }
    auditService.logEvent({ eventType: `ai_calling.intelligence.${decision}`, module: 'ai-calling', userId: actor, result: 'success', ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, details: { callId: String(recordId), itemId, category: item.category } });
    emit(actor, 'ai-calling:intelligence', { recordId: String(recordId), campaignId: String(call.campaignId) });
    return { itemId, status: next.status, leadWrite, leadFieldUnchanged };
  }

  async rerun(recordId, actor) {
    const call = await CallRecord.findOne({ _id: recordId, createdBy: actor }).select('_id').lean();
    if (!call) throw new NotFoundError('CallRecord', recordId);
    return this.extractForCall(recordId, { force: true });
  }

  async getIntelligence(recordId, actor) {
    const call = await CallRecord.findOne({ _id: recordId, createdBy: actor }).select('intelligence knowledge handoff transcriptVersion').lean();
    if (!call) throw new NotFoundError('CallRecord', recordId);
    return { intelligence: call.intelligence || null, knowledge: call.knowledge || null, handoff: call.handoff || null };
  }

  /** Periodic safety net: finished calls the queue never reached (Redis outage, no worker). */
  async sweep({ now = new Date(), limit = 25 } = {}) {
    const rows = await CallRecord.find({
      resultsProcessedAt: { $ne: null, $gt: new Date(now.getTime() - 24 * 3600_000), $lt: new Date(now.getTime() - 2 * 60_000) },
      // Never extracted, or a claim that crashed before completing.
      $or: [{ intelligence: { $exists: false } }, { 'intelligence.completedAt': null, 'intelligence.leaseUntil': { $lt: now } }],
    }).select('_id').limit(limit).lean();
    let processed = 0;
    for (const row of rows) {
      await this.extractForCall(row._id).then(() => { processed += 1; }).catch(e => logger.warn('Call intelligence sweep failed', { module: 'ai-calling', callId: String(row._id), error: e.message }));
    }
    return { processed };
  }
}

export default new CallIntelligenceService();
