import { Router } from 'express';
import controller from './contactPolicy.controller.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import * as schemas from './contactPolicy.validation.js';

/**
 * /api/v1/contact-policy — the cross-channel contact limits.
 * Reading a lead's contact status needs lead:read (it explains why a lead can't
 * be contacted yet); changing the policy needs ai-calling:admin (implied by
 * crm:admin), because it changes how every campaign dispatches.
 */
const router = Router();

router.get('/settings', authenticate, requirePermission('ai-calling:read'), controller.getSettings);
router.put('/settings', authenticate, requirePermission('ai-calling:admin'), validate(schemas.updateSettings), controller.updateSettings);
router.get('/leads/:leadId', authenticate, requirePermission('lead:read'), validate(schemas.leadParam), controller.leadStatus);
router.get('/leads/:leadId/check', authenticate, requirePermission('lead:read'), validate(schemas.leadCheck), controller.leadCheck);
router.get('/campaigns/:source/:campaignId/skips', authenticate, requirePermission('ai-calling:read'), validate(schemas.campaignSkips), controller.campaignSkips);

export default router;
