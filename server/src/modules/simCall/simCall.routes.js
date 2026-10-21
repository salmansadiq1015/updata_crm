import { Router } from 'express';
import controller from './simCall.controller.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import * as schemas from './simCall.validation.js';

/**
 * SIM call campaigns (AI-assisted calling from the user's own phone) — /api/v1/sim-calls.
 * Every route acts on the authenticated user's own campaigns and tasks. The phone
 * claims → dials → saves answers → completes; the server re-checks campaign state,
 * calling hours and lead eligibility at each step.
 */
const router = Router();
const read = [authenticate, requirePermission('ai-calling:read')];
const write = [authenticate, requirePermission('ai-calling:write')];
const qualificationWrite = (req, res, next) => req.body.qualification?.answers?.length
  ? requirePermission('lead:write')(req, res, next) : next();

router.get('/campaigns', ...read, validate(schemas.listCampaigns), controller.listCampaigns);
router.post('/campaigns', ...write, validate(schemas.createCampaign), controller.createCampaign);
router.get('/campaigns/:id', ...read, validate(schemas.campaignId), controller.getCampaign);
router.patch('/campaigns/:id', ...write, validate(schemas.updateCampaign), controller.updateCampaign);
router.post('/campaigns/:id/start', ...write, validate(schemas.campaignId), controller.startCampaign);
router.post('/campaigns/:id/resume', ...write, validate(schemas.campaignId), controller.resumeCampaign);
router.post('/campaigns/:id/pause', ...write, validate(schemas.campaignId), controller.pauseCampaign);
router.post('/campaigns/:id/cancel', ...write, validate(schemas.campaignId), controller.cancelCampaign);
router.post('/campaigns/:id/retry', ...write, validate(schemas.retry), controller.retry);
router.get('/campaigns/:id/tasks', ...read, validate(schemas.listTasks), controller.listTasks);
router.get('/campaigns/:id/events', ...read, validate(schemas.listEvents), controller.listEvents);
router.post('/campaigns/:id/next', ...write, validate(schemas.claimNext), controller.claimNext);

router.get('/tasks/:id', ...read, validate(schemas.taskId), controller.getTask);
router.post('/tasks/:id/dial', ...write, validate(schemas.dial), controller.dial);
router.post('/tasks/:id/release', ...write, validate(schemas.release), controller.release);
router.post('/tasks/:id/skip', ...write, validate(schemas.skip), controller.skip);
router.put('/tasks/:id/answers', ...write, validate(schemas.saveAnswers), controller.saveAnswers);
router.post('/tasks/:id/complete', ...write, validate(schemas.complete), qualificationWrite, controller.complete);
router.post('/tasks/:id/sync', ...write, validate(schemas.taskId), controller.retrySync);
router.patch('/tasks/:id/callback', ...write, validate(schemas.reschedule), controller.reschedule);
router.delete('/tasks/:id/callback', ...write, validate(schemas.taskId), controller.cancelCallback);

router.get('/callbacks', ...read, validate(schemas.callbacks), controller.callbacks);
router.get('/leads/:leadId/tasks', ...read, validate(schemas.leadTasks), controller.leadTasks);

export default router;
