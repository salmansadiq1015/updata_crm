import { Router } from 'express';
import controller from './aiCalling.controller.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticateAgentCall } from './callAuth.js';
import * as schemas from './aiCalling.validation.js';

const router = Router();

// Campaigns
router.get('/campaigns', authenticate, requirePermission('ai-calling:read'), validate(schemas.listCampaigns), (req, res, next) => controller.listCampaigns(req, res, next));
router.post('/campaigns', authenticate, requirePermission('ai-calling:write'), validate(schemas.createCampaign), (req, res, next) => controller.createCampaign(req, res, next));
router.get('/campaigns/:id', authenticate, requirePermission('ai-calling:read'), validate(schemas.campaignId), (req, res, next) => controller.getCampaign(req, res, next));
router.patch('/campaigns/:id', authenticate, requirePermission('ai-calling:write'), validate(schemas.updateCampaign), (req, res, next) => controller.updateCampaign(req, res, next));
router.post('/campaigns/:id/preview', authenticate, requirePermission('ai-calling:read'), validate(schemas.campaignId), (req, res, next) => controller.previewCampaign(req, res, next));
router.post('/campaigns/:id/simulate', authenticate, requirePermission('ai-calling:write'), validate(schemas.simulate), (req, res, next) => controller.simulate(req, res, next));
router.post('/campaigns/:id/web-test', authenticate, requirePermission('ai-calling:write'), validate(schemas.webTest), (req, res, next) => controller.webTest(req, res, next));
router.post('/campaigns/:id/start', authenticate, requirePermission('ai-calling:write'), validate(schemas.startCampaign), (req, res, next) => controller.startCampaign(req, res, next));
router.post('/campaigns/:id/pause', authenticate, requirePermission('ai-calling:write'), validate(schemas.campaignId), (req, res, next) => controller.pauseCampaign(req, res, next));
router.post('/campaigns/:id/resume', authenticate, requirePermission('ai-calling:write'), validate(schemas.startCampaign), (req, res, next) => controller.startCampaign(req, res, next));
router.post('/campaigns/:id/cancel', authenticate, requirePermission('ai-calling:write'), validate(schemas.campaignId), (req, res, next) => controller.cancelCampaign(req, res, next));
router.post('/campaigns/:id/retry', authenticate, requirePermission('ai-calling:write'), validate(schemas.retryRecipients), (req, res, next) => controller.retryRecipients(req, res, next));
router.get('/campaigns/:id/recipients', authenticate, requirePermission('ai-calling:read'), validate(schemas.listRecipients), (req, res, next) => controller.listRecipients(req, res, next));
router.get('/campaigns/:id/export', authenticate, requirePermission('ai-calling:read'), validate(schemas.campaignId), (req, res, next) => controller.exportCampaign(req, res, next));
router.get('/campaigns/:id/active-calls', authenticate, requirePermission('ai-calling:read'), validate(schemas.campaignId), (req, res, next) => controller.activeCalls(req, res, next));

// Calls
router.get('/calls/:id', authenticate, requirePermission('ai-calling:read'), validate(schemas.callId), (req, res, next) => controller.getCall(req, res, next));
router.post('/calls/:id/review', authenticate, requirePermission('ai-calling:write'), validate(schemas.reviewAnswers), (req, res, next) => controller.reviewAnswers(req, res, next));

// Lead history + analytics + admin
router.get('/leads/:leadId/history', authenticate, requirePermission('ai-calling:read'), validate(schemas.leadHistory), (req, res, next) => controller.history(req, res, next));
router.get('/analytics', authenticate, requirePermission('ai-calling:read'), validate(schemas.analytics), (req, res, next) => controller.analytics(req, res, next));
router.get('/analytics/export', authenticate, requirePermission('ai-calling:read'), validate(schemas.analytics), (req, res, next) => controller.analyticsExport(req, res, next));
router.post('/suppressions', authenticate, requirePermission('ai-calling:write'), validate(schemas.suppress), (req, res, next) => controller.suppress(req, res, next));
router.get('/leads/:leadId/consent', authenticate, requirePermission('ai-calling:read'), validate(schemas.callConsentRead), (req, res, next) => controller.getConsent(req, res, next));
router.put('/leads/:leadId/consent', authenticate, requirePermission('ai-calling:write'), validate(schemas.callConsentUpdate), (req, res, next) => controller.updateConsent(req, res, next));
router.get('/telephony/health', authenticate, requirePermission('ai-calling:read'), (req, res, next) => controller.telephonyHealth(req, res, next));

/**
 * Agent tool API — invoked by the LiveKit voice agent worker during a live call,
 * authenticated by a per-call bearer token (NOT a user session). These are the
 * only database mutations the AI can trigger, and every one is validated and
 * constrained to the one call the token was issued for.
 */
export const agentToolRoutes = Router();
agentToolRoutes.get('/:callId/context', authenticateAgentCall, validate(schemas.agentContext), (req, res, next) => controller.agentContext(req, res, next));
agentToolRoutes.post('/:callId/disclose', authenticateAgentCall, validate(schemas.agentContext), (req, res, next) => controller.agentDisclose(req, res, next));
agentToolRoutes.post('/:callId/record-answer', authenticateAgentCall, validate(schemas.agentRecordAnswer), (req, res, next) => controller.agentRecordAnswer(req, res, next));
agentToolRoutes.post('/:callId/mark-unknown', authenticateAgentCall, validate(schemas.agentFieldOnly), (req, res, next) => controller.agentMarkUnknown(req, res, next));
agentToolRoutes.post('/:callId/confirm', authenticateAgentCall, validate(schemas.agentFieldOnly), (req, res, next) => controller.agentConfirm(req, res, next));
agentToolRoutes.post('/:callId/request-callback', authenticateAgentCall, validate(schemas.agentCallback), (req, res, next) => controller.agentCallback(req, res, next));
agentToolRoutes.post('/:callId/do-not-contact', authenticateAgentCall, validate(schemas.agentContext), (req, res, next) => controller.agentDoNotContact(req, res, next));
agentToolRoutes.post('/:callId/decline', authenticateAgentCall, validate(schemas.agentContext), (req, res, next) => controller.agentDecline(req, res, next));
agentToolRoutes.post('/:callId/end', authenticateAgentCall, validate(schemas.agentEnd), (req, res, next) => controller.agentEnd(req, res, next));

// Telephony provider webhooks (signature-verified inside the controller).
export const aiCallingWebhookRoutes = Router();
aiCallingWebhookRoutes.post('/livekit', (req, res, next) => controller.webhook(req, res, next));

export default router;
