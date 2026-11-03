import { Router } from 'express';
import controller from './messaging.controller.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import * as schemas from './messaging.validation.js';

const router = Router();

router.get('/sms-services', authenticate, requirePermission('lead:read'), (req, res, next) => controller.smsServices(req, res, next));
router.get('/campaigns', authenticate, requirePermission('lead:read'), validate(schemas.listCampaigns), (req, res, next) => controller.listCampaigns(req, res, next));
router.post('/campaigns', authenticate, requirePermission('crm:write'), validate(schemas.createCampaign), (req, res, next) => controller.createCampaign(req, res, next));
router.get('/campaigns/:id', authenticate, requirePermission('lead:read'), validate(schemas.campaignId), (req, res, next) => controller.getCampaign(req, res, next));
router.get('/campaigns/:id/recipients', authenticate, requirePermission('lead:read'), validate(schemas.listRecipients), (req, res, next) => controller.listRecipients(req, res, next));
router.get('/campaigns/:id/retry-eligibility', authenticate, requirePermission('lead:read'), validate(schemas.retryEligibility), (req, res, next) => controller.retryEligibility(req, res, next));
router.delete('/campaigns/:id/recipients/:recipientId', authenticate, requirePermission('crm:write'), validate(schemas.recipientId), (req, res, next) => controller.removeDraftRecipient(req, res, next));
router.post('/campaigns/:id/consent/verify', authenticate, requirePermission('crm:admin'), validate(schemas.verifyCampaignConsent), (req, res, next) => controller.verifyCampaignConsent(req, res, next));
router.post('/campaigns/:id/start', authenticate, requirePermission('crm:write'), validate(schemas.startCampaign), (req, res, next) => controller.startCampaign(req, res, next));
router.post('/campaigns/:id/pause', authenticate, requirePermission('crm:write'), validate(schemas.campaignId), (req, res, next) => controller.pauseCampaign(req, res, next));
router.post('/campaigns/:id/resume', authenticate, requirePermission('crm:write'), validate(schemas.startCampaign), (req, res, next) => controller.startCampaign(req, res, next));
router.post('/campaigns/:id/cancel', authenticate, requirePermission('crm:write'), validate(schemas.campaignId), (req, res, next) => controller.cancelCampaign(req, res, next));
router.post('/campaigns/:id/retry', authenticate, requirePermission('crm:write'), validate(schemas.retryRecipients), (req, res, next) => controller.retryRecipients(req, res, next));
router.post('/campaigns/:id/retry-eligible', authenticate, requirePermission('crm:write'), validate(schemas.retryEligibleRecipients), (req, res, next) => controller.retryEligibleRecipients(req, res, next));
router.post('/campaigns/:id/recipients/:recipientId/reconcile', authenticate, requirePermission('crm:admin'), validate(schemas.reconcileRecipient), (req, res, next) => controller.reconcileRecipient(req, res, next));
router.get('/campaigns/:id/export', authenticate, requirePermission('lead:read'), validate(schemas.campaignId), (req, res, next) => controller.exportCampaign(req, res, next));
router.post('/test-send', authenticate, requirePermission('crm:write'), validate(schemas.testSend), (req, res, next) => controller.testSend(req, res, next));
router.get('/leads/:leadId/history', authenticate, requirePermission('lead:read'), validate(schemas.leadHistory), (req, res, next) => controller.history(req, res, next));
router.get('/leads/:leadId/consent', authenticate, requirePermission('lead:read'), validate(schemas.leadConsent), (req, res, next) => controller.getConsent(req, res, next));
router.put('/leads/:leadId/consent', authenticate, requirePermission('crm:write'), validate(schemas.consent), (req, res, next) => controller.consent(req, res, next));
router.post('/leads/:leadId/consent/reinstate', authenticate, requirePermission('crm:admin'), validate(schemas.reinstateConsent), (req, res, next) => controller.reinstateConsent(req, res, next));
router.get('/analytics', authenticate, requirePermission('lead:read'), validate(schemas.analytics), (req, res, next) => controller.analytics(req, res, next));
router.get('/analytics/export', authenticate, requirePermission('lead:read'), validate(schemas.analytics), (req, res, next) => controller.exportAnalytics(req, res, next));
router.get('/templates', authenticate, requirePermission('lead:read'), validate(schemas.listTemplates), (req, res, next) => controller.listTemplates(req, res, next));
router.post('/templates', authenticate, requirePermission('crm:write'), validate(schemas.createTemplate), (req, res, next) => controller.createTemplate(req, res, next));
router.patch('/templates/:id', authenticate, requirePermission('crm:write'), validate(schemas.updateTemplate), (req, res, next) => controller.updateTemplate(req, res, next));
router.post('/templates/:id/duplicate', authenticate, requirePermission('crm:write'), validate(schemas.templateId), (req, res, next) => controller.duplicateTemplate(req, res, next));
router.post('/templates/:id/archive', authenticate, requirePermission('crm:write'), validate(schemas.templateId), (req, res, next) => controller.archiveTemplate(req, res, next));
router.post('/templates/sync-meta', authenticate, requirePermission('settings:admin'), (req, res, next) => controller.syncMetaTemplates(req, res, next));
router.get('/settings/health', authenticate, requirePermission('settings:read'), (req, res, next) => controller.health(req, res, next));
router.patch('/settings', authenticate, requirePermission('settings:admin'), validate(schemas.providerSettings), (req, res, next) => controller.settings(req, res, next));

export const messagingWebhookRoutes = Router();
messagingWebhookRoutes.get('/meta', (req, res) => controller.metaVerify(req, res));
messagingWebhookRoutes.get('/unsubscribe', (req, res) => controller.unsubscribe(req, res));
messagingWebhookRoutes.post('/meta', (req, res, next) => controller.metaWebhook(req, res, next));
messagingWebhookRoutes.post('/textbee', (req, res, next) => controller.textbeeWebhook(req, res, next));
messagingWebhookRoutes.post('/twilio', (req, res, next) => controller.twilioWebhook(req, res, next));

export default router;
