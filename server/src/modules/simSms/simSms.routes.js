import { Router } from 'express';
import controller from './simSms.controller.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import * as schemas from './simSms.validation.js';

/**
 * SIM SMS agent — /api/v1/sim-sms. Every route acts on the authenticated
 * user's own campaigns/conversations/messages; device routes are called by the
 * user's phone (same session) and are additionally bound to a deviceId lease.
 */
const router = Router();
const read = [authenticate, requirePermission('ai-calling:read')];
const write = [authenticate, requirePermission('ai-calling:write')];

router.get('/campaigns', ...read, validate(schemas.listCampaigns), controller.listCampaigns);
router.post('/campaigns', ...write, validate(schemas.createCampaign), controller.createCampaign);
router.get('/campaigns/:id', ...read, validate(schemas.campaignId), controller.getCampaign);
router.post('/campaigns/:id/start', ...write, validate(schemas.campaignId), controller.startCampaign);
router.post('/campaigns/:id/pause', ...write, validate(schemas.campaignId), controller.pauseCampaign);
router.post('/campaigns/:id/cancel', ...write, validate(schemas.campaignId), controller.cancelCampaign);
router.get('/campaigns/:id/conversations', ...read, validate(schemas.listConversations), controller.listConversations);
router.get('/conversations/:id', ...read, validate(schemas.conversationId), controller.getConversation);
router.post('/conversations/:id/resolve', ...write, validate(schemas.resolveAttention), controller.resolveAttention);
router.get('/leads/:leadId/conversations', ...read, validate(schemas.leadConversations), controller.leadConversations);

router.post('/device/lease', ...write, validate(schemas.lease), controller.lease);
router.post('/device/messages/:id/attempting', ...write, validate(schemas.attempting), controller.attempting);
router.post('/device/messages/:id/result', ...write, validate(schemas.result), controller.result);
router.post('/device/messages/:id/delivery', ...write, validate(schemas.delivery), controller.delivery);
router.get('/device/watch-list', ...read, controller.watchList);
router.post('/device/inbound', ...write, validate(schemas.inbound), controller.inbound);

export default router;
