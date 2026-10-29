import { Router } from 'express';
import leadWorkflowController from './leadWorkflow.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listFollowUps, followUpSummary, followUpId, createFollowUp, completeFollowUp,
  snoozeFollowUp, reassignFollowUp, cancelFollowUp, followUpContactCheck,
} from './leadWorkflow.validation.js';

/**
 * Unified follow-up inbox — mounted at /api/v1/crm/follow-ups by crm.routes.js.
 * scope=all additionally requires lead:assign-policy (checked in the service);
 * lifecycle actions require the owner, the creator or a supervisor.
 */
const router = Router();
const c = leadWorkflowController;

router.get('/', authenticate, requirePermission('lead:read'), validate(listFollowUps), (req, res, next) => c.listFollowUps(req, res, next));
router.get('/summary', authenticate, requirePermission('lead:read'), validate(followUpSummary), (req, res, next) => c.followUpSummary(req, res, next));
router.post('/', authenticate, requirePermission('lead:write'), validate(createFollowUp), (req, res, next) => c.createFollowUp(req, res, next));
router.get('/:id', authenticate, requirePermission('lead:read'), validate(followUpId), (req, res, next) => c.getFollowUp(req, res, next));
router.get('/:id/contact-check', authenticate, requirePermission('lead:read'), validate(followUpContactCheck), (req, res, next) => c.followUpContactCheck(req, res, next));
router.post('/:id/complete', authenticate, requirePermission('lead:write'), validate(completeFollowUp), (req, res, next) => c.completeFollowUp(req, res, next));
router.post('/:id/snooze', authenticate, requirePermission('lead:write'), validate(snoozeFollowUp), (req, res, next) => c.snoozeFollowUp(req, res, next));
router.post('/:id/reassign', authenticate, requirePermission('lead:write'), validate(reassignFollowUp), (req, res, next) => c.reassignFollowUp(req, res, next));
router.post('/:id/cancel', authenticate, requirePermission('lead:write'), validate(cancelFollowUp), (req, res, next) => c.cancelFollowUp(req, res, next));

export default router;
