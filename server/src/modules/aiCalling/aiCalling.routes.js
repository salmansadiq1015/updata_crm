import { Router } from 'express';
import controller from './aiCalling.controller.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticateAgentCall } from './callAuth.js';
import * as schemas from './aiCalling.validation.js';
import { providerSettings, saveProviderSettings, testProviderAccess, recordVoiceProviderAttempt } from './voiceProvider.service.js';

import callingAgentRoutes from './callingAgent.routes.js';
import callingQualityRoutes from './callingQuality.routes.js';
import callingIntelligenceRoutes, { registerTransferAgentTools } from './callingIntelligence.routes.js';

const router = Router();
router.use(callingAgentRoutes);
router.use(callingQualityRoutes); // quality dashboard, benchmarks, script experiments
router.use(callingIntelligenceRoutes);

// Campaigns
router.get('/campaigns', authenticate, requirePermission('ai-calling:read'), validate(schemas.listCampaigns), (req, res, next) => controller.listCampaigns(req, res, next));
router.post('/campaigns', authenticate, requirePermission('ai-calling:write'), validate(schemas.createCampaign), (req, res, next) => controller.createCampaign(req, res, next));
router.post('/campaigns/bulk-delete', authenticate, requirePermission('ai-calling:write'), validate(schemas.deleteCampaigns), (req, res, next) => controller.deleteCampaigns(req, res, next));
router.get('/campaigns/:id', authenticate, requirePermission('ai-calling:read'), validate(schemas.campaignId), (req, res, next) => controller.getCampaign(req, res, next));
router.get('/campaigns/:id/run-status', authenticate, requirePermission('ai-calling:read'), validate(schemas.campaignId), (req, res, next) => controller.campaignRunStatus(req, res, next));
router.patch('/campaigns/:id', authenticate, requirePermission('ai-calling:write'), validate(schemas.updateCampaign), (req, res, next) => controller.updateCampaign(req, res, next));
router.delete('/campaigns/:id', authenticate, requirePermission('ai-calling:write'), validate(schemas.deleteCampaign), (req, res, next) => controller.deleteCampaign(req, res, next));
router.post('/campaigns/:id/preview', authenticate, requirePermission('ai-calling:read'), validate(schemas.campaignId), (req, res, next) => controller.previewCampaign(req, res, next));
router.post('/campaigns/:id/simulate', authenticate, requirePermission('ai-calling:write'), validate(schemas.simulate), (req, res, next) => controller.simulate(req, res, next));
router.post('/campaigns/:id/web-test', authenticate, requirePermission('ai-calling:write'), validate(schemas.webTest), (req, res, next) => controller.webTest(req, res, next));
router.post('/campaigns/:id/start', authenticate, requirePermission('ai-calling:write'), validate(schemas.startCampaign), (req, res, next) => controller.startCampaign(req, res, next));
router.post('/campaigns/:id/pause', authenticate, requirePermission('ai-calling:write'), validate(schemas.campaignId), (req, res, next) => controller.pauseCampaign(req, res, next));
router.post('/campaigns/:id/resume', authenticate, requirePermission('ai-calling:write'), validate(schemas.startCampaign), (req, res, next) => controller.startCampaign(req, res, next));
router.post('/campaigns/:id/cancel', authenticate, requirePermission('ai-calling:write'), validate(schemas.campaignId), (req, res, next) => controller.cancelCampaign(req, res, next));
router.post('/campaigns/:id/retry', authenticate, requirePermission('ai-calling:write'), validate(schemas.retryRecipients), (req, res, next) => controller.retryRecipients(req, res, next));
router.get('/campaigns/:id/recipients', authenticate, requirePermission('ai-calling:read'), validate(schemas.listRecipients), (req, res, next) => controller.listRecipients(req, res, next));
router.post('/campaigns/:id/recipients/remove', authenticate, requirePermission('ai-calling:write'), validate(schemas.removeRecipients), (req, res, next) => controller.removeRecipients(req, res, next));
router.post('/recipients/preview', authenticate, requirePermission('ai-calling:read'), validate(schemas.previewEligibility), (req, res, next) => controller.previewEligibility(req, res, next));
router.get('/campaigns/:id/export', authenticate, requirePermission('ai-calling:read'), validate(schemas.campaignId), (req, res, next) => controller.exportCampaign(req, res, next));
router.get('/campaigns/:id/active-calls', authenticate, requirePermission('ai-calling:read'), validate(schemas.campaignId), (req, res, next) => controller.activeCalls(req, res, next));

// Calls
router.get('/calls', authenticate, requirePermission('ai-calling:read'), validate(schemas.listCalls), (req, res, next) => controller.listCalls(req, res, next));
router.get('/calls/:id', authenticate, requirePermission('ai-calling:read'), validate(schemas.callId), (req, res, next) => controller.getCall(req, res, next));
router.post('/calls/:id/monitor', authenticate, requirePermission('ai-calling:read'), validate(schemas.callId), (req, res, next) => controller.monitorCall(req, res, next));
router.post('/calls/:id/reconcile', authenticate, requirePermission('ai-calling:write'), validate(schemas.reconcileCall), (req, res, next) => controller.reconcileCall(req, res, next));
router.post('/calls/:id/review', authenticate, requirePermission('ai-calling:write'), validate(schemas.reviewAnswers), (req, res, next) => controller.reviewAnswers(req, res, next));

// Lead history + analytics + admin
router.get('/leads/:leadId/transitions', authenticate, requirePermission('ai-calling:read'), validate(schemas.callConsentRead), (req, res, next) => controller.transitions(req, res, next));
router.get('/leads/:leadId/history', authenticate, requirePermission('ai-calling:read'), validate(schemas.leadHistory), (req, res, next) => controller.history(req, res, next));
router.get('/analytics', authenticate, requirePermission('ai-calling:read'), validate(schemas.analytics), (req, res, next) => controller.analytics(req, res, next));
router.get('/analytics/export', authenticate, requirePermission('ai-calling:read'), validate(schemas.analytics), (req, res, next) => controller.analyticsExport(req, res, next));
router.post('/suppressions', authenticate, requirePermission('ai-calling:write'), validate(schemas.suppress), (req, res, next) => controller.suppress(req, res, next));
router.get('/leads/:leadId/consent', authenticate, requirePermission('ai-calling:read'), validate(schemas.callConsentRead), (req, res, next) => controller.getConsent(req, res, next));
router.put('/leads/:leadId/consent', authenticate, requirePermission('ai-calling:write'), validate(schemas.callConsentUpdate), (req, res, next) => controller.updateConsent(req, res, next));
router.get('/languages', authenticate, requirePermission('ai-calling:read'), (req, res, next) => controller.languages(req, res, next));
router.get('/telephony/health', authenticate, requirePermission('ai-calling:read'), (req, res, next) => controller.telephonyHealth(req, res, next));
// Global voice kill switch (stops cloud SIP and paired-phone dialing).
router.get('/settings', authenticate, requirePermission('ai-calling:read'), (req, res, next) => controller.getVoiceSettings(req, res, next));
router.put('/settings', authenticate, requirePermission('ai-calling:admin'), validate(schemas.voiceSettings), (req, res, next) => controller.setVoiceSettings(req, res, next));
router.get('/settings/providers', authenticate, requirePermission('ai-calling:admin'), async (req, res, next) => {
  try { res.success({ data: await providerSettings() }); } catch (error) { next(error); }
});
router.put('/settings/providers', authenticate, requirePermission('ai-calling:admin'), validate(schemas.providerSettings), async (req, res, next) => {
  try { res.success({ data: await saveProviderSettings(req.body, req.user._id, { ipAddress: req.ip }) }); } catch (error) { next(error); }
});
router.post('/settings/providers/:provider/test', authenticate, requirePermission('ai-calling:admin'), validate(schemas.providerTest), async (req, res, next) => {
  try { res.success({ data: await testProviderAccess(req.params.provider) }); } catch (error) { next(error); }
});

/**
 * Agent tool API — invoked by the LiveKit voice agent worker during a live call,
 * authenticated by a per-call bearer token (NOT a user session). These are the
 * only database mutations the AI can trigger, and every one is validated and
 * constrained to the one call the token was issued for.
 */
export const agentToolRoutes = Router();
agentToolRoutes.post('/:callId/voice-provider', authenticateAgentCall, validate(schemas.providerAttempt), async (req, res, next) => {
  try { res.success({ data: await recordVoiceProviderAttempt(req.agentCall.callId, req.body) }); } catch (error) { next(error); }
});
agentToolRoutes.get('/:callId/context', authenticateAgentCall, validate(schemas.agentContext), (req, res, next) => controller.agentContext(req, res, next));
agentToolRoutes.post('/:callId/answered', authenticateAgentCall, validate(schemas.agentContext), (req, res, next) => controller.agentAnswered(req, res, next));
agentToolRoutes.post('/:callId/disclose', authenticateAgentCall, validate(schemas.agentContext), (req, res, next) => controller.agentDisclose(req, res, next));
agentToolRoutes.post('/:callId/record-answer', authenticateAgentCall, validate(schemas.agentRecordAnswer), (req, res, next) => controller.agentRecordAnswer(req, res, next));
agentToolRoutes.post('/:callId/record-answers', authenticateAgentCall, validate(schemas.agentRecordAnswers), (req, res, next) => controller.agentRecordAnswers(req, res, next));
agentToolRoutes.post('/:callId/no-response', authenticateAgentCall, validate(schemas.agentNoResponse), (req, res, next) => controller.agentNoResponse(req, res, next));
agentToolRoutes.post('/:callId/mark-unknown', authenticateAgentCall, validate(schemas.agentFieldOnly), (req, res, next) => controller.agentMarkUnknown(req, res, next));
agentToolRoutes.post('/:callId/confirm', authenticateAgentCall, validate(schemas.agentConfirm), (req, res, next) => controller.agentConfirm(req, res, next));
agentToolRoutes.post('/:callId/request-callback', authenticateAgentCall, validate(schemas.agentCallback), (req, res, next) => controller.agentCallback(req, res, next));
agentToolRoutes.post('/:callId/do-not-contact', authenticateAgentCall, validate(schemas.agentContext), (req, res, next) => controller.agentDoNotContact(req, res, next));
agentToolRoutes.post('/:callId/decline', authenticateAgentCall, validate(schemas.agentContext), (req, res, next) => controller.agentDecline(req, res, next));
agentToolRoutes.post('/:callId/transcript', authenticateAgentCall, validate(schemas.agentTranscript), (req, res, next) => controller.agentTranscript(req, res, next));
agentToolRoutes.post('/:callId/activity', authenticateAgentCall, validate(schemas.agentActivity), (req, res, next) => controller.agentActivity(req, res, next));
registerTransferAgentTools(agentToolRoutes);
agentToolRoutes.post('/:callId/end', authenticateAgentCall, validate(schemas.agentEnd), (req, res, next) => controller.agentEnd(req, res, next));

// Telephony provider webhooks (signature-verified inside the controller).
export const aiCallingWebhookRoutes = Router();
aiCallingWebhookRoutes.post('/livekit', (req, res, next) => controller.webhook(req, res, next));

export default router;
