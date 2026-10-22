/** CRM routes for the SMS link assistant (/api/v1/link-assistant). RBAC as the AI calling module. */
import { Router } from 'express';
import Joi from 'joi';

import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import { objectId } from '../../shared/validation/commonSchemas.js';
import { SESSION_STATUSES } from './linkAssistant.constants.js';
import service from './linkAssistant.service.js';

const router = Router();
const meta = (req) => ({ ipAddress: req.ip, userAgent: req.headers['user-agent'] });
const wrap = (fn) => async (req, res, next) => { try { await fn(req, res); } catch (e) { next(e); } };
const READ = [authenticate, requirePermission('ai-calling:read')];
const WRITE = [authenticate, requirePermission('ai-calling:write')];
const ADMIN = [authenticate, requirePermission('ai-calling:admin')];

const idParam = { params: Joi.object({ id: objectId.required() }) };
const sessionsQuery = {
  query: Joi.object({
    campaignId: objectId, leadId: objectId, status: Joi.string().valid(...SESSION_STATUSES),
    page: Joi.number().integer().min(1).default(1), limit: Joi.number().integer().min(1).max(100).default(25),
  }),
};

const ok = (fn) => wrap(async (req, res) => res.success({ data: await fn(req) }));

router.get('/settings', ...READ, ok(() => service.getSettings()));
router.put('/settings/kill-switch', ...ADMIN, validate({ body: Joi.object({ paused: Joi.boolean().required(), reason: Joi.string().max(300).allow('') }) }),
  ok((req) => service.setPaused(req.body.paused, req.body.reason, req.user._id, meta(req))));

router.get('/templates', ...READ, validate({ query: Joi.object({ campaignId: objectId }) }),
  ok((req) => service.campaignTemplates(req.user._id, (req._validatedQuery || req.query).campaignId)));

// listSessions returns { data, pagination } (the envelope shape) directly.
router.get('/sessions', ...READ, validate(sessionsQuery), wrap(async (req, res) => res.success(await service.listSessions(req.user._id, req._validatedQuery || req.query))));
router.get('/sessions/:id', ...READ, validate(idParam), ok((req) => service.getSession(req.user._id, req.params.id)));
router.post('/sessions/:id/revoke', ...WRITE, validate(idParam), ok((req) => service.revoke(req.user._id, req.params.id, meta(req))));

router.get('/campaigns/:id/analytics', ...READ, validate(idParam), ok((req) => service.campaignAnalytics(req.user._id, req.params.id)));
router.get('/campaigns/:id/export', ...READ, validate(idParam), wrap(async (req, res) => {
  const csv = await service.exportCsv(req.user._id, req.params.id);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sms-link-campaign-${req.params.id}.csv"`);
  res.send(csv);
}));
router.post('/campaigns/:id/preview', ...WRITE, validate({ ...idParam, body: Joi.object({ leadId: objectId.allow(null) }).default({}) }),
  ok((req) => service.previewLink(req.params.id, req.user._id, { leadId: req.body?.leadId || null })));

router.get('/reminders/due', ...READ, ok((req) => service.dueReminders(req.user._id)));
router.get('/leads/:leadId/sessions', ...READ, validate({ params: Joi.object({ leadId: objectId.required() }) }),
  wrap(async (req, res) => res.success(await service.listSessions(req.user._id, { leadId: req.params.leadId, limit: 20 }))));

export default router;
