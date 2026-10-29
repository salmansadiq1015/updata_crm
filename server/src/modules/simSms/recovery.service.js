import mongoose from 'mongoose';
import RecoveryItem from './recoveryItem.model.js';
import SimSmsMessage from './simSmsMessage.model.js';
import SimSmsConversation from './simSmsConversation.model.js';
import SmsDevice from './smsDevice.model.js';
import Lead from '../crm/lead.model.js';
import { destinationHash } from '../messaging/destinationHash.js';
import { normalizePhone } from '../businessDiscovery/engine/normalizer.js';
import contactPolicyService from '../contactPolicy/contactPolicy.service.js';
import auditService from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { maskNumber } from './engine/deviceHealth.js';

/**
 * Central recovery inbox. Collectors (one-line hooks in the SIM SMS service,
 * the device heartbeat, the sweep for provider messaging) upsert items by key;
 * humans resolve them with SAFE, audited actions. Nothing is ever re-sent
 * automatically: an unknown send can be re-sent only after a human marked it
 * "not sent", and a failed send is retried only by an explicit user action that
 * passes the contact policy.
 */
const ACTIONS = {
  unknown_send: ['mark_sent', 'mark_not_sent', 'dismiss'],
  unmatched_reply: ['link_lead', 'dismiss'],
  delivery_failure: ['retry_other_sim', 'dismiss'],
  sync_failure: ['request_resync', 'retry_sync', 'dismiss'],
  provider_failure: ['dismiss'],
};

function emitCounts(ownerId) {
  setImmediate(async () => {
    try {
      const counts = await RecoveryItem.countDocuments({ ownerId, status: 'open' });
      global.io?.to(`user:${ownerId}`).emit('sim-sms:recovery', { open: counts });
    } catch { /* best effort */ }
  });
}

export function allowedActions(item) {
  if (item.status === 'dismissed') return [];
  if (item.status === 'resolved') {
    // Only after a human said "not sent" may it be re-sent (once).
    return item.type === 'unknown_send' && item.resolution?.action === 'mark_not_sent' && !item.resolution?.result?.resentMessageId ? ['resend'] : [];
  }
  let actions = [...(ACTIONS[item.type] || ['dismiss'])];
  if (item.type === 'sync_failure' && item.details?.cause !== 'crm_sync') actions = actions.filter((a) => a !== 'retry_sync');
  if (item.type === 'sync_failure' && !item.deviceId) actions = actions.filter((a) => a !== 'request_resync');
  return actions;
}

class RecoveryService {
  /** Idempotent upsert by key; a re-occurrence bumps the counter (and reopens nothing that a human closed). */
  async record({ key, type, severity = 'medium', ownerId, source = 'sim_sms', leadId = null, campaignId = null, conversationId = null, messageId = null, deviceId = null, details = {} }) {
    try {
      const item = await RecoveryItem.findOneAndUpdate(
        { key },
        {
          $setOnInsert: { key, type, severity, ownerId, source, leadId, campaignId, conversationId, messageId, deviceId, details, status: 'open' },
          $set: { lastSeenAt: new Date() },
          $inc: { occurrences: 1 },
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      ).lean();
      emitCounts(ownerId);
      return item;
    } catch (error) {
      if (error?.code === 11000) return RecoveryItem.findOne({ key }).lean();
      logger.warn('recovery item not recorded', { module: 'sim-sms', key, error: error.message });
      return null;
    }
  }

  // ------------------------------------------------------------------ collectors
  async unknownSend(message, code) {
    const m = message.leadId ? message : await SimSmsMessage.findById(message._id).lean();
    if (!m) return null;
    return this.record({
      key: `unknown_send:${m._id}`, type: 'unknown_send', severity: 'high', ownerId: m.createdBy,
      leadId: m.leadId, campaignId: m.campaignId, conversationId: m.conversationId, messageId: m._id, deviceId: m.deviceId || null,
      details: { code, cause: code === 'RESULT_LOST' ? 'result_lost' : 'device_reported_unknown', kind: m.kind, body: m.body },
    });
  }

  async deliveryFailure(message, errorCode) {
    return this.record({
      key: `delivery_failure:${message._id}`, type: 'delivery_failure', severity: ['stop_ack'].includes(message.kind) ? 'high' : 'medium', ownerId: message.createdBy,
      leadId: message.leadId, campaignId: message.campaignId, conversationId: message.conversationId, messageId: message._id, deviceId: message.deviceId || null,
      details: { code: errorCode || 'UNKNOWN_FAILURE', kind: message.kind, body: message.body, subscriptionId: message.subscriptionId ?? null },
    });
  }

  async unmatchedReply(actor, { deviceMessageKey, from, body, receivedAt, deviceId = null }) {
    const candidates = [normalizePhone(from, 'CH'), normalizePhone(from), normalizePhone(from, 'PK')].filter((n) => n.valid).map((n) => n.e164);
    const hashes = [...new Set(candidates)].map((e) => destinationHash('sms', e));
    // Suggest leads this owner texted from that number before (any conversation state).
    const previous = hashes.length ? await SimSmsConversation.find({ createdBy: actor, destinationHash: { $in: hashes } }).sort({ updatedAt: -1 }).limit(5).select('leadId').lean() : [];
    const leadIds = [...new Set(previous.map((p) => String(p.leadId)))];
    const suggestedLeads = leadIds.length ? await Lead.find({ _id: { $in: leadIds }, isDeleted: false }).select('_id name leadNumber').lean() : [];
    return this.record({
      key: `unmatched_reply:${actor}:${deviceMessageKey}`, type: 'unmatched_reply', severity: 'medium', ownerId: actor, deviceId,
      details: {
        body: String(body || '').slice(0, 1600), fromMasked: maskNumber(from), fromHash: hashes[0] || null,
        receivedAt: receivedAt ? new Date(receivedAt) : new Date(), deviceMessageKey,
        suggestedLeads: suggestedLeads.map((l) => ({ _id: String(l._id), name: l.name, leadNumber: l.leadNumber })),
        // Kept so the reply can be processed once linked; masked everywhere it is displayed.
        from: String(from || '').slice(0, 40),
      },
    });
  }

  async syncFailure({ ownerId, deviceId = null, messageId = null, conversationId = null, cause, details = {}, severity = 'medium' }) {
    let extra = {};
    if (messageId && mongoose.isValidObjectId(messageId)) {
      const m = await SimSmsMessage.findById(messageId).select('leadId campaignId conversationId').lean();
      if (m) extra = { leadId: m.leadId, campaignId: m.campaignId, conversationId: m.conversationId };
    }
    return this.record({
      key: `sync_failure:${cause}:${messageId || conversationId || deviceId}`, type: 'sync_failure', severity, ownerId, deviceId,
      messageId: messageId && mongoose.isValidObjectId(messageId) ? messageId : null, conversationId, ...extra, details: { cause, ...details },
    });
  }

  /** CRM sync of a finished conversation failed (the sweep keeps retrying; humans can force it). */
  async crmSyncFailed(conversation, error) {
    return this.syncFailure({ ownerId: conversation.createdBy, conversationId: conversation._id, cause: 'crm_sync', details: { error: String(error?.message || error).slice(0, 300), leadId: String(conversation.leadId) } });
  }

  async crmSyncSucceeded(conversationId) {
    await RecoveryItem.updateMany(
      { key: `sync_failure:crm_sync:${conversationId}`, status: 'open' },
      { $set: { status: 'resolved', resolution: { action: 'auto_resolved', by: null, at: new Date(), note: 'CRM sync succeeded on retry', result: null } } },
    );
  }

  async autoResolveResync(ownerId, deviceId) {
    await RecoveryItem.updateMany(
      { ownerId, deviceId, type: 'sync_failure', status: 'open', 'resolution.action': 'request_resync' },
      { $set: { status: 'resolved', 'resolution.at': new Date(), 'resolution.note': 'Device completed the resync' } },
    );
  }

  /** Sweep collector: provider messaging recipients stuck in unknown / permanently failed. */
  async collectProviderFailures(since = new Date(Date.now() - 24 * 3_600_000)) {
    const MessageRecipient = mongoose.models.MessageRecipient || (await import('../messaging/messageRecipient.model.js')).default;
    const rows = await MessageRecipient.find({ status: { $in: ['unknown', 'failed', 'undelivered'] }, updatedAt: { $gte: since } })
      .select('_id campaignId leadId createdBy channel status error').limit(500).lean();
    let n = 0;
    for (const r of rows) {
      if (!r.createdBy || r.error?.code === 'CONTACT_POLICY_LIMIT') continue;
      await this.record({
        key: `provider_failure:${r._id}`, type: 'provider_failure', severity: r.status === 'unknown' ? 'high' : 'low', ownerId: r.createdBy, source: 'messaging',
        leadId: r.leadId || null, campaignId: r.campaignId, messageId: r._id, details: { channel: r.channel, status: r.status, code: r.error?.code || null, message: r.error?.message || null },
      });
      n += 1;
    }
    return { collected: n };
  }

  // ------------------------------------------------------------------ inbox
  _serialize(item, leads = new Map()) {
    const { details = {}, ...rest } = item;
    const { from, fromHash, ...safeDetails } = details || {};
    return { ...rest, details: safeDetails, lead: item.leadId ? leads.get(String(item.leadId)) || null : null, allowedActions: allowedActions(item) };
  }

  async list(actor, { page = 1, limit = 25, type, status = 'open' } = {}) {
    const filter = { ownerId: actor, status, ...(type ? { type } : {}) };
    const [rows, total] = await Promise.all([
      RecoveryItem.find(filter).sort({ severity: 1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      RecoveryItem.countDocuments(filter),
    ]);
    const leadIds = [...new Set(rows.filter((r) => r.leadId).map((r) => String(r.leadId)))];
    const leads = new Map((leadIds.length ? await Lead.find({ _id: { $in: leadIds } }).select('_id name leadNumber').lean() : []).map((l) => [String(l._id), { _id: String(l._id), name: l.name, leadNumber: l.leadNumber }]));
    return { data: rows.map((r) => this._serialize(r, leads)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async counts(actor) {
    const rows = await RecoveryItem.aggregate([
      { $match: { ownerId: new mongoose.Types.ObjectId(String(actor)), status: 'open' } },
      { $group: { _id: '$type', n: { $sum: 1 } } },
    ]);
    const byType = Object.fromEntries(rows.map((r) => [r._id, r.n]));
    return { open: rows.reduce((a, r) => a + r.n, 0), byType };
  }

  async get(actor, id) {
    const item = await RecoveryItem.findOne({ _id: id, ownerId: actor }).lean();
    if (!item) throw new NotFoundError('RecoveryItem', id);
    const lead = item.leadId ? await Lead.findById(item.leadId).select('_id name leadNumber').lean() : null;
    return this._serialize(item, new Map(lead ? [[String(lead._id), { _id: String(lead._id), name: lead.name, leadNumber: lead.leadNumber }]] : []));
  }

  async _close(item, { status = 'resolved', action, actor, note = null, result = null }) {
    const updated = await RecoveryItem.findOneAndUpdate(
      { _id: item._id, status: item.status, 'resolution.action': item.resolution?.action ?? null },
      {
        $set: { status, resolution: { action, by: actor, at: new Date(), note, result } },
        $push: { actions: { action, by: actor, at: new Date(), note } },
      },
      { returnDocument: 'after' },
    ).lean();
    if (!updated) throw new ConflictError('This item changed in the meantime; reload it');
    emitCounts(item.ownerId);
    return updated;
  }

  /** One safe, audited action on an item. */
  async act(actor, id, { action, leadId = null, subscriptionId = null, note = null }, meta = {}) {
    const item = await RecoveryItem.findOne({ _id: id, ownerId: actor }).lean();
    if (!item) throw new NotFoundError('RecoveryItem', id);
    if (!allowedActions(item).includes(action)) throw new ConflictError(`"${action}" is not allowed for this item now`);
    let updated;
    let result = null;
    switch (action) {
      case 'dismiss':
        updated = await this._close(item, { status: 'dismissed', action, actor, note });
        break;
      case 'mark_sent': result = await this._markSent(item); updated = await this._close(item, { action, actor, note, result }); break;
      case 'mark_not_sent': result = await this._markNotSent(item); updated = await this._close(item, { action, actor, note, result }); break;
      case 'resend': {
        result = await this._resend(item, actor);
        updated = await RecoveryItem.findOneAndUpdate(
          { _id: item._id, 'resolution.result.resentMessageId': { $exists: false } },
          { $set: { 'resolution.result': { ...(item.resolution?.result || {}), ...result } }, $push: { actions: { action, by: actor, at: new Date(), note } } },
          { returnDocument: 'after' },
        ).lean();
        if (!updated) throw new ConflictError('Already re-sent');
        break;
      }
      case 'link_lead': result = await this._linkLead(item, actor, leadId); updated = await this._close(item, { action, actor, note, result }); break;
      case 'retry_other_sim': result = await this._retryOtherSim(item, subscriptionId); updated = await this._close(item, { action, actor, note, result }); break;
      case 'request_resync': {
        const { default: devices } = await import('./smsDevice.service.js');
        result = await devices.requestResync(actor, item.deviceId, meta);
        updated = await RecoveryItem.findOneAndUpdate({ _id: item._id }, {
          $set: { 'resolution.action': 'request_resync', 'resolution.by': actor, 'resolution.at': new Date(), 'resolution.note': note },
          $push: { actions: { action, by: actor, at: new Date(), note } },
        }, { returnDocument: 'after' }).lean();
        break;
      }
      case 'retry_sync': {
        const { default: simSms } = await import('./simSms.service.js');
        result = await simSms.processResults(item.conversationId);
        if (!result?.processed && !result?.duplicate) throw new ConflictError(`CRM sync failed again: ${result?.error || 'unknown error'}`);
        updated = await this._close(item, { action, actor, note, result });
        break;
      }
      default: throw new ValidationError('Unknown action');
    }
    auditService.logEvent({
      eventType: `sim_sms.recovery.${action}`, userId: actor, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', module: 'sim-sms',
      details: { recoveryItemId: String(item._id), type: item.type, messageId: item.messageId ? String(item.messageId) : null, leadId: leadId || (item.leadId ? String(item.leadId) : null), note },
    });
    return this._serialize(updated);
  }

  async bulkDismiss(actor, { ids, note = null }, meta = {}) {
    const res = await RecoveryItem.updateMany(
      { _id: { $in: ids }, ownerId: actor, status: 'open' },
      { $set: { status: 'dismissed', resolution: { action: 'dismiss', by: actor, at: new Date(), note, result: null } }, $push: { actions: { action: 'dismiss', by: actor, at: new Date(), note } } },
    );
    auditService.logEvent({ eventType: 'sim_sms.recovery.bulk_dismiss', userId: actor, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', module: 'sim-sms', details: { ids, dismissed: res.modifiedCount, note } });
    emitCounts(actor);
    return { dismissed: res.modifiedCount || 0 };
  }

  // ------------------------------------------------------------------ actions
  async _markSent(item) {
    const res = await SimSmsMessage.updateOne({ _id: item.messageId, status: 'unknown' }, { $set: { status: 'sent', failureCode: 'CONFIRMED_SENT_BY_USER' } });
    await contactPolicyService.commitByRef('sim_sms', String(item.messageId)).catch(() => {});
    const msg = await SimSmsMessage.findById(item.messageId).select('kind campaignId').lean();
    if (msg && !['closing', 'stop_ack'].includes(msg.kind)) {
      await SimSmsConversation.updateOne({ _id: item.conversationId, state: 'needs_attention' }, { $set: { state: 'awaiting_reply', lastOutboundAt: new Date(), replyDeadlineAt: new Date(Date.now() + 48 * 3_600_000) } });
    }
    if (msg) await (await import('./simSms.service.js')).default.refreshSummary(msg.campaignId);
    return { messageUpdated: res.modifiedCount === 1 };
  }

  async _markNotSent(item) {
    const res = await SimSmsMessage.updateOne({ _id: item.messageId, status: 'unknown' }, { $set: { status: 'failed', failureCode: 'CONFIRMED_NOT_SENT_BY_USER' } });
    // Nothing reached the lead: the contact slot is free again.
    await contactPolicyService.releaseByRef('sim_sms', String(item.messageId)).catch(() => {});
    return { messageUpdated: res.modifiedCount === 1 };
  }

  async _requeueCopy(item, overrides = {}) {
    const original = await SimSmsMessage.findById(item.messageId).lean();
    if (!original) throw new NotFoundError('SimSmsMessage', item.messageId);
    const conversation = await SimSmsConversation.findById(original.conversationId).lean();
    if (!conversation || ['stopped', 'ineligible', 'cancelled'].includes(conversation.state)) {
      throw new ConflictError('The conversation is closed (opt-out, ineligible or cancelled); nothing can be re-sent');
    }
    const decision = await contactPolicyService.check({ leadId: original.leadId, channel: 'sms', campaignId: original.campaignId });
    if (!decision.allowed) {
      const err = new ConflictError(`Contact policy does not allow a message now (${decision.reason}${decision.nextAllowedAt ? `, next ${new Date(decision.nextAllowedAt).toISOString()}` : ''})`);
      err.details = { reason: decision.reason, nextAllowedAt: decision.nextAllowedAt };
      throw err;
    }
    await SimSmsMessage.updateMany({ conversationId: original.conversationId, direction: 'outbound', status: { $in: ['pending', 'leased'] } }, { $set: { status: 'cancelled', leaseUntil: null } });
    const copy = await SimSmsMessage.create({
      conversationId: original.conversationId, campaignId: original.campaignId, leadId: original.leadId, createdBy: original.createdBy,
      direction: 'outbound', kind: original.kind, body: original.body, segments: original.segments, encoding: original.encoding,
      questionFieldKey: original.questionFieldKey, status: 'pending', subscriptionId: original.subscriptionId, ...overrides,
    });
    if (!['closing', 'stop_ack'].includes(original.kind)) {
      await SimSmsConversation.updateOne({ _id: original.conversationId, state: { $in: ['needs_attention', 'failed', 'awaiting_send'] } }, { $set: { state: 'awaiting_send' } });
    }
    try { global.io?.to(`user:${original.createdBy}`).emit('sim-sms:outbox', { campaignId: String(original.campaignId) }); } catch { /* best effort */ }
    return copy;
  }

  async _resend(item) {
    const copy = await this._requeueCopy(item);
    return { resentMessageId: String(copy._id) };
  }

  async _retryOtherSim(item, subscriptionId) {
    const copy = await this._requeueCopy(item, subscriptionId != null ? { subscriptionId } : {});
    return { retriedMessageId: String(copy._id), subscriptionId: copy.subscriptionId ?? null };
  }

  /** Attach an unmatched reply to a lead; if the owner has a conversation with it, interpret it there. */
  async _linkLead(item, actor, leadId) {
    const lead = await Lead.findOne({ _id: leadId, isDeleted: false }).select('_id phone mobile address.country').lean();
    if (!lead) throw new NotFoundError('Lead', leadId);
    const conversation = await SimSmsConversation.findOne({ createdBy: actor, leadId: lead._id, state: { $in: ['awaiting_reply', 'awaiting_send', 'needs_attention', 'completed', 'stopped', 'expired'] } })
      .sort({ lastOutboundAt: -1, updatedAt: -1 }).lean();
    await RecoveryItem.updateOne({ _id: item._id }, { $set: { leadId: lead._id, conversationId: conversation?._id || null } });
    if (!conversation) return { linked: true, processed: false, reason: 'no_sms_conversation' };
    const { default: simSms } = await import('./simSms.service.js');
    const { __test__: helpers } = await import('./simSms.service.js');
    const dest = helpers.leadDestination(lead);
    if (!dest.e164) return { linked: true, processed: false, reason: 'lead_has_no_number' };
    const outcome = await simSms.receiveInbound(actor, {
      deviceMessageKey: `${item.details?.deviceMessageKey || item._id}:linked`, from: dest.e164, matchedTo: dest.e164,
      body: item.details?.body || '', receivedAt: item.details?.receivedAt || null,
    }, { linkedFromRecovery: true });
    return { linked: true, processed: Boolean(outcome?.matched), conversationId: String(conversation._id), intent: outcome?.intent || null };
  }

  /** Device ids of an owner's devices (tests / helpers). */
  async deviceExists(ownerId, deviceId) { return Boolean(await SmsDevice.exists({ userId: ownerId, deviceId })); }
}

export default new RecoveryService();
