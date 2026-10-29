import mongoose from 'mongoose';
import notificationService from '../notifications/notification.service.js';
import logger from '../../shared/logger/index.js';
import { recipientTimezone } from '../aiCalling/engine/callWindow.js';

/**
 * SMS replies that ask for a call back ("call me", "baad mein call karein",
 * "کال کریں") become a callback follow-up for the conversation owner:
 *  - an explicit time ("kal 5 baje", "tomorrow 5pm") → due at that instant in the lead's timezone;
 *  - no explicit time → due now and flagged "needs a time" (the lead's words are kept;
 *    an hour is never invented).
 * Storage = the lead follow-up inbox (crm/leadFollowUp.service.js, idempotent by
 * sourceKey). The owner gets an in-app (+ push where configured) notification.
 */
const OPEN = ['open', 'snoozed'];

async function followUpService() {
  try {
    const mod = await import('../crm/leadFollowUp.service.js');
    return mod.default || null;
  } catch (error) {
    logger.warn('follow-up service unavailable; callback notified only', { module: 'sim-sms', error: error.message });
    return null;
  }
}

class SmsCallbackService {
  /** Lead timezone (country) first, then the campaign's. */
  timezoneFor(conversation, campaign) {
    return recipientTimezone(conversation?.country) || campaign?.settings?.timezone || 'UTC';
  }

  /**
   * @param {{ conversation, campaign, inbound, insights, actor }} p — insights from smsInsights.replyInsights
   * @returns {Promise<{ followUpId: string|null, dueAt: Date, needsTime: boolean }|null>}
   */
  async handleReply({ conversation, campaign, inbound, insights, actor, createFollowUp = true }) {
    const callbackIntent = insights?.intents?.find((i) => i.intent === 'callback');
    if (!callbackIntent) return null;
    const parsed = insights.callback || { at: null, needsTime: true };
    const needsTime = !parsed.at;
    const dueAt = parsed.at ? new Date(parsed.at) : new Date();
    const timezone = this.timezoneFor(conversation, campaign);
    const body = String(inbound.body || '');
    const note = `Lead asked for a call back by SMS${campaign?.name ? ` (campaign "${campaign.name}")` : ''}: "${body.slice(0, 300)}"${needsTime ? ' — no time given, agree a time.' : ''}`;
    let followUp = null;
    const service = await followUpService();
    if (createFollowUp && service?.upsertFromSource) {
      try {
        followUp = await service.upsertFromSource({
          sourceKey: `sim_sms_callback:${inbound._id}`, leadId: conversation.leadId, ownerId: actor, dueAt, timezone,
          channel: 'phone', note,
          source: { type: 'sim_sms', conversationId: conversation._id, requestedTimeText: needsTime ? body.slice(0, 300) : (parsed.evidence || null) },
          createdBy: null,
        });
      } catch (error) {
        logger.warn('SMS callback follow-up not created', { module: 'sim-sms', error: error.message });
      }
    }
    notificationService.create({
      channels: ['IN_APP', 'PUSH'], recipientIds: [actor], type: 'sim_sms.callback_requested', category: 'CRM', priority: 'HIGH',
      payload: {
        title: needsTime ? 'Lead asked to be called back (no time given)' : 'Lead asked to be called back',
        message: `"${callbackIntent.evidence}"${parsed.at ? ` — ${new Date(parsed.at).toISOString()}` : ''}`,
        leadId: String(conversation.leadId), conversationId: String(conversation._id),
        followUpId: followUp ? String(followUp._id) : null, dueAt: dueAt.toISOString(), needsTime,
      },
      sourceModule: 'sim-sms', sourceEvent: 'CALLBACK_REQUESTED', sourceEntityType: 'SimSmsMessage', sourceEntityId: inbound._id,
      idempotencyKey: `sim-sms-callback-${inbound._id}`,
    }, actor).catch(() => {});
    try { global.io?.to(`user:${actor}`).emit('sim-sms:callback', { leadId: String(conversation.leadId), needsTime }); } catch { /* best effort */ }
    return { followUpId: followUp ? String(followUp._id) : null, dueAt, needsTime };
  }

  /** The owner's open SMS callback requests (for the web list and the phone). */
  async list(actor) {
    const LeadFollowUp = mongoose.models.LeadFollowUp || (await import('../crm/leadFollowUp.model.js').then((m) => m.default).catch(() => null));
    if (!LeadFollowUp) return [];
    const rows = await LeadFollowUp.find({ ownerId: actor, 'source.type': 'sim_sms', status: { $in: OPEN } })
      .sort({ nextDueAt: 1 }).limit(200).populate('leadId', 'name leadNumber').lean();
    return rows.map((r) => ({
      id: String(r._id), leadId: r.leadId?._id ? String(r.leadId._id) : String(r.leadId), leadName: r.leadId?.name || null,
      leadNumber: r.leadId?.leadNumber || null, conversationId: r.source?.conversationId ? String(r.source.conversationId) : null,
      campaignId: null, dueAt: r.nextDueAt || r.dueAt, needsTime: Boolean(r.note && /no time (given|was recorded)/i.test(r.note)),
      requestedTimeText: r.source?.requestedTimeText || null, evidence: r.source?.requestedTimeText || null, note: r.note, status: r.status,
      timezone: r.timezone, createdAt: r.createdAt,
    }));
  }
}

export default new SmsCallbackService();
