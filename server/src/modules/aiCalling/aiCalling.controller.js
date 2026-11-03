import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import service from './aiCalling.service.js';
import linkVoice from '../linkAssistant/linkVoice.service.js';
import callQuality from './callQuality.service.js';
import { telephonyHealth } from './providers/telephonyRouter.js';
import { mapLiveKitWebhook } from './providers/livekitWebhook.js';
import { AI_AGENT_LANGUAGES, defaultAgentLanguage } from './aiCalling.languages.js';

const meta = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });

class AiCallingController {
  async campaignRunStatus(req, res, next) { try { return res.success({ data: await service.campaignRunStatus(req.params.id, req.user._id) }); } catch (e) { next(e); } }
  // ---- campaigns (user-authenticated) ----
  async createCampaign(req, res, next) { try { return res.success({ data: await service.createCampaign(req.body, req.user._id, meta(req)), message: 'Call campaign created', statusCode: 201 }); } catch (e) { next(e); } }
  async listCampaigns(req, res, next) { try { return res.success(await service.listCampaigns(req.user._id, req._validatedQuery || req.query)); } catch (e) { next(e); } }
  async getCampaign(req, res, next) { try { return res.success({ data: await service.getCampaign(req.params.id, req.user._id) }); } catch (e) { next(e); } }
  async updateCampaign(req, res, next) { try { return res.success({ data: await service.updateCampaign(req.params.id, req.body, req.user._id), message: 'Campaign updated' }); } catch (e) { next(e); } }
  async previewCampaign(req, res, next) { try { return res.success({ data: await service.previewCampaign(req.params.id, req.user._id) }); } catch (e) { next(e); } }
  async startCampaign(req, res, next) { try { return res.success({ data: await service.startCampaign(req.params.id, req.user._id, req.body, meta(req)), message: 'Campaign started', statusCode: 202 }); } catch (e) { next(e); } }
  async pauseCampaign(req, res, next) { try { return res.success({ data: await service.pauseCampaign(req.params.id, req.user._id, meta(req)), message: 'Campaign paused' }); } catch (e) { next(e); } }
  async cancelCampaign(req, res, next) { try { return res.success({ data: await service.cancelCampaign(req.params.id, req.user._id, meta(req)), message: 'Campaign cancelled' }); } catch (e) { next(e); } }
  async listRecipients(req, res, next) { try { return res.success(await service.listRecipients(req.params.id, req.user._id, req._validatedQuery || req.query)); } catch (e) { next(e); } }
  async removeRecipients(req, res, next) { try { return res.success({ data: await service.removeRecipients(req.params.id, req.user._id, req.body, meta(req)) }); } catch (e) { next(e); } }
  async deleteCampaign(req, res, next) { try { return res.success({ data: await service.deleteCampaign(req.params.id, req.user._id), message: 'Campaign deleted' }); } catch (e) { next(e); } }
  async deleteCampaigns(req, res, next) { try { return res.success({ data: await service.deleteCampaigns(req.body.campaignIds, req.user._id) }); } catch (e) { next(e); } }
  async previewEligibility(req, res, next) { try { return res.success({ data: await service.previewEligibility(req.user._id, req.body) }); } catch (e) { next(e); } }
  async activeCalls(req, res, next) { try { return res.success({ data: await service.activeCalls(req.params.id, req.user._id) }); } catch (e) { next(e); } }
  async retryRecipients(req, res, next) { try { return res.success({ data: await service.retryRecipients(req.params.id, req.user._id, req.body, meta(req)), message: 'Recipients re-queued' }); } catch (e) { next(e); } }
  async exportCampaign(req, res, next) {
    try {
      const csv = await service.exportCampaign(req.params.id, req.user._id);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="ai-call-campaign-${req.params.id}.csv"`);
      return res.send(csv);
    } catch (e) { next(e); }
  }
  async getVoiceSettings(req, res, next) { try { return res.success({ data: await service.getVoiceSettings() }); } catch (e) { next(e); } }
  async setVoiceSettings(req, res, next) { try { return res.success({ data: await service.setVoicePaused(req.user._id, req.body, meta(req)), message: req.body.voicePaused ? 'AI voice calling paused' : 'AI voice calling resumed' }); } catch (e) { next(e); } }
  async simulate(req, res, next) { try { return res.success({ data: await service.simulate(req.params.id, req.user._id, req.body) }); } catch (e) { next(e); } }
  async webTest(req, res, next) { try { return res.success({ data: await service.startWebTest(req.params.id, req.user._id, req.body || {}), message: 'Browser voice test started' }); } catch (e) { next(e); } }
  async listCalls(req, res, next) { try { return res.success(await service.listCalls(req.user._id, req._validatedQuery || req.query)); } catch (e) { next(e); } }
  async monitorCall(req, res, next) { try { return res.success({ data: await service.monitorCall(req.params.id, req.user._id) }); } catch (e) { next(e); } }
  async agentLanguage(req, res, next) { try { return res.success({ data: await service.agentLanguage(req.agentCall.callId, req.body) }); } catch (e) { next(e); } }
  async agentBehavior(req, res, next) { try { return res.success({ data: await service.agentBehavior(req.agentCall.callId, req.body) }); } catch (e) { next(e); } }
  async agentNoResponse(req, res, next) { try { return res.success({ data: await service.agentNoResponse(req.agentCall.callId, req.body) }); } catch (e) { next(e); } }
  async getCall(req, res, next) { try { return res.success({ data: await service.getCall(req.params.id, req.user._id) }); } catch (e) { next(e); } }
  async reconcileCall(req, res, next) { try { return res.success({ data: await service.reconcileCall(req.params.id, req.user._id, req.body, meta(req)), message: 'Call outcome resolved' }); } catch (e) { next(e); } }
  async reviewAnswers(req, res, next) { try { return res.success({ data: await service.reviewAnswers(req.params.id, req.user._id, req.body, meta(req)), message: 'Answers reviewed' }); } catch (e) { next(e); } }
  async history(req, res, next) {
    try {
      // data stays an array of calls (installed mobile builds parse it that way);
      // status transitions have their own endpoint.
      const { calls, pagination } = await service.historyForLead(req.params.leadId, req.user._id, req._validatedQuery || req.query);
      return res.success({ data: calls, pagination });
    } catch (e) { next(e); }
  }
  async transitions(req, res, next) { try { return res.success({ data: await service.leadTransitions(req.params.leadId, req.user._id) }); } catch (e) { next(e); } }
  async analytics(req, res, next) { try { return res.success({ data: await service.analytics(req.user._id, req._validatedQuery || req.query) }); } catch (e) { next(e); } }
  async analyticsExport(req, res, next) {
    try {
      const csv = await service.analyticsCsv(req.user._id, req._validatedQuery || req.query);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="ai-calling-analytics.csv"');
      return res.send(csv);
    } catch (e) { next(e); }
  }
  async suppress(req, res, next) { try { return res.success({ data: await service.suppressNumber(req.body, req.user._id), message: 'Number suppressed' }); } catch (e) { next(e); } }
  async getConsent(req, res, next) { try { return res.success({ data: await service.getConsent(req.params.leadId, req.user._id) }); } catch (e) { next(e); } }
  async updateConsent(req, res, next) { try { return res.success({ data: await service.updateConsent(req.params.leadId, req.body, req.user._id, meta(req)), message: 'Call consent updated' }); } catch (e) { next(e); } }
  async languages(req, res, next) { try { return res.success({ data: { languages: AI_AGENT_LANGUAGES, defaultLanguage: defaultAgentLanguage().code } }); } catch (e) { next(e); } }
  async telephonyHealth(req, res, next) {
    try {
      const [telephony, operations] = await Promise.all([telephonyHealth(), service.operationalHealth()]);
      return res.success({ data: { ...telephony, operations } });
    } catch (e) { next(e); }
  }

  // ---- agent tool API (worker-authenticated via req.agentCall.callId) ----
  async agentContext(req, res, next) {
    try {
      res.set('Cache-Control', 'no-store');
      const context = await service.getCallContext(req.agentCall.callId);
      // SMS link conversations add their persona, language, FAQ and limits.
      const link = await linkVoice.contextFor(req.agentCall.callId);
      return res.success({ data: link ? { ...context, ...link } : context });
    } catch (e) { next(e); }
  }
  async agentAnswered(req, res, next) {
    try {
      const link = await linkVoice.connected(req.agentCall.callId);
      return res.success({ data: link || await service.agentAnswered(req.agentCall.callId) });
    } catch (e) { next(e); }
  }
  async agentDisclose(req, res, next) { try { return res.success({ data: await service.agentDisclose(req.agentCall.callId) }); } catch (e) { next(e); } }
  async agentRecordAnswer(req, res, next) { try { return res.success({ data: await service.agentRecordAnswer(req.agentCall.callId, req.body) }); } catch (e) { next(e); } }
  async agentRecordAnswers(req, res, next) { try { return res.success({ data: await service.agentRecordAnswers(req.agentCall.callId, req.body) }); } catch (e) { next(e); } }
  async agentMarkUnknown(req, res, next) { try { return res.success({ data: await service.agentMarkUnknown(req.agentCall.callId, req.body) }); } catch (e) { next(e); } }
  async agentConfirm(req, res, next) { try { return res.success({ data: await service.agentConfirm(req.agentCall.callId, req.body) }); } catch (e) { next(e); } }
  async agentCallback(req, res, next) { try { return res.success({ data: await service.agentRequestCallback(req.agentCall.callId, req.body) }); } catch (e) { next(e); } }
  async agentDoNotContact(req, res, next) { try { return res.success({ data: await service.agentDoNotContact(req.agentCall.callId) }); } catch (e) { next(e); } }
  async agentDecline(req, res, next) { try { return res.success({ data: await service.agentDecline(req.agentCall.callId) }); } catch (e) { next(e); } }
  async agentEnd(req, res, next) {
    try {
      if (req.body?.quality) await callQuality.recordTelemetry(req.agentCall.callId, req.body.quality);
      const link = await linkVoice.agentEnded(req.agentCall.callId, req.body);
      return res.success({ data: link || await service.agentEndCall(req.agentCall.callId, req.body) });
    } catch (e) { next(e); }
  }
  /** Authenticated, per-call speech evidence for phone and web conversations. */
  async agentTranscript(req, res, next) {
    try {
      const data = await service.agentTranscript(req.agentCall.callId, req.body);
      // Preserve the existing web-link conversation view as well.
      await linkVoice.transcript(req.agentCall.callId, req.body);
      return res.success({ data });
    } catch (e) { next(e); }
  }
  async agentActivity(req, res, next) { try { return res.success({ data: await service.agentActivity(req.agentCall.callId, req.body) }); } catch (e) { next(e); } }

  // ---- telephony webhook (signature-verified, idempotent) ----
  async webhook(req, res, next) {
    try {
      if (!verifyLiveKitSignature(req)) return res.status(401).send('Invalid signature');
      const body = req.body || {};
      const mapped = mapLiveKitWebhook(body);
      if (!mapped.internalCallId || mapped.eventType === 'ignored') return res.status(200).json({ received: true, ignored: true });
      await service.applyWebhookEvent({
        provider: 'livekit_sip',
        providerCallId: mapped.providerCallId,
        internalCallId: mapped.internalCallId,
        eventType: mapped.eventType,
        occurredAt: body.createdAt ? new Date(Number(body.createdAt) * 1000) : new Date(),
        providerEventId: body.id || null,
        payload: { event: body.event, room: body.room?.name, participant: body.participant?.identity, disconnectReason: body.participant?.disconnectReason },
      });
      return res.status(200).json({ received: true });
    } catch (e) { next(e); }
  }
}

/**
 * Verify a LiveKit webhook. LiveKit supplies a signed JWT in the Authorization
 * header whose `sha256` claim is the raw-body digest. We verify the JWT signature,
 * issuer, lifetime, and digest. If no secret is configured in a non-production
 * environment we allow local fixtures, but production always fails closed.
 */
export function verifyLiveKitSignature(req) {
  const secret = process.env.LIVEKIT_API_SECRET || '';
  const apiKey = process.env.LIVEKIT_API_KEY || '';
  const auth = req.get('authorization') || '';
  if (!secret || !apiKey) return process.env.NODE_ENV !== 'production';
  if (!auth) return false;
  try {
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    const claims = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: apiKey,
      clockTolerance: 5,
    });
    const expected = crypto.createHash('sha256').update(req.rawBody || Buffer.alloc(0)).digest('base64');
    return typeof claims.sha256 === 'string'
      && claims.sha256.length === expected.length
      && crypto.timingSafeEqual(Buffer.from(claims.sha256), Buffer.from(expected));
  } catch {
    return false;
  }
}

export default new AiCallingController();
