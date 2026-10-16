import { Router } from 'express';
import leadCommunicationController from './leadCommunication.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  eligibility,
  createCommunication,
  appendEvents,
  completeCommunication,
  listCommunications,
} from './leadCommunication.validation.js';

/**
 * Device-originated communications — mounted at
 * /api/v1/crm/leads/:leadId/communications by lead.routes.js (mergeParams).
 * Order: authenticate → requirePermission → validate → controller.
 */
const router = Router({ mergeParams: true });

router.get('/eligibility', authenticate, requirePermission('lead:read'), validate(eligibility), (req, res, next) => leadCommunicationController.eligibility(req, res, next));
router.get('/', authenticate, requirePermission('lead:read'), validate(listCommunications), (req, res, next) => leadCommunicationController.list(req, res, next));
router.post('/', authenticate, requirePermission('lead:write'), validate(createCommunication), (req, res, next) => leadCommunicationController.create(req, res, next));
router.post('/:operationId/events', authenticate, requirePermission('lead:write'), validate(appendEvents), (req, res, next) => leadCommunicationController.appendEvents(req, res, next));
router.post('/:operationId/complete', authenticate, requirePermission('lead:write'), validate(completeCommunication), (req, res, next) => leadCommunicationController.complete(req, res, next));

export default router;
