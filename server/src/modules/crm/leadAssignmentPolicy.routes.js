import { Router } from 'express';
import leadWorkflowController from './leadWorkflow.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { updateAssignmentPolicy } from './leadWorkflow.validation.js';

/**
 * Lead assignment / first-response SLA / escalation policy — mounted at
 * /api/v1/crm/lead-assignment-policy by crm.routes.js. Admin-only.
 */
const router = Router();

router.get('/', authenticate, requirePermission('lead:assign-policy'), (req, res, next) => leadWorkflowController.getAssignmentPolicy(req, res, next));
router.put('/', authenticate, requirePermission('lead:assign-policy'), validate(updateAssignmentPolicy), (req, res, next) => leadWorkflowController.updateAssignmentPolicy(req, res, next));

export default router;
