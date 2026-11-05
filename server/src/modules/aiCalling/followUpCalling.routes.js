import { Router } from 'express';
import Joi from 'joi';
import * as auth from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import { objectId } from '../../shared/validation/commonSchemas.js';
import followUpCalling from './followUpCalling.service.js';
import { listAgentTemplates } from './engine/agentTypes.js';
import { FOLLOW_UP_OUTCOMES, AUTOMATION_STATES } from './engine/followUpDecision.js';

/**
 * AI follow-up calling API (mounted under /api/v1/ai-calling):
 *   GET  /agent-types                         agent type templates
 *   GET  /settings/follow-up                  organisation automation switch
 *   PUT  /settings/follow-up                  (ai-calling:admin)
 *   GET  /follow-ups/summary                  organisation / agent follow-up analytics
 *   GET  /agents/:id/follow-ups               the agent's follow-up queue
 *   POST /follow-ups/:id/{assign-agent,call-now,pause,resume,assign-human}
 *   POST /leads/:leadId/follow-ups/{pause,resume}  lead-level automation pause
 * Identity always comes from req.user; actions check owner / agent owner / supervisor.
 */

const router = Router();
const meta = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });
const query = (req) => req._validatedQuery || req.query;
const handle = (fn) => async (req, res, next) => { try { return res.success({ data: await fn(req) }); } catch (error) { return next(error); } };

// Namespace import: resolved per request, so test doubles of the auth module that only
// provide authenticate/requirePermission still load this router (non-supervisor then).
const { authenticate, requirePermission } = auth;
async function viewerOf(req) {
  const isAdmin = req.user?.role?.name === 'Admin';
  const load = auth.loadUserPermissions; const satisfies = auth.satisfiesPermission;
  const perms = isAdmin || typeof load !== 'function' ? [] : await load(req.user);
  const has = (p) => isAdmin || (typeof satisfies === 'function' && satisfies(perms, p));
  return { id: String(req.user._id), isSupervisor: has('ai-calling:admin') || has('lead:assign-policy') };
}

const id = { params: Joi.object({ id: objectId.required() }) };
const leadId = { params: Joi.object({ leadId: objectId.required() }) };
const exportFilters = { agentId: objectId, campaignId: objectId, from: Joi.date().iso(), to: Joi.date().iso() };

router.get('/agent-types', authenticate, requirePermission('ai-calling:read'), handle(() => listAgentTemplates()));
router.get('/follow-up-outcomes', authenticate, requirePermission('ai-calling:read'), handle(() => ({ outcomes: FOLLOW_UP_OUTCOMES, states: AUTOMATION_STATES })));

router.get('/settings/follow-up', authenticate, requirePermission('ai-calling:read'), handle(() => followUpCalling.settings({ fresh: true })));
router.put('/settings/follow-up', authenticate, requirePermission('ai-calling:admin'),
  validate({ body: Joi.object({ enabled: Joi.boolean(), reason: Joi.string().trim().max(300).allow(''), escalationUserIds: Joi.array().items(objectId).unique().max(20) }).min(1) }),
  handle((req) => followUpCalling.setSettings(req.user._id, req.body, meta(req))));

router.get('/follow-ups/summary', authenticate, requirePermission('ai-calling:read'),
  validate({ query: Joi.object(exportFilters) }),
  handle((req) => followUpCalling.summary(req.user._id, query(req))));

const csv = (name) => async (req, res, next) => {
  try {
    const body = await followUpCalling.exportCsv(req.user._id, { ...query(req), ...(req.params.id ? { campaignId: req.params.id } : {}) });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name(req)}.csv"`);
    return res.send(body);
  } catch (error) { return next(error); }
};
router.get('/follow-ups/export', authenticate, requirePermission('ai-calling:read'), validate({ query: Joi.object(exportFilters) }),
  csv(() => `ai-follow-ups-${new Date().toISOString().slice(0, 10)}`));
// Campaign-level follow-up analytics: every follow-up the campaign's calls produced (all rounds).
router.get('/campaigns/:id/follow-ups/summary', authenticate, requirePermission('ai-calling:read'), validate(id),
  handle((req) => followUpCalling.summary(req.user._id, { campaignId: req.params.id })));
router.get('/campaigns/:id/follow-ups/export', authenticate, requirePermission('ai-calling:read'), validate(id),
  csv((req) => `ai-follow-ups-campaign-${req.params.id}`));

router.get('/agents/:id/follow-ups', authenticate, requirePermission('ai-calling:read'),
  validate({ ...id, query: Joi.object({ state: Joi.string().valid('active', ...AUTOMATION_STATES), limit: Joi.number().integer().min(1).max(200).default(50) }) }),
  handle((req) => followUpCalling.listForAgent(req.params.id, req.user._id, query(req))));
router.get('/agents/:id/follow-ups/summary', authenticate, requirePermission('ai-calling:read'), validate(id),
  handle((req) => followUpCalling.summary(req.user._id, { agentId: req.params.id })));

router.post('/follow-ups/:id/assign-agent', authenticate, requirePermission('ai-calling:write'),
  validate({ ...id, body: Joi.object({ agentId: objectId.required(), dueAt: Joi.date().iso().allow(null), instructions: Joi.string().trim().max(2000).allow('', null) }) }),
  handle(async (req) => followUpCalling.assignAgent(req.params.id, req.body, await viewerOf(req), meta(req))));
router.post('/follow-ups/:id/call-now', authenticate, requirePermission('ai-calling:write'), validate(id),
  handle(async (req) => followUpCalling.callNow(req.params.id, await viewerOf(req), meta(req))));
router.post('/follow-ups/:id/pause', authenticate, requirePermission('ai-calling:write'), validate(id),
  handle(async (req) => followUpCalling.pause(req.params.id, await viewerOf(req), meta(req))));
router.post('/follow-ups/:id/resume', authenticate, requirePermission('ai-calling:write'), validate(id),
  handle(async (req) => followUpCalling.resume(req.params.id, await viewerOf(req), meta(req))));
router.post('/follow-ups/:id/assign-human', authenticate, requirePermission('ai-calling:write'),
  validate({ ...id, body: Joi.object({ ownerId: objectId.allow(null) }) }),
  handle(async (req) => followUpCalling.assignHuman(req.params.id, req.body || {}, await viewerOf(req), meta(req))));

router.post('/leads/:leadId/follow-ups/pause', authenticate, requirePermission('ai-calling:write'), validate(leadId),
  handle(async (req) => followUpCalling.pauseLead(req.params.leadId, await viewerOf(req), meta(req))));
router.post('/leads/:leadId/follow-ups/resume', authenticate, requirePermission('ai-calling:write'), validate(leadId),
  handle(async (req) => followUpCalling.resumeLead(req.params.leadId, await viewerOf(req), meta(req))));

export default router;
