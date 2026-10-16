import { Router } from 'express';
import leadCommunicationController from './leadCommunication.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { getQualification, proposeQualification } from './leadCommunication.validation.js';

/**
 * Lead qualification — mounted at /api/v1/crm/leads/:leadId/qualification by
 * lead.routes.js (mergeParams). `propose` only suggests; it never writes.
 */
const router = Router({ mergeParams: true });

router.get('/', authenticate, requirePermission('lead:read'), validate(getQualification), (req, res, next) => leadCommunicationController.getQualification(req, res, next));
router.post('/propose', authenticate, requirePermission('lead:write'), validate(proposeQualification), (req, res, next) => leadCommunicationController.proposeQualification(req, res, next));

export default router;
