import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import service from './aiCalling.service.js';
import { telephonyHealth } from './providers/telephonyRouter.js';

const meta = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });

class AiCallingController {
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
  async simulate(req, res, next) { try { return res.success({ data: await service.simulate(req.params.id, req.user._id, req.body) }); } catch (e) { next(e); } }
  async webTest(req, res, next) { try { return res.success({ data: await service.startWebTest(req.params.id, req.user._id, req.body || {}), message: 'Browser voice test started' }); } catch (e) { next(e); } }
  async getCall(req, res, next) { try { return res.success({ data: await service.getCall(req.params.id, req.user._id) }); } catch (e) { next(e); } }
  async reviewAnswers(req, res, next) { try { return res.success({ data: await service.reviewAnswers(req.params.id, req.user._id, req.body), message: 'Answers reviewed' }); } catch (e) { next(e); } }
  async history(req, res, next) { try { return res.success(await service.historyForLead(req.params.leadId, req.user._id, req._validatedQuery || req.query)); } catch (e) { next(e); } }
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
  async telephonyHealth(req, res, next) { try { return res.success({ data: await telephonyHealth() }); } catch (e) { next(e); } }

  // ---- agent tool API (worker-authenticated via req.agentCall.callId) ----
  async agentContext(req, res, next) { try { return res.success({ data: await service.getCallContext(req.agentCall.callId) }); } catch (e) { next(e); } }
  async agentDisclose(req, res, next) { try { return res.success({ data: await service.agentDisclose(req.agentCall.callId) }); } catch (e) { next(e); } }
  async agentRecordAnswer(req, res, next) { try { return res.success({ data: await service.agentRecordAnswer(req.agentCall.callId, req.body) }); } catch (e) { next(e); } }
  async agentMarkUnknown(req, res, next) { try { return res.success({ data: await service.agentMarkUnknown(req.agentCall.callId, req.body) }); } catch (e) { next(e); } }
  async agentConfirm(req, res, next) { try { return res.success({ data: await service.agentConfirm(req.agentCall.callId, req.body) }); } catch (e) { next(e); } }
  async agentCallback(req, res, next) { try { return res.success({ data: await service.agentRequestCallback(req.agentCall.callId, req.body) }); } catch (e) { next(e); } }
  async agentDoNotContact(req, res, next) { try { return res.success({ data: await service.agentDoNotContact(req.agentCall.callId) }); } catch (e) { next(e); } }
  async agentDecline(req, res, next) { try { return res.success({ data: await service.agentDecline(req.agentCall.callId) }); } catch (e) { next(e); } }
  async agentEnd(req, res, next) { try { return res.success({ data: await service.agentEndCall(req.agentCall.callId, req.body) }); } catch (e) { next(e); } }

  // ---- telephony webhook (signature-verified, idempotent) ----
  async webhook(req, res, next) {
    try {
      if (!verifyLiveKitSignature(req)) return res.status(401).send('Invalid signature');
      const body = req.body || {};
      // LiveKit webhook: { event, room, participant, ... }. We match by room name
      // (which embeds the internalCallId) or a provider call id.
      const roomName = body.room?.name || body.room_name || '';
      const internalCallId = roomName.replace(/^crm-call-/, '') || body.internalCallId || null;
      const eventType = body.event || body.type || '';
      await service.applyWebhookEvent({
        provider: 'livekit_sip',
        providerCallId: body.participant?.sid || body.sipCallId || null,
        internalCallId,
        eventType,
        occurredAt: body.createdAt ? new Date(body.createdAt * 1000) : new Date(),
        providerEventId: body.id || null,
        payload: body,
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
