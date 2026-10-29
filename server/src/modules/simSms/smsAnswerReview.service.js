import mongoose from 'mongoose';
import SmsAnswerReview from './smsAnswerReview.model.js';
import SimSmsCampaign from './simSmsCampaign.model.js';
import SimSmsConversation from './simSmsConversation.model.js';
import { validateAnswer } from '../aiCalling/engine/answerValidation.js';
import * as engine from '../aiCalling/engine/questionEngine.js';
import { QUALIFICATION_FIELD_BY_KEY } from '../crm/leadQualification.constants.js';
import auditService from '../auth/audit.service.js';
import notificationService from '../notifications/notification.service.js';
import logger from '../../shared/logger/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';

/**
 * Review queue for answers the SMS agent did not assume (multiAnswer.js
 * decision 'review'). Accepted/edited values go through the deterministic
 * validator, then into the running conversation (if that question is still
 * open) and Lead.qualification via leadQualificationService.mergeAnswers.
 */
function emit(userId, payload) {
  try { global.io?.to(`user:${userId}`).emit('sim-sms:review', payload); } catch { /* best effort */ }
}

class SmsAnswerReviewService {
  /** Called after an inbound reply was interpreted. Idempotent per message. */
  async queue({ conversation, campaign, inbound, extraction, actor }) {
    const proposals = (extraction?.extras || []).filter((e) => e.decision === 'review').map((e) => ({
      fieldKey: e.fieldKey, label: e.label, type: e.type, proposedValue: e.value ?? null, confidence: e.confidence ?? null,
      evidence: e.evidence ? String(e.evidence).slice(0, 1600) : null, source: e.source, reason: e.reason || null, alternatives: e.alternatives || [],
    }));
    if (!proposals.length) return null;
    try {
      const review = await SmsAnswerReview.create({
        createdBy: actor, conversationId: conversation._id, campaignId: campaign._id, leadId: conversation.leadId, messageId: inbound._id,
        reply: String(inbound.body || '').slice(0, 1600), language: extraction.insights?.language || null, proposals,
      });
      notificationService.create({
        channels: ['IN_APP'], recipientIds: [actor], type: 'sim_sms.answer_review', category: 'CRM', priority: 'NORMAL',
        payload: { title: 'SMS answers need review', message: `${proposals.length} possible answer(s) were not assumed`, reviewId: String(review._id), leadId: String(conversation.leadId) },
        sourceModule: 'sim-sms', sourceEvent: 'ANSWER_REVIEW', sourceEntityType: 'SmsAnswerReview', sourceEntityId: review._id,
        idempotencyKey: `sim-sms-review-${review._id}`,
      }, actor).catch(() => {});
      emit(actor, { reviewId: String(review._id) });
      return review;
    } catch (error) {
      if (error?.code === 11000) return null;
      throw error;
    }
  }

  async list(actor, { page = 1, limit = 25, status = 'pending' } = {}) {
    const filter = { createdBy: actor, status };
    const [rows, total] = await Promise.all([
      SmsAnswerReview.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
        .populate('leadId', 'name leadNumber').populate('campaignId', 'name').lean(),
      SmsAnswerReview.countDocuments(filter),
    ]);
    return { data: rows.map((r) => this._serialize(r)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  _serialize(r) {
    const { leadId, campaignId, ...rest } = r;
    return {
      ...rest,
      leadId: leadId?._id ? String(leadId._id) : String(leadId), campaignId: campaignId?._id ? String(campaignId._id) : String(campaignId),
      lead: leadId?._id ? { _id: String(leadId._id), name: leadId.name, leadNumber: leadId.leadNumber } : null,
      campaign: campaignId?._id ? { _id: String(campaignId._id), name: campaignId.name } : null,
    };
  }

  async counts(actor) {
    return { pending: await SmsAnswerReview.countDocuments({ createdBy: actor, status: 'pending' }) };
  }

  async get(actor, id) {
    const review = await SmsAnswerReview.findOne({ _id: id, createdBy: actor }).populate('leadId', 'name leadNumber').populate('campaignId', 'name').lean();
    if (!review) throw new NotFoundError('SmsAnswerReview', id);
    return this._serialize(review);
  }

  /**
   * decisions: [{ fieldKey, action: accept|edit|reject, value? }]. Every proposal
   * must be decided; accepted values are re-validated against the campaign question.
   */
  async resolve(actor, id, { decisions, note = null }, meta = {}, deps = {}) {
    const review = await SmsAnswerReview.findOne({ _id: id, createdBy: actor });
    if (!review) throw new NotFoundError('SmsAnswerReview', id);
    if (review.status !== 'pending') throw new ConflictError('This review was already resolved');
    const campaign = await SimSmsCampaign.findById(review.campaignId).lean();
    const questions = new Map((campaign?.questionnaire?.questions || []).map((q) => [q.fieldKey, q]));
    const byKey = new Map(decisions.map((d) => [d.fieldKey, d]));
    const accepted = [];
    for (const p of review.proposals) {
      const d = byKey.get(p.fieldKey);
      if (!d) throw new ValidationError(`Decide every proposed answer (missing ${p.fieldKey})`);
      p.decision = d.action;
      if (d.action === 'reject') continue;
      const q = questions.get(p.fieldKey) || { fieldKey: p.fieldKey, type: p.type || 'short_text' };
      const raw = d.action === 'edit' ? d.value : p.proposedValue;
      if (raw === null || raw === undefined || raw === '') throw new ValidationError(`A value is required for ${p.fieldKey}`);
      const checked = validateAnswer(q, Array.isArray(raw) ? raw.join(', ') : String(raw));
      if (checked.validation !== 'valid') throw new ValidationError(`"${raw}" is not a valid answer for ${p.label || p.fieldKey}`);
      p.finalValue = checked.normalizedValue;
      accepted.push({ q, p, value: checked.normalizedValue });
    }

    // 1. The running conversation: a still-unresolved question is not asked again.
    if (accepted.length) {
      const conversation = await SimSmsConversation.findById(review.conversationId).select('state resultsProcessedAt').lean();
      if (conversation && !conversation.resultsProcessedAt) {
        const { default: simSms } = await import('./simSms.service.js');
        await simSms._mutate(review.conversationId, (s) => {
          let next = s;
          for (const a of accepted) {
            const e = next.answers?.[a.q.fieldKey];
            if (e && (e.validation === 'valid' || e.validation === 'unknown')) continue;
            next = engine.applyAnswer(next, a.q.fieldKey, { validation: 'valid', normalizedValue: a.value, rawAnswer: a.p.evidence || review.reply, reason: 'human_review' });
          }
          return next === s ? null : { state: next };
        }).catch((error) => logger.warn('review not applied to conversation', { module: 'sim-sms', error: error.message }));
      }
    }

    // 2. Lead qualification (only fields of the qualification schema).
    const written = [];
    const qualAnswers = [];
    if (accepted.length) {
      const { normalizeConfirmedAnswer } = await import('../crm/leadQualification.service.js');
      for (const a of accepted) {
        if (!QUALIFICATION_FIELD_BY_KEY.has(a.q.fieldKey)) continue;
        try {
          qualAnswers.push({ ...normalizeConfirmedAnswer({
            fieldKey: a.q.fieldKey, status: 'answered', value: Array.isArray(a.value) ? a.value.join(', ') : a.value,
            source: 'sms_agent', evidence: String(a.p.evidence || review.reply).slice(0, 2000),
          }), confidence: a.p.confidence ?? null });
        } catch { /* incompatible with the qualification field type: kept in the conversation only */ }
      }
    }
    if (qualAnswers.length) {
      const leadQualificationService = deps.leadQualificationService || (await import('../crm/leadQualification.service.js')).default;
      await leadQualificationService.mergeAnswers(String(review.leadId), qualAnswers, {
        smsMessageId: review.messageId, source: 'sms_agent', userId: actor, communicationId: null,
      });
      written.push(...qualAnswers.map((a) => a.fieldKey));
    }

    review.status = 'resolved';
    review.resolvedBy = actor;
    review.resolvedAt = new Date();
    review.note = note || null;
    review.writtenFields = written;
    review.markModified('proposals');
    await review.save();
    auditService.logEvent({
      eventType: 'sim_sms.answer_review.resolved', userId: actor, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', module: 'sim-sms',
      details: { reviewId: String(review._id), leadId: String(review.leadId), decisions: review.proposals.map((p) => ({ fieldKey: p.fieldKey, decision: p.decision })), written },
    });
    emit(actor, { reviewId: String(review._id), resolved: true });
    return this.get(actor, review._id);
  }

  _oid(v) { return new mongoose.Types.ObjectId(String(v)); }
}

export default new SmsAnswerReviewService();
