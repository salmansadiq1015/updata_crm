/**
 * SMS link assistant service: issues personal links, runs the customer chat and
 * feeds every result into the existing aiCalling records (status rules, review
 * queue, lead updates). See docs/SMS-LINK-ASSISTANT.md.
 */
import CallCampaign from '../aiCalling/callCampaign.model.js';
import CampaignRecipient from '../aiCalling/campaignRecipient.model.js';
import CallRecord from '../aiCalling/callRecord.model.js';
import aiCallingService from '../aiCalling/aiCalling.service.js';
import * as qEngine from '../aiCalling/engine/questionEngine.js';
import { windowState, nextWindowOpen } from '../aiCalling/engine/callWindow.js';
import { phoneHash } from '../aiCalling/callAuth.js';
import Lead from '../crm/lead.model.js';
import MessageSuppression from '../messaging/suppression.model.js';
import LeadChannelConsent from '../messaging/consent.model.js';
import CallSuppression from '../aiCalling/callSuppression.model.js';
import { suppressLeadContact } from '../crm/leadCommunication.service.js';
import OptOutEvent from './optOutEvent.model.js';
import { destinationHash } from '../messaging/destinationHash.js';
import { normalizePhone } from '../businessDiscovery/engine/normalizer.js';
import notificationService from '../notifications/notification.service.js';
import auditService from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';
import { createOpenAiClient, isAiConfigured } from '../../shared/ai/llmFactory.js';
import { toCsv } from '../../shared/utils/csv.js';
import {
  AppError, ConflictError, NotFoundError, ValidationError,
} from '../../shared/errors/AppError.js';

import LinkSession from './linkSession.model.js';
import { LinkSettings, LinkSpend } from './linkSettings.model.js';
import {
  CLOSED_SESSION_STATUSES, DEFAULT_LINK_CONFIG, FUNNEL_STEPS, HISTORY_TURNS_FOR_MODEL, INACTIVITY_ABANDON_HOURS,
  LINK_PROVIDER, LINK_REASONS, MAX_MESSAGE_CHARS, MAX_TOKENS_PER_SESSION, MAX_TRANSCRIPT_TURNS,
  MAX_VERIFY_ATTEMPTS,
} from './linkAssistant.constants.js';
import {
  generateToken, hashDevice, hashToken, isWellFormedToken, linkUrl, tokenForOperation,
} from './engine/linkTokens.js';
import { copyFor } from './engine/assistantCopy.js';
import { detectLanguage, greetingName } from './engine/intents.js';
import { isStopRequest } from '../simSms/engine/smsCopy.js';
import { planForState, runTurn, matchFaq } from './engine/conversation.js';
import {
  buildComposerMessages, checkModelOutput, costOf, shouldUseModel, streamCompletion,
} from './engine/composer.js';
import { DEFAULT_SMS_TEMPLATES, templateStats } from './engine/smsTemplates.js';
import { addCost, linkEvent, observeFirstReply } from './linkAssistant.metrics.js';
import { modelSettings } from './engine/modelSettings.js';

export { modelSettings };

const linkConflict = (message, code, data = null) => Object.assign(new AppError(message, 409, code), data ? { data } : {});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TURN_LOCK_MS = 45_000;


const linkConfigOf = (campaign) => ({
  ...DEFAULT_LINK_CONFIG,
  ...(campaign.linkConfig || {}),
  reminders: { ...DEFAULT_LINK_CONFIG.reminders, ...(campaign.linkConfig?.reminders || {}) },
  fallbackToCall: { ...DEFAULT_LINK_CONFIG.fallbackToCall, ...(campaign.linkConfig?.fallbackToCall || {}) },
  limits: { ...DEFAULT_LINK_CONFIG.limits, ...(campaign.linkConfig?.limits || {}) },
});

const companyOf = (campaign) => campaign.agentConfig?.organizationName || process.env.LINK_ASSISTANT_COMPANY_NAME || 'our team';
const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

function e164For(lead) {
  const raw = lead.mobile || lead.phone || '';
  const normalized = normalizePhone(raw, lead.address?.country || 'PK');
  return normalized.valid ? normalized.e164 : null;
}

function emitToOwner(userId, event, payload) {
  try { global.io?.to(`user:${userId}`).emit(event, payload); } catch { /* best effort */ }
}

/** Errors shown on the public page carry a stable code and no internal detail. */
export class LinkError extends AppError {
  constructor(code, status = 404) {
    super(code, status, code);
  }
}

class LinkAssistantService {
  constructor() {
    this._pausedCache = { value: false, at: 0 };
  }

  // ------------------------------------------------------------------ settings
  async isPaused() {
    if (process.env.LINK_ASSISTANT_ENABLED === 'false') return true;
    if (Date.now() - this._pausedCache.at < 5_000) return this._pausedCache.value;
    const doc = await LinkSettings.findOne({ key: 'global' }).lean();
    this._pausedCache = { value: Boolean(doc?.paused), at: Date.now() };
    return this._pausedCache.value;
  }

  async getSettings() {
    const doc = await LinkSettings.findOne({ key: 'global' }).lean();
    return {
      paused: Boolean(doc?.paused) || process.env.LINK_ASSISTANT_ENABLED === 'false',
      pausedByEnv: process.env.LINK_ASSISTANT_ENABLED === 'false',
      pausedReason: doc?.pausedReason || '',
      changedAt: doc?.changedAt || null,
      aiConfigured: isAiConfigured(),
      model: modelSettings().model,
      baseUrl: linkUrl('').replace(/\/c\/$/, ''),
    };
  }

  /** Global kill switch: pauses every link send and every AI turn immediately. */
  async setPaused(paused, reason, actor, meta = {}) {
    await LinkSettings.updateOne(
      { key: 'global' },
      { $set: { paused: Boolean(paused), pausedReason: String(reason || '').slice(0, 300), changedBy: actor, changedAt: new Date() } },
      { upsert: true },
    );
    this._pausedCache = { value: Boolean(paused), at: Date.now() };
    auditService.logEvent({
      eventType: paused ? 'link_assistant.paused' : 'link_assistant.resumed', userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'link-assistant', details: { reason },
    });
    return this.getSettings();
  }

  // ------------------------------------------------------------------- issuing
  async _campaignForSend(campaignId, userId, { allowDraft = false } = {}) {
    const campaign = await CallCampaign.findOne({ _id: campaignId, createdBy: userId }).lean();
    if (!campaign) throw new NotFoundError('CallCampaign', campaignId);
    if (campaign.channel !== 'web_link') throw new ValidationError('This campaign is not an SMS link campaign', [{ field: 'linkCampaignId', code: LINK_REASONS.CAMPAIGN_NOT_LINK }]);
    if (campaign.status !== 'running' && !(allowDraft && ['draft', 'paused', 'scheduled'].includes(campaign.status))) {
      throw linkConflict('Start the SMS link campaign before sending links', LINK_REASONS.CAMPAIGN_INACTIVE);
    }
    return campaign;
  }

  async _recipientFor(campaign, lead, userId) {
    const existing = await CampaignRecipient.findOne({ campaignId: campaign._id, leadId: lead._id });
    if (existing) return existing;
    const e164 = e164For(lead);
    const hash = e164 ? phoneHash(e164) : null;
    const suppressed = e164 && await MessageSuppression.exists({ channel: 'sms', destinationHash: destinationHash('sms', e164) });
    const reasons = [];
    if (!e164) reasons.push('missing_phone');
    if (suppressed) reasons.push('suppressed');
    try {
      return await CampaignRecipient.create({
        campaignId: campaign._id, leadId: lead._id, phoneSnapshot: e164, phoneHash: hash,
        country: lead.address?.country || null,
        state: reasons.length ? (suppressed ? 'suppressed' : 'ineligible') : 'queued',
        eligibility: { eligible: reasons.length === 0, reasons }, createdBy: userId,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      return CampaignRecipient.findOne({ campaignId: campaign._id, leadId: lead._id });
    }
  }

  greetingFor(campaign, session) {
    const cfg = linkConfigOf(campaign);
    return copyFor(session.language).greeting({
      name: session.displayName, persona: cfg.personaName, company: companyOf(campaign),
      reason: cfg.reason, minutes: cfg.estimatedMinutes,
    });
  }

  /**
   * Issue the personal link for one SMS send (called from the communication
   * authorisation, after its do-not-contact / consent / number checks passed).
   * Idempotent per operationId.
   */
  async issueLink({ campaignId, leadId, userId, operationId = null, purpose = 'initial', preview = false, now = new Date() }) {
    if (await this.isPaused()) throw new AppError('The SMS link assistant is paused', 503, LINK_REASONS.KILL_SWITCH);
    const campaign = await this._campaignForSend(campaignId, userId, { allowDraft: preview });
    const cfg = linkConfigOf(campaign);
    if (!preview && !windowState(campaign.schedule || {}, now).open) {
      const next = nextWindowOpen(campaign.schedule || {}, now);
      throw linkConflict('Outside the campaign\'s sending hours', LINK_REASONS.OUTSIDE_HOURS, { nextAt: next });
    }
    const lead = await Lead.findById(leadId).select('_id name phone mobile address').lean();
    if (!lead) throw new NotFoundError('Lead', leadId);

    const token = operationId ? tokenForOperation(operationId) : generateToken();
    const hash = hashToken(token);
    const existingByToken = await LinkSession.findOne({ 'tokens.hash': hash }).lean();
    if (existingByToken) {
      return { url: linkUrl(token), sessionId: String(existingByToken._id), expiresAt: existingByToken.expiresAt, created: false };
    }

    const recipient = await this._recipientFor(campaign, lead, userId);
    if (!recipient.eligibility?.eligible && !preview) {
      throw linkConflict('This lead cannot be contacted for this campaign', LINK_REASONS.LEAD_SUPPRESSED, { reasons: recipient.eligibility?.reasons || [] });
    }
    const expiresAt = new Date(now.getTime() + cfg.expiryDays * DAY);
    const tokenEntry = { hash, operationId, purpose: preview ? 'preview' : purpose, issuedAt: now, expiresAt };

    // Reuse an open session (reminder, resend): the lead continues where they left off.
    if (!preview) {
      const open = await LinkSession.findOneAndUpdate(
        {
          campaignId: campaign._id, leadId: lead._id, isTest: false, status: { $in: ['issued', 'opened', 'active'] },
          expiresAt: { $gt: now }, [`tokens.${MAX_TOKENS_PER_SESSION - 1}`]: { $exists: false },
        },
        {
          $push: { tokens: tokenEntry },
          $max: { expiresAt },
          ...(purpose === 'reminder' ? { $inc: { 'reminders.sent': 1 }, $set: { 'reminders.lastSentAt': now } } : {}),
        },
        { returnDocument: 'after' },
      );
      if (open) return { url: linkUrl(token), sessionId: String(open._id), expiresAt: open.expiresAt, created: false };
    }

    const attempts = await CallRecord.countDocuments({ recipientId: recipient._id });
    const internalCallId = `link_${recipient._id}_${attempts + 1}_${generateToken().slice(0, 8)}`;
    const call = await CallRecord.create({
      campaignId: campaign._id, recipientId: recipient._id, leadId: lead._id, internalCallId,
      attemptNumber: preview ? -(attempts + 1) : attempts + 1, isTest: preview,
      provider: preview ? 'web_link_preview' : LINK_PROVIDER, state: 'queued', queuedAt: now,
      conversationState: qEngine.initConversationState(), createdBy: userId,
    });
    if (!preview) {
      await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { lastCallId: call._id, state: 'in_progress' }, $inc: { attemptCount: 1 } });
    }
    const session = {
      campaignId: campaign._id, recipientId: recipient._id, leadId: lead._id, callRecordId: call._id, internalCallId,
      createdBy: userId, isTest: preview, tokens: [tokenEntry], status: 'issued',
      displayName: greetingName(lead.name), language: cfg.defaultLanguage, awaiting: 'start', expiresAt,
      funnel: { ...Object.fromEntries(FUNNEL_STEPS.map((k) => [k, null])), link_issued: now },
    };
    session.greeting = this.greetingFor(campaign, session);
    const doc = await LinkSession.create(session);
    linkEvent(preview ? 'preview_issued' : 'link_issued');
    logger.info('link issued', { module: 'link-assistant', sessionId: String(doc._id), campaignId: String(campaign._id), leadId: String(lead._id), preview });
    return { url: linkUrl(token), sessionId: String(doc._id), expiresAt, created: true };
  }

  /** "Preview as customer": a real page for a test session that never touches the lead. */
  async previewLink(campaignId, userId, { leadId = null } = {}) {
    const campaign = await CallCampaign.findOne({ _id: campaignId, createdBy: userId }).lean();
    if (!campaign) throw new NotFoundError('CallCampaign', campaignId);
    const lid = leadId || campaign.selection?.leadIds?.[0];
    if (!lid) throw new ValidationError('Add a lead to the campaign to preview it');
    return this.issueLink({ campaignId, leadId: lid, userId, preview: true });
  }

  // ------------------------------------------------------------------- opt-out
  /** Every valid number of the lead (mobile and phone), E.164. */
  _leadNumbers(lead) {
    const out = new Set();
    for (const raw of [lead.mobile, lead.phone].filter(Boolean)) {
      for (const n of [normalizePhone(raw, lead.address?.country || 'PK'), normalizePhone(raw)]) if (n.valid) out.add(n.e164);
    }
    return [...out];
  }

  /**
   * The lead asked not to be contacted (page button/chat, STOP reply received by the
   * company build, or a STOP reply the user saw and recorded). One rule for every path:
   * calls + SMS suppressed, SMS consent revoked, every open link conversation closed through
   * the existing do-not-contact outcome (lead status, audit, review), queued SMS-agent
   * messages cancelled. Idempotent per dedupeKey; effects are idempotent too, so a retry
   * after a crash completes the job.
   */
  async optOutLead({ leadId, actor, source, keyword = null, dedupeKey = null, receivedAt = new Date(), meta = {}, exceptSmsConversationId = null }) {
    const lead = await Lead.findById(leadId).select('_id name phone mobile address').lean();
    if (!lead) throw new NotFoundError('Lead', leadId);
    const key = dedupeKey || `${source}:${leadId}`;
    const already = await OptOutEvent.findOne({ dedupeKey: key }).lean();
    const now = new Date();

    const e164s = this._leadNumbers(lead);
    const { callHashes, smsSuppressed } = await suppressLeadContact({ leadId: lead._id, userId: actor, source: `opt_out:${source}`, e164s, now });
    await LeadChannelConsent.updateOne(
      { leadId: lead._id, channel: 'sms' },
      { $set: { status: 'revoked', evidence: `Opt-out (${source})`, source: `opt_out:${source}`, capturedAt: now, changedBy: actor } },
      { upsert: true },
    );

    // Close every open link conversation of this lead (any campaign, any user).
    let sessionsClosed = 0;
    for (const session of await LinkSession.find({ leadId: lead._id, status: { $in: ['issued', 'opened', 'active'] } })) {
      await aiCallingService.agentDoNotContact(session.internalCallId).catch(() => {});
      await LinkSession.updateOne(
        { _id: session._id, status: { $in: ['issued', 'opened', 'active'] } },
        { $set: { status: 'opted_out', outcome: 'opted_out', closedAt: now, 'funnel.opted_out': now, 'tokens.$[].revokedAt': now } },
      );
      await this._finish(session).catch((e) => logger.warn('opt-out processing failed', { module: 'link-assistant', sessionId: String(session._id), error: e.message }));
      sessionsClosed += 1;
    }
    const { default: simSmsService } = await import('../simSms/simSms.service.js');
    // The SMS-agent conversation that received the STOP is ended by its own flow.
    const { cancelled } = await simSmsService.cancelLeadConversations(lead._id, { exceptId: exceptSmsConversationId });

    const effects = { sessionsClosed, smsConversationsCancelled: cancelled, callHashes: callHashes.length, smsSuppressed };
    if (already) return { optedOut: true, duplicate: true, effects };
    try {
      await OptOutEvent.create({ leadId: lead._id, source, keyword, dedupeKey: key, receivedAt, recordedBy: actor, effects });
    } catch (error) {
      if (error?.code === 11000) return { optedOut: true, duplicate: true, effects };
      throw error;
    }
    linkEvent(`opt_out_${source}`);
    auditService.logEvent({
      eventType: 'lead.opted_out', userId: actor, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent,
      result: 'success', module: 'link-assistant', details: { leadId: String(lead._id), source, sessionsClosed, smsSuppressed },
    });
    emitToOwner(actor, 'link-assistant:opt-out', { leadId: String(lead._id), source });
    logger.info('lead opted out', { module: 'link-assistant', leadId: String(lead._id), source, sessionsClosed });
    return { optedOut: true, duplicate: false, effects };
  }

  /** Whether the lead can still be contacted, and the latest opt-out (for the CRM and the app). */
  async contactStatus(leadId) {
    const lead = await Lead.findById(leadId).select('_id phone mobile address').lean();
    if (!lead) throw new NotFoundError('Lead', leadId);
    const e164s = this._leadNumbers(lead);
    const [sms, calls, latest] = await Promise.all([
      e164s.length ? MessageSuppression.exists({ channel: 'sms', destinationHash: { $in: e164s.map((e) => destinationHash('sms', e)) } }) : null,
      e164s.length ? CallSuppression.exists({ phoneHash: { $in: e164s.map((e) => phoneHash(e)) } }) : null,
      OptOutEvent.findOne({ leadId: lead._id }).sort({ receivedAt: -1 }).select('source receivedAt keyword').lean(),
    ]);
    return {
      leadId: String(lead._id), smsBlocked: Boolean(sms), callsBlocked: Boolean(calls), optedOut: Boolean(sms || latest),
      lastOptOut: latest ? { source: latest.source, at: latest.receivedAt } : null,
    };
  }

  /** Numbers whose STOP replies the company build should upload: open link conversations of this user. */
  async watchNumbers(actor, limit = 1000) {
    const sessions = await LinkSession.find({ createdBy: actor, isTest: false, status: { $in: ['issued', 'opened', 'active'] } })
      .select('recipientId').limit(limit).lean();
    const recipients = await CampaignRecipient.find({ _id: { $in: sessions.map((x) => x.recipientId) } }).select('phoneSnapshot').lean();
    return [...new Set(recipients.map((r) => r.phoneSnapshot).filter(Boolean))];
  }

  /**
   * An SMS reply from a link-campaign lead, received by the company build. Only an
   * exact opt-out keyword counts ("STOP", "band karo", …); any other reply is ignored
   * and not stored (the assistant page is where conversations happen).
   */
  async inboundSmsReply(actor, { from, body, deviceMessageKey, receivedAt = null }) {
    const keyword = String(body || '').trim().slice(0, 40);
    if (!isStopRequest(keyword)) return { matched: false, reason: 'not_an_opt_out' };
    const hashes = [normalizePhone(from, 'PK'), normalizePhone(from)].filter((n) => n.valid).map((n) => phoneHash(n.e164));
    if (!hashes.length) return { matched: false, reason: 'invalid_number' };
    const recipients = await CampaignRecipient.find({ phoneHash: { $in: hashes }, createdBy: actor }).select('_id leadId').lean();
    const leadIds = [...new Set(recipients.map((r) => String(r.leadId)))];
    if (!leadIds.length) return { matched: false, reason: 'unknown_number' };
    const results = [];
    for (const leadId of leadIds) {
      results.push(await this.optOutLead({
        leadId, actor, source: 'sms_reply_device', keyword: keyword.toUpperCase().slice(0, 40),
        dedupeKey: `sms:${deviceMessageKey}:${leadId}`, receivedAt: receivedAt ? new Date(receivedAt) : new Date(),
      }));
    }
    return { matched: true, intent: 'stop', leads: leadIds.length, duplicate: results.every((r) => r.duplicate) };
  }

  // ------------------------------------------------------- SMS funnel hooks
  async onSmsOutcome(operationId, sendStatus, at = new Date()) {
    if (!operationId) return;
    const sent = ['device_sent', 'device_delivered', 'user_reported_sent', 'sent_by_app'].includes(sendStatus);
    if (!sent) return;
    await LinkSession.updateOne({ 'tokens.operationId': operationId, 'funnel.sms_sent': null }, { $set: { 'funnel.sms_sent': at } });
    if (sendStatus === 'device_delivered') await this.onSmsDelivered(operationId, at);
  }

  async onSmsDelivered(operationId, at = new Date()) {
    if (!operationId) return;
    await LinkSession.updateOne({ 'tokens.operationId': operationId, 'funnel.delivered': null }, { $set: { 'funnel.delivered': at } });
  }

  // ------------------------------------------------------------ public access
  /** Resolve a token to its session; never reveals whether a token ever existed. */
  async _resolve(token, now = new Date()) {
    if (!isWellFormedToken(token)) throw new LinkError('LINK_NOT_FOUND');
    const hash = hashToken(token);
    const session = await LinkSession.findOne({ 'tokens.hash': hash });
    if (!session) throw new LinkError('LINK_NOT_FOUND');
    const entry = session.tokens.find((t) => t.hash === hash);
    if (entry.revokedAt || session.status === 'revoked') throw new LinkError('LINK_REVOKED', 410);
    if (session.status === 'opted_out') throw new LinkError('LINK_OPTED_OUT', 410);
    if (session.status !== 'completed' && (entry.expiresAt < now || session.expiresAt < now)) {
      if (!CLOSED_SESSION_STATUSES.has(session.status)) await this._expire(session, now);
      throw new LinkError('LINK_EXPIRED', 410);
    }
    const campaign = await CallCampaign.findById(session.campaignId).lean();
    if (!campaign) throw new LinkError('LINK_NOT_FOUND');
    return { session, campaign, entry };
  }

  /** Server-rendered bootstrap for the page (minimum data: first name, reason, company). */
  async pageModel(token, deviceId) {
    const { session, campaign } = await this._resolve(token);
    const cfg = linkConfigOf(campaign);
    const deviceKnown = deviceId && session.deviceHashes.includes(hashDevice(deviceId));
    const started = session.funnel?.chat_started || session.turns > 0;
    const needsVerify = started && !deviceKnown && Boolean(await this._last4(session));
    const paused = await this.isPaused();
    const state = needsVerify ? null : await this._state(session);
    const plan = state && !CLOSED_SESSION_STATUSES.has(session.status)
      ? (session.awaiting === 'start' || !state.disclosed
        ? planForState({ questionnaire: campaign.questionnaire, state, language: session.language })
        : this._planFromAwaiting(campaign, session, state))
      : null;
    return {
      view: needsVerify ? 'verify' : (session.status === 'completed' ? 'completed' : 'chat'),
      company: companyOf(campaign),
      persona: cfg.personaName,
      language: session.language,
      languages: cfg.languages,
      displayName: session.displayName,
      voiceTier: cfg.voiceTier,
      whatsappShare: false,
      paused,
      status: session.status,
      greeting: session.greeting,
      transcript: needsVerify ? [] : session.transcript.filter((t) => t.role !== 'system').map((t) => ({ role: t.role, text: t.text })),
      quickReplies: plan?.quickReplies || [],
      inputMode: plan?.inputMode || 'text',
      progress: state ? qEngine.progress(campaign.questionnaire, state) : null,
      privacyUrl: process.env.LINK_ASSISTANT_PRIVACY_URL || '',
      termsUrl: process.env.LINK_ASSISTANT_TERMS_URL || '',
      isPreview: session.isTest,
    };
  }

  _planFromAwaiting(campaign, session, state) {
    const base = planForState({ questionnaire: campaign.questionnaire, state, language: session.language });
    if (session.awaiting === 'callback_time' || session.awaiting === 'human_note') return { ...base, quickReplies: [], inputMode: 'text' };
    return base;
  }

  async _state(session) {
    const call = await CallRecord.findById(session.callRecordId).select('conversationState').lean();
    return qEngine.normalizeState(call?.conversationState);
  }

  async _last4(session) {
    const recipient = await CampaignRecipient.findById(session.recipientId).select('phoneSnapshot').lean();
    const digits = String(recipient?.phoneSnapshot || '').replace(/\D/g, '');
    return digits.length >= 4 ? digits.slice(-4) : null;
  }

  /** The page's JavaScript ran: count the open, register the device on first use. */
  async markOpened(token, deviceId, now = new Date()) {
    const { session } = await this._resolve(token, now);
    const device = hashDevice(deviceId);
    const started = session.funnel?.chat_started || session.turns > 0;
    const known = session.deviceHashes.includes(device);
    const update = { $set: { lastActivityAt: now } };
    if (!session.funnel?.link_opened) update.$set['funnel.link_opened'] = now;
    if (session.status === 'issued') update.$set.status = 'opened';
    if (!known && (!started || !(await this._last4(session)))) update.$addToSet = { deviceHashes: device };
    await LinkSession.updateOne({ _id: session._id }, update);
    if (!session.funnel?.link_opened) linkEvent('link_opened');
    if (!session.funnel?.link_opened) emitToOwner(session.createdBy, 'link-assistant:session', { sessionId: String(session._id), status: 'opened' });
    return { verified: known || !started || !(await this._last4(session)) };
  }

  /** New device on a started conversation: confirm the last 4 digits of the phone number. */
  async verifyDevice(token, deviceId, last4, now = new Date()) {
    const { session } = await this._resolve(token, now);
    if (session.lockedUntil && session.lockedUntil > now) throw new LinkError('VERIFY_LOCKED', 429);
    const expected = await this._last4(session);
    const ok = expected && String(last4 || '').replace(/\D/g, '') === expected;
    if (!ok) {
      const failures = session.verifyFailures + 1;
      await LinkSession.updateOne({ _id: session._id }, {
        $set: { verifyFailures: failures, ...(failures >= MAX_VERIFY_ATTEMPTS ? { lockedUntil: new Date(now.getTime() + HOUR), verifyFailures: 0 } : {}) },
      });
      throw new LinkError('VERIFY_FAILED', 403);
    }
    await LinkSession.updateOne({ _id: session._id }, { $addToSet: { deviceHashes: hashDevice(deviceId) }, $set: { verifyFailures: 0 } });
    return { verified: true };
  }

  async setLanguage(token, deviceId, language) {
    const { session, campaign } = await this._authorized(token, deviceId);
    const cfg = linkConfigOf(campaign);
    if (!cfg.languages.includes(language)) throw new ValidationError('Unsupported language');
    const greeting = copyFor(language).greeting({
      name: session.displayName, persona: cfg.personaName, company: companyOf(campaign), reason: cfg.reason, minutes: cfg.estimatedMinutes,
    });
    await LinkSession.updateOne({ _id: session._id }, { $set: { language, languageLocked: true, ...(session.turns === 0 ? { greeting } : {}) } });
    return this.pageModel(token, deviceId);
  }

  async _authorized(token, deviceId) {
    const resolved = await this._resolve(token);
    const { session } = resolved;
    const device = deviceId ? hashDevice(deviceId) : null;
    if (!device || !session.deviceHashes.includes(device)) {
      // A device that never opened the page, or an unverified second device.
      throw new LinkError('DEVICE_NOT_VERIFIED', 403);
    }
    return resolved;
  }

  // ---------------------------------------------------------------- chat turn
  _tools(session, campaign) {
    const id = session.internalCallId;
    const state = async () => this._state(session);
    return {
      getState: state,
      disclose: async () => {
        await aiCallingService.agentDisclose(id);
        await CallRecord.updateOne({ _id: session.callRecordId, state: 'queued' }, { $set: { state: 'in_progress', answeredAt: new Date(), initiatedAt: new Date() } });
        return state();
      },
      recordAnswer: async (fieldKey, raw) => { await aiCallingService.agentRecordAnswer(id, { fieldKey, rawAnswer: raw }); return state(); },
      markUnknown: async (fieldKey) => { await aiCallingService.agentMarkUnknown(id, { fieldKey }); return state(); },
      confirm: async (fieldKey) => { await aiCallingService.agentConfirm(id, { fieldKey }); return state(); },
      resetAnswer: async (fieldKey) => { const r = await aiCallingService.agentResetAnswer(id, { fieldKey }); return r.state; },
      callback: async ({ when, note, human = false }) => {
        await aiCallingService.agentRequestCallback(id, { when, note, human });
        return this._finish(session, campaign);
      },
      doNotContact: async () => {
        await aiCallingService.agentDoNotContact(id).catch((e) => { if (!(e instanceof ConflictError)) throw e; });
        return this._finish(session, campaign);
      },
      finish: async () => this._finish(session, campaign),
    };
  }

  async _finish(session) {
    return aiCallingService.processCallResults(session.callRecordId, { source: 'link_assistant' });
  }

  _classifier(sessionId, usageSink) {
    if (!isAiConfigured()) return null;
    const { model, prices } = modelSettings();
    return async (system, user) => {
      const client = await createOpenAiClient();
      const response = await client.chat.completions.create({
        model, temperature: 0, max_tokens: 120, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }, { timeout: 8_000 });
      usageSink(response?.usage, prices);
      const raw = response?.choices?.[0]?.message?.content || '';
      return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    };
  }

  async _spendAllowed(campaign, cfg) {
    if (!cfg.limits.dailySpendCap) return true;
    const spend = await LinkSpend.findOne({ campaignId: campaign._id, day: utcDay() }).select('amount').lean();
    return (spend?.amount || 0) < cfg.limits.dailySpendCap;
  }

  async _recordSpend(campaign, cfg, amount) {
    if (!amount) return;
    const spend = await LinkSpend.findOneAndUpdate(
      { campaignId: campaign._id, day: utcDay() },
      { $inc: { amount } },
      { upsert: true, returnDocument: 'after' },
    );
    if (cfg.limits.dailySpendCap && spend.amount >= cfg.limits.dailySpendCap && !spend.capHitAt) {
      await LinkSpend.updateOne({ _id: spend._id, capHitAt: null }, { $set: { capHitAt: new Date() } });
      linkEvent('spend_cap_paused');
      await CallCampaign.updateOne({ _id: campaign._id, status: 'running' }, { $set: { status: 'paused', pausedAt: new Date() } });
      logger.warn('link assistant daily spend cap reached; campaign paused', { module: 'link-assistant', campaignId: String(campaign._id), amount: spend.amount });
      notificationService.create({
        channels: ['IN_APP'], recipientIds: [campaign.createdBy], type: 'link_assistant.spend_cap', category: 'CRM', priority: 'HIGH',
        payload: { title: `SMS link campaign paused: daily AI budget reached (${campaign.name})`, message: 'Open conversations continue without the AI model. Raise the cap or resume tomorrow.', campaignId: String(campaign._id) },
        sourceModule: 'link-assistant', sourceEvent: 'SPEND_CAP', sourceEntityType: 'CallCampaign', sourceEntityId: campaign._id,
        idempotencyKey: `link-spend-cap-${campaign._id}-${utcDay()}`,
      }, campaign.createdBy).catch(() => {});
    }
  }

  async _notifyOpenQuestion(session, campaign, text) {
    const lead = await Lead.findById(session.leadId).select('name assignedTo').lean();
    notificationService.create({
      channels: ['IN_APP'], recipientIds: [lead?.assignedTo || campaign.createdBy], type: 'link_assistant.question', category: 'CRM', priority: 'NORMAL',
      payload: { title: `Question from ${lead?.name || 'a lead'} (SMS link)`, message: String(text).slice(0, 300), leadId: String(session.leadId), campaignId: String(campaign._id) },
      sourceModule: 'link-assistant', sourceEvent: 'OPEN_QUESTION', sourceEntityType: 'LinkSession', sourceEntityId: session._id,
      idempotencyKey: `link-question-${session._id}-${session.turns}`,
    }, campaign.createdBy).catch(() => {});
  }

  async _notifyHuman(session, campaign) {
    const lead = await Lead.findById(session.leadId).select('name assignedTo').lean();
    notificationService.create({
      channels: ['IN_APP'], recipientIds: [lead?.assignedTo || campaign.createdBy], type: 'link_assistant.human_requested', category: 'CRM', priority: 'HIGH',
      payload: { title: `${lead?.name || 'A lead'} asked to talk to a person`, message: 'Requested in the SMS link assistant. Please contact them within one working day.', leadId: String(session.leadId), campaignId: String(campaign._id) },
      sourceModule: 'link-assistant', sourceEvent: 'HUMAN_REQUESTED', sourceEntityType: 'LinkSession', sourceEntityId: session._id,
      idempotencyKey: `link-human-${session._id}`,
    }, campaign.createdBy).catch(() => {});
  }

  /**
   * Handle one customer message or button. Emits events through `emit`:
   *   { type: 'token', text } — streamed reply text
   *   { type: 'replace', text } — discard streamed text and show this instead
   *   { type: 'done', reply, quickReplies, inputMode, progress, status, ended }
   * Idempotent per clientMessageId (a retried send returns the stored reply).
   */
  async handleMessage(token, deviceId, input, emit = () => {}, deps = {}) {
    const started = Date.now();
    let firstReplyAt = null;
    const rawEmit = emit;
    emit = (event) => {
      if (!firstReplyAt && (event.type === 'token' || event.type === 'replace')) {
        firstReplyAt = Date.now();
        observeFirstReply(firstReplyAt - started, event.type === 'token' ? 'model' : 'template');
      }
      rawEmit(event);
    };
    const { session: loaded, campaign } = await this._authorized(token, deviceId);
    const cfg = linkConfigOf(campaign);
    const text = String(input.text || '').slice(0, MAX_MESSAGE_CHARS).trim();
    const action = input.action ? String(input.action).slice(0, 120) : null;
    const clientMessageId = input.clientMessageId ? String(input.clientMessageId).slice(0, 64) : null;
    if (!text && !action) throw new ValidationError('Empty message');

    // Replay of a message we already answered (reconnect / retry): return the stored reply.
    if (clientMessageId) {
      const idx = loaded.transcript.findIndex((t) => t.clientMessageId === clientMessageId);
      if (idx !== -1) {
        const reply = loaded.transcript.slice(idx + 1).find((t) => t.role === 'assistant');
        if (reply) {
          const state = await this._state(loaded);
          const plan = CLOSED_SESSION_STATUSES.has(loaded.status) ? null : this._planFromAwaiting(campaign, loaded, state);
          emit({ type: 'replace', text: reply.text });
          const done = { type: 'done', reply: reply.text, quickReplies: plan?.quickReplies || [], inputMode: plan?.inputMode || 'none', progress: qEngine.progress(campaign.questionnaire, state), status: loaded.status, ended: CLOSED_SESSION_STATUSES.has(loaded.status), replay: true };
          emit(done);
          return done;
        }
      }
    }

    if (CLOSED_SESSION_STATUSES.has(loaded.status)) throw new LinkError('SESSION_CLOSED', 409);
    if (await this.isPaused()) {
      const reply = copyFor(loaded.language).trouble;
      emit({ type: 'replace', text: reply });
      const done = { type: 'done', reply, quickReplies: [], inputMode: 'text', status: loaded.status, paused: true };
      emit(done);
      return done;
    }

    // One turn at a time per session.
    const now = new Date();
    const session = await LinkSession.findOneAndUpdate(
      { _id: loaded._id, $or: [{ turnLockUntil: null }, { turnLockUntil: { $lt: now } }] },
      { $set: { turnLockUntil: new Date(now.getTime() + TURN_LOCK_MS) } },
      { returnDocument: 'after' },
    );
    if (!session) throw new LinkError('TURN_IN_PROGRESS', 429);

    try {
      // Language: auto-detect from the first free-text reply unless the customer chose one.
      let language = session.language;
      if (!session.languageLocked && text && session.turns === 0) {
        const detected = detectLanguage(text);
        if (detected && cfg.languages.includes(detected)) language = detected;
      }
      const sessionView = { language, awaiting: session.awaiting, turn: session.turns, personaName: cfg.personaName, companyName: companyOf(campaign) };

      // Hard limits: turns and session length end the conversation politely (partial → review).
      const chatStartedAt = session.funnel?.chat_started ? new Date(session.funnel.chat_started) : null;
      const overLimit = session.turns >= cfg.limits.maxTurns
        || (chatStartedAt && now.getTime() - chatStartedAt.getTime() > cfg.limits.maxSessionMinutes * 60_000);

      const usage = { prompt_tokens: 0, completion_tokens: 0, calls: 0, cost: 0 };
      const sink = (u, prices) => {
        if (!u) return;
        usage.prompt_tokens += u.prompt_tokens || 0;
        usage.completion_tokens += u.completion_tokens || 0;
        usage.calls += 1;
        usage.cost += costOf(u, prices);
      };
      const modelAllowed = deps.modelAllowed ?? (isAiConfigured() && await this._spendAllowed(campaign, cfg));
      const classify = deps.classify !== undefined ? deps.classify : (modelAllowed ? this._classifier(String(session._id), sink) : null);
      const tools = this._tools(session, campaign);

      let result;
      if (overLimit) {
        await tools.finish();
        result = { plan: { kind: 'ended', fallback: copyFor(language).thanks({ company: companyOf(campaign) }), quickReplies: [], inputMode: 'none' }, awaiting: null, outcome: 'partial', events: [], intent: 'limit' };
      } else {
        try {
          result = await runTurn({ campaign: { ...campaign, linkConfig: cfg }, session: sessionView, input: { text, action }, tools, classify });
        } catch (error) {
          logger.error('link assistant turn failed', { module: 'link-assistant', sessionId: String(session._id), error: error.message });
          const reply = copyFor(language).trouble;
          await this._appendTurns(session, [{ role: 'customer', text: text || labelForAction(action, language), clientMessageId, source: 'customer' }, { role: 'assistant', text: reply, kind: 'error', source: 'template' }], {});
          emit({ type: 'replace', text: reply });
          const done = { type: 'done', reply, quickReplies: [], inputMode: 'text', status: session.status, error: true };
          emit(done);
          return done;
        }
      }

      // Side effects decided by the engine.
      if (result.intent === 'human' && result.awaiting === 'human_note') await this._notifyHuman(session, campaign);
      if (result.plan.kind === 'question' && !matchFaq(cfg.faq, result.plan.customerQuestion)) {
        await this._notifyOpenQuestion(session, campaign, result.plan.customerQuestion);
        await LinkSession.updateOne({ _id: session._id }, { $push: { openQuestions: { $each: [{ text: String(result.plan.customerQuestion).slice(0, 500), at: new Date() }], $slice: -20 } } });
      }

      // Compose the reply: the model phrases ordinary turns; everything else is deterministic.
      let reply = result.plan.fallback;
      let source = 'template';
      const state = await this._state(session);
      const progress = qEngine.progress(campaign.questionnaire, state);
      if (modelAllowed && shouldUseModel(result.plan)) {
        const composed = await this._compose({ session, campaign, cfg, language, plan: result.plan, text, emit, sink, deps });
        if (composed) { reply = composed; source = 'model'; }
      }
      if (source === 'template') emit({ type: 'replace', text: reply });

      const ended = Boolean(result.outcome) || result.plan.kind === 'ended';
      const set = {
        awaiting: result.awaiting ?? null, language, lastActivityAt: new Date(), turnLockUntil: null,
      };
      if (result.events.includes('chat_started') && !session.funnel?.chat_started) { set['funnel.chat_started'] = new Date(); set.status = 'active'; }
      if (session.status === 'issued' || session.status === 'opened') set.status = set.status || (state.disclosed ? 'active' : session.status);
      if (ended) {
        const outcome = result.outcome || 'partial';
        set.outcome = outcome;
        set.status = outcome === 'opted_out' ? 'opted_out' : 'completed';
        set.closedAt = new Date();
        set.transcriptPurgeAt = new Date(Date.now() + cfg.transcriptRetentionDays * DAY);
        set[`funnel.${outcome === 'opted_out' ? 'opted_out' : 'completed'}`] = new Date();
      }
      await this._appendTurns(session, [
        { role: 'customer', text: text || labelForAction(action, language), clientMessageId, source: 'customer' },
        { role: 'assistant', text: reply, kind: result.plan.kind, source },
      ], set, usage);
      if (usage.cost) { addCost(usage.cost); await this._recordSpend(campaign, cfg, usage.cost); }
      for (const event of result.events) linkEvent(event);
      if (ended) {
        emitToOwner(session.createdBy, 'link-assistant:session', { sessionId: String(session._id), status: set.status, outcome: set.outcome });
        if (set.status === 'opted_out' && !session.isTest) {
          await this.optOutLead({ leadId: session.leadId, actor: session.createdBy, source: 'web_link', keyword: text ? null : 'button', dedupeKey: `web_link:${session._id}`, meta: { ipAddress: 'customer' } })
            .catch((e) => logger.error('opt-out propagation failed', { module: 'link-assistant', sessionId: String(session._id), error: e.message }));
        }
      } else if (result.events.includes('chat_started')) {
        emitToOwner(session.createdBy, 'link-assistant:session', { sessionId: String(session._id), status: 'active' });
      }
      logger.info('link assistant turn', {
        module: 'link-assistant', sessionId: String(session._id), campaignId: String(campaign._id), leadId: String(session.leadId),
        kind: result.plan.kind, intent: result.intent, source, ms: Date.now() - started,
      });
      const done = {
        type: 'done', reply, quickReplies: ended ? [] : (result.plan.quickReplies || []), inputMode: ended ? 'none' : (result.plan.inputMode || 'text'),
        progress, status: set.status || session.status, ended, language,
      };
      emit(done);
      return done;
    } finally {
      await LinkSession.updateOne({ _id: session._id }, { $set: { turnLockUntil: null } });
    }
  }

  async _compose({ session, campaign, cfg, language, plan, text, emit, sink, deps }) {
    const { model, prices } = modelSettings();
    const messages = buildComposerMessages({
      persona: cfg.personaName, company: companyOf(campaign), tone: cfg.personaTone, language,
      objective: campaign.agentConfig?.objective, faq: cfg.faq, plan,
      history: session.transcript.slice(-HISTORY_TURNS_FOR_MODEL).map((t) => ({ role: t.role === 'customer' ? 'user' : 'assistant', text: t.text })),
      customerText: text,
    });
    let streamed = '';
    let aborted = false;
    try {
      const client = deps.llmClient || await createOpenAiClient();
      const { text: out, usage } = await streamCompletion({
        client, model, messages, maxTokens: cfg.limits.maxTokensPerTurn,
        onToken: (delta) => {
          if (aborted) return;
          streamed += delta;
          // Guard while streaming: stop showing text as soon as it breaks a rule.
          if (!checkModelOutput(streamed) && streamed.trim().length > 0 && streamed.length <= 700) {
            aborted = true;
            return;
          }
          emit({ type: 'token', text: delta });
        },
      });
      sink(usage, prices);
      const checked = checkModelOutput(out);
      if (!checked || aborted) {
        emit({ type: 'replace', text: plan.fallback });
        return null;
      }
      return checked;
    } catch (error) {
      await LinkSession.updateOne({ _id: session._id }, { $inc: { 'usage.modelFailures': 1 } });
      linkEvent('model_failure');
      logger.warn('link assistant model failed; deterministic reply used', { module: 'link-assistant', sessionId: String(session._id), error: error.message });
      if (streamed) emit({ type: 'replace', text: plan.fallback });
      return null;
    }
  }

  async _appendTurns(session, turns, set = {}, usage = null) {
    const update = {
      $push: { transcript: { $each: turns.map((t) => ({ ...t, at: new Date() })), $slice: -MAX_TRANSCRIPT_TURNS } },
      $inc: { turns: 1 },
      $set: { ...set, turnLockUntil: null },
    };
    if (usage) {
      update.$inc['usage.promptTokens'] = usage.prompt_tokens;
      update.$inc['usage.completionTokens'] = usage.completion_tokens;
      update.$inc['usage.modelCalls'] = usage.calls;
      update.$inc['usage.cost'] = usage.cost;
    }
    await LinkSession.updateOne({ _id: session._id }, update);
  }

  // ------------------------------------------------------------- maintenance
  async _expire(session, now = new Date()) {
    const updated = await LinkSession.findOneAndUpdate(
      { _id: session._id, status: { $in: ['issued', 'opened', 'active'] } },
      { $set: { status: 'expired', outcome: session.funnel?.chat_started ? 'partial' : 'expired', closedAt: now, 'funnel.expired': now } },
      { returnDocument: 'after' },
    );
    if (updated?.funnel?.chat_started) await this._finish(updated).catch(() => {});
    else if (updated) await CallRecord.updateOne({ _id: updated.callRecordId, resultsProcessedAt: null }, { $set: { state: 'cancelled', disposition: 'no_answer', endedAt: now, resultsProcessedAt: now } });
  }

  /**
   * Periodic sweep: expire links, process abandoned conversations (partial
   * answers → review), queue the human-call fallback and purge transcripts.
   */
  async sweep(now = new Date()) {
    const result = { expired: 0, abandoned: 0, purged: 0, fallbackQueued: 0 };
    for (const s of await LinkSession.find({ status: { $in: ['issued', 'opened', 'active'] }, expiresAt: { $lt: now } }).limit(200)) {
      await this._expire(s, now);
      result.expired += 1;
    }
    const idleBefore = new Date(now.getTime() - INACTIVITY_ABANDON_HOURS * HOUR);
    for (const s of await LinkSession.find({ status: 'active', lastActivityAt: { $lt: idleBefore } }).limit(200)) {
      const claimed = await LinkSession.findOneAndUpdate(
        { _id: s._id, status: 'active' },
        { $set: { status: 'abandoned', outcome: 'partial', closedAt: now, 'funnel.abandoned': now } },
      );
      if (claimed) {
        await this._finish(s).catch((e) => logger.warn('abandon processing failed', { module: 'link-assistant', sessionId: String(s._id), error: e.message }));
        result.abandoned += 1;
      }
    }
    const purge = await LinkSession.updateMany({ transcriptPurgeAt: { $lt: now } }, { $set: { transcript: [], transcriptPurgeAt: null } });
    result.purged = purge.modifiedCount || 0;
    result.fallbackQueued = await this._queueFallbackCalls(now);
    return result;
  }

  /** No reply after the last reminder: optionally hand the lead to a human SIM call queue. */
  async _queueFallbackCalls(now) {
    const campaigns = await CallCampaign.find({ channel: 'web_link', 'linkConfig.fallbackToCall.enabled': true, 'linkConfig.fallbackToCall.simCallCampaignId': { $ne: null } }).lean();
    let queued = 0;
    for (const campaign of campaigns) {
      const cfg = linkConfigOf(campaign);
      const before = new Date(now.getTime() - cfg.fallbackToCall.afterHours * HOUR);
      const sessions = await LinkSession.find({
        campaignId: campaign._id, isTest: false, status: { $in: ['issued', 'opened'] }, fallbackCallQueuedAt: null,
        'reminders.sent': { $gte: cfg.reminders.enabled ? cfg.reminders.max : 0 },
        $or: [{ 'reminders.lastSentAt': { $lt: before } }, { 'reminders.lastSentAt': null, 'funnel.link_issued': { $lt: before } }],
      }).limit(100);
      for (const s of sessions) {
        try {
          const { default: simCallService } = await import('../simCall/simCall.service.js');
          if (typeof simCallService.addLeads !== 'function') break;
          await simCallService.addLeads(cfg.fallbackToCall.simCallCampaignId, [String(s.leadId)], campaign.createdBy);
          await LinkSession.updateOne({ _id: s._id }, { $set: { fallbackCallQueuedAt: now } });
          queued += 1;
        } catch (e) {
          logger.warn('fallback to call queue failed', { module: 'link-assistant', sessionId: String(s._id), error: e.message });
        }
      }
    }
    return queued;
  }

  /** Leads whose link is still unanswered and due a reminder (sent from the user's phone, inside hours). */
  async dueReminders(actor, now = new Date()) {
    const campaigns = await CallCampaign.find({ createdBy: actor, channel: 'web_link', status: 'running', 'linkConfig.reminders.enabled': true }).lean();
    const out = [];
    for (const campaign of campaigns) {
      const cfg = linkConfigOf(campaign);
      if (!windowState(campaign.schedule || {}, now).open) continue;
      const before = new Date(now.getTime() - cfg.reminders.afterHours * HOUR);
      const sessions = await LinkSession.find({
        campaignId: campaign._id, isTest: false, status: { $in: ['issued', 'opened', 'active'] }, expiresAt: { $gt: now },
        'reminders.sent': { $lt: cfg.reminders.max }, lastActivityAt: { $lt: before },
        $or: [{ 'reminders.lastSentAt': null }, { 'reminders.lastSentAt': { $lt: before } }],
      }).select('leadId status reminders').limit(500).lean();
      for (const s of sessions) out.push({ campaignId: String(campaign._id), campaignName: campaign.name, leadId: String(s.leadId), sessionId: String(s._id), status: s.status, remindersSent: s.reminders.sent });
    }
    return out;
  }

  // ----------------------------------------------------------------- CRM views
  async _ownedCampaign(campaignId, actor) {
    const campaign = await CallCampaign.findOne({ _id: campaignId, createdBy: actor }).lean();
    if (!campaign) throw new NotFoundError('CallCampaign', campaignId);
    return campaign;
  }

  async listSessions(actor, { campaignId = null, status = null, leadId = null, page = 1, limit = 25 } = {}) {
    const filter = { createdBy: actor };
    if (campaignId) filter.campaignId = campaignId;
    if (status) filter.status = status;
    if (leadId) filter.leadId = leadId;
    const [rows, total] = await Promise.all([
      LinkSession.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit)
        .select('-tokens -deviceHashes -transcript -greeting').lean(),
      LinkSession.countDocuments(filter),
    ]);
    const leads = await Lead.find({ _id: { $in: rows.map((r) => r.leadId) } }).select('name').lean();
    const names = new Map(leads.map((l) => [String(l._id), l.name]));
    return { data: rows.map((r) => this._serialize(r, names.get(String(r.leadId)))), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  _serialize(s, leadName = null) {
    return {
      id: String(s._id), campaignId: String(s.campaignId), leadId: String(s.leadId), leadName, callId: s.internalCallId,
      callRecordId: String(s.callRecordId),
      status: s.status, outcome: s.outcome, language: s.language, turns: s.turns, funnel: s.funnel, isTest: s.isTest,
      reminders: s.reminders, usage: { cost: s.usage?.cost || 0, modelCalls: s.usage?.modelCalls || 0 },
      expiresAt: s.expiresAt, lastActivityAt: s.lastActivityAt, createdAt: s.createdAt, closedAt: s.closedAt,
    };
  }

  async getSession(actor, id) {
    const s = await LinkSession.findOne({ _id: id, createdBy: actor }).select('-tokens -deviceHashes').lean();
    if (!s) throw new NotFoundError('LinkSession', id);
    const [lead, call, campaign] = await Promise.all([
      Lead.findById(s.leadId).select('name').lean(),
      CallRecord.findById(s.callRecordId).select('conversationState answers disposition qualification reviewRequired').lean(),
      CallCampaign.findById(s.campaignId).select('questionnaire name').lean(),
    ]);
    const state = qEngine.normalizeState(call?.conversationState);
    const answers = (campaign?.questionnaire?.questions || []).map((q) => {
      const a = state.answers[q.fieldKey];
      return {
        fieldKey: q.fieldKey, label: q.label, value: a?.validation === 'valid' ? a.normalizedValue : null,
        validation: a?.validation || null, confirmed: Boolean(a?.confirmed), unknown: a?.validation === 'unknown',
      };
    });
    return {
      ...this._serialize(s, lead?.name), campaignName: campaign?.name || null,
      transcript: s.transcript.map((t) => ({ role: t.role, text: t.text, at: t.at, source: t.source })),
      answers, disposition: call?.disposition || null, qualification: call?.qualification || null,
      reviewRequired: Boolean(call?.reviewRequired), openQuestions: s.openQuestions || [],
    };
  }

  async revoke(actor, id, meta = {}) {
    const s = await LinkSession.findOne({ _id: id, createdBy: actor });
    if (!s) throw new NotFoundError('LinkSession', id);
    const now = new Date();
    await LinkSession.updateOne({ _id: s._id }, { $set: { 'tokens.$[].revokedAt': now, ...(CLOSED_SESSION_STATUSES.has(s.status) ? {} : { status: 'revoked', closedAt: now }) } });
    if (s.funnel?.chat_started && !CLOSED_SESSION_STATUSES.has(s.status)) await this._finish(s).catch(() => {});
    auditService.logEvent({ eventType: 'link_assistant.revoked', userId: actor, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', module: 'link-assistant', details: { sessionId: id } });
    return { revoked: true };
  }

  /** Funnel, drop-off per question, unknown rate per question, timing. */
  async campaignAnalytics(actor, campaignId) {
    const campaign = await this._ownedCampaign(campaignId, actor);
    const sessions = await LinkSession.find({ campaignId: campaign._id, isTest: false }).select('funnel status outcome callRecordId usage').lean();
    const calls = await CallRecord.find({ _id: { $in: sessions.map((s) => s.callRecordId) } }).select('conversationState').lean();
    const stateById = new Map(calls.map((c) => [String(c._id), qEngine.normalizeState(c.conversationState)]));
    const funnel = {};
    for (const step of ['link_issued', 'sms_sent', 'delivered', 'link_opened', 'chat_started', 'completed', 'abandoned', 'opted_out', 'expired']) {
      funnel[step] = sessions.filter((s) => s.funnel?.[step]).length;
    }
    const questions = [...(campaign.questionnaire?.questions || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const perQuestion = questions.map((q) => ({ fieldKey: q.fieldKey, label: q.label, answered: 0, unknown: 0, dropOff: 0 }));
    const byKey = new Map(perQuestion.map((p) => [p.fieldKey, p]));
    const durations = [];
    for (const s of sessions) {
      const state = stateById.get(String(s.callRecordId));
      if (!state) continue;
      for (const [key, a] of Object.entries(state.answers)) {
        const row = byKey.get(key);
        if (!row) continue;
        if (a.validation === 'valid') row.answered += 1;
        if (a.validation === 'unknown') row.unknown += 1;
      }
      if (s.funnel?.chat_started && !s.funnel?.completed) {
        const action = qEngine.nextAction(campaign.questionnaire, state);
        if (action.question && byKey.has(action.question.fieldKey)) byKey.get(action.question.fieldKey).dropOff += 1;
      }
      if (s.funnel?.chat_started && s.funnel?.completed) durations.push(new Date(s.funnel.completed) - new Date(s.funnel.chat_started));
    }
    const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
    const totalCost = sessions.reduce((n, s) => n + (s.usage?.cost || 0), 0);
    return {
      campaignId: String(campaign._id), sessions: sessions.length, funnel,
      rates: {
        openRate: pct(funnel.link_opened, funnel.sms_sent || funnel.link_issued),
        startRate: pct(funnel.chat_started, funnel.link_opened),
        completionRate: pct(funnel.completed, funnel.chat_started),
        optOutRate: pct(funnel.opted_out, funnel.link_opened),
      },
      perQuestion: perQuestion.map((p) => ({ ...p, unknownRate: pct(p.unknown, p.answered + p.unknown) })),
      averageCompletionSeconds: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 1000) : null,
      cost: { total: Math.round(totalCost * 10000) / 10000, perCompleted: funnel.completed ? Math.round((totalCost / funnel.completed) * 10000) / 10000 : null },
    };
  }

  async exportCsv(actor, campaignId) {
    const campaign = await this._ownedCampaign(campaignId, actor);
    const sessions = await LinkSession.find({ campaignId: campaign._id, isTest: false }).lean();
    const [leads, calls] = await Promise.all([
      Lead.find({ _id: { $in: sessions.map((s) => s.leadId) } }).select('name').lean(),
      CallRecord.find({ _id: { $in: sessions.map((s) => s.callRecordId) } }).select('conversationState disposition qualification').lean(),
    ]);
    const names = new Map(leads.map((l) => [String(l._id), l.name]));
    const callsById = new Map(calls.map((c) => [String(c._id), c]));
    const questions = campaign.questionnaire?.questions || [];
    const rows = sessions.map((s) => {
      const call = callsById.get(String(s.callRecordId));
      const state = qEngine.normalizeState(call?.conversationState);
      const row = {
        lead: names.get(String(s.leadId)) || '', status: s.status, outcome: s.outcome || '', language: s.language,
        disposition: call?.disposition || '', qualification: call?.qualification || '',
        sms_sent: s.funnel?.sms_sent || '', opened: s.funnel?.link_opened || '', started: s.funnel?.chat_started || '', completed: s.funnel?.completed || '',
      };
      for (const q of questions) {
        const a = state.answers[q.fieldKey];
        row[q.fieldKey] = a?.validation === 'valid' ? (Array.isArray(a.normalizedValue) ? a.normalizedValue.join('; ') : String(a.normalizedValue)) : (a?.validation === 'unknown' ? 'unknown' : '');
      }
      return row;
    });
    return toCsv(rows.length ? Object.keys(rows[0]) : ['lead', 'status', 'outcome'], rows);
  }

  smsTemplates(campaign = null) {
    const overrides = campaign?.linkConfig?.smsTemplates || {};
    return Object.entries({ ...DEFAULT_SMS_TEMPLATES, ...overrides }).map(([language, template]) => ({
      language, template, stats: templateStats(template, { name: 'Ali', company: campaign ? companyOf(campaign) : 'Updata' }),
    }));
  }

  async campaignTemplates(actor, campaignId) {
    const campaign = campaignId ? await this._ownedCampaign(campaignId, actor) : null;
    return this.smsTemplates(campaign);
  }
}

const ACTION_COPY_KEYS = { __start: 'start', __not_now: 'notNow', __opt_out: 'noContact', __submit: 'submit', __edit: 'edit', __no_note: 'noNote' };

/** What the customer "said" by tapping a button, for the transcript. */
function labelForAction(action, language) {
  if (!action) return '';
  if (action.startsWith('__edit:')) return `${copyFor(language).edit}: ${action.slice(7)}`;
  const key = ACTION_COPY_KEYS[action];
  return key ? copyFor(language)[key] : action.replace(/^__/, '');
}

export default new LinkAssistantService();
