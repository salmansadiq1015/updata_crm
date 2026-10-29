import { Router } from 'express';
import controller from './smsOps.controller.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import * as schemas from './smsOps.validation.js';

/**
 * SMS operations under /api/v1/sim-sms (mounted from simSms.routes.js).
 * Everything is scoped to the authenticated user (req.user._id): their phones,
 * their reviews, their recovery items.
 */
const router = Router();
const read = [authenticate, requirePermission('ai-calling:read')];
const write = [authenticate, requirePermission('ai-calling:write')];

router.post('/devices/heartbeat', ...write, validate(schemas.heartbeat), controller.heartbeat);
router.get('/devices', ...read, controller.listDevices);
router.get('/devices/:deviceId', ...read, validate(schemas.deviceParam), controller.getDevice);
router.post('/devices/:deviceId/resync', ...write, validate(schemas.deviceParam), controller.requestResync);

router.get('/answer-reviews/counts', ...read, controller.reviewCounts);
router.get('/answer-reviews', ...read, validate(schemas.listReviews), controller.listReviews);
router.get('/answer-reviews/:id', ...read, validate(schemas.reviewId), controller.getReview);
router.post('/answer-reviews/:id/resolve', ...write, validate(schemas.resolveReview), controller.resolveReview);

router.get('/recovery/counts', ...read, controller.recoveryCounts);
router.post('/recovery/bulk-dismiss', ...write, validate(schemas.bulkDismiss), controller.bulkDismiss);
router.get('/recovery', ...read, validate(schemas.listRecovery), controller.listRecovery);
router.get('/recovery/:id', ...read, validate(schemas.recoveryId), controller.getRecovery);
router.post('/recovery/:id/actions', ...write, validate(schemas.recoveryAction), controller.recoveryAction);

router.get('/callbacks', ...read, controller.listCallbacks);

export default router;
