import { Router } from 'express';
import Joi from 'joi';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import { objectId } from '../../shared/validation/commonSchemas.js';
import taskTimeService from './taskTime.service.js';

const router = Router();
const options = (req) => ({ isAdmin: req.user.role?.name === 'Admin' });
const handle = (action) => async (req, res, next) => {
  try { return res.success({ data: await action(req) }); } catch (error) { return next(error); }
};
const read = [authenticate, requirePermission('tasks:read')];
router.get('/time-tracking/active', ...read, handle(req => taskTimeService.active(req.user._id)));
router.get('/time-tracking/report', ...read, validate({ query: Joi.object({
  days: Joi.number().valid(0, 7, 30, 90).default(30), scope: Joi.string().valid('mine', 'team').default('mine'),
}) }), (req, res, next) => {
  const query = req._validatedQuery || req.query;
  if (query.scope === 'team') return requirePermission('time-tracking:read')(req, res, next);
  return next();
}, handle(req => taskTimeService.summary(req.user._id, req._validatedQuery || req.query, options(req))));
router.get('/:taskId/time-tracking', ...read, validate({
  params: Joi.object({ taskId: objectId.required() }),
  query: Joi.object({ days: Joi.number().valid(0, 7, 30, 90).default(0), page: Joi.number().integer().min(1).max(10000).default(1) }),
}), handle(req => taskTimeService.summary(req.user._id, { ...(req._validatedQuery || req.query), taskId: req.params.taskId }, options(req))));
router.post('/:taskId/time-tracking/start', authenticate, requirePermission('tasks:write'), validate({
  params: Joi.object({ taskId: objectId.required() }),
  body: Joi.object({ mode: Joi.string().valid('TIMER', 'FOCUS').default('TIMER'), targetMinutes: Joi.number().integer().min(5).max(240).default(25) }),
}), handle(req => taskTimeService.start(req.params.taskId, req.body, req.user._id, options(req))));
router.post('/time-tracking/sessions/:sessionId/:action', authenticate, requirePermission('tasks:write'), validate({
  params: Joi.object({ sessionId: objectId.required(), action: Joi.string().valid('pause', 'resume', 'stop').required() }),
  body: Joi.object({ note: Joi.string().trim().max(1000).allow('') }),
}), handle(req => taskTimeService.transition(req.params.sessionId, req.params.action, req.body, req.user._id)));
export default router;
