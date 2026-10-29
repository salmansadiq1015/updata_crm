import { Router } from 'express';
import leadWorkflowController from './leadWorkflow.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { timeline, callTranscript } from './leadWorkflow.validation.js';

/**
 * Unified lead conversation history — mounted at
 * /api/v1/crm/leads/:leadId/timeline by lead.routes.js (mergeParams).
 */
const router = Router({ mergeParams: true });

router.get('/', authenticate, requirePermission('lead:read'), validate(timeline), (req, res, next) => leadWorkflowController.timeline(req, res, next));
// Full AI-call transcript for "open at turn" links (owner / AI-calling admin only).
router.get('/calls/:callId/transcript', authenticate, requirePermission('lead:read'), validate(callTranscript), (req, res, next) => leadWorkflowController.callTranscript(req, res, next));

export default router;
