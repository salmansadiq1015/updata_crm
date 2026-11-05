import { Router } from 'express';

import service from './inboundCall.service.js';
import query from './inboundQuery.service.js';
import costs from './inboundCost.service.js';
import { QUESTION_TEMPLATES, QUESTION_TYPES, STANDARD_KEYS } from './engine/closingQuestions.js';
import * as schemas from './inboundCall.validation.js';
import { authenticate, requirePermission, loadUserPermissions, satisfiesPermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticateGateway } from '../pairedPhone/pairedPhone.routes.js';
import { authenticateInboundAgent } from './inboundAuth.js';

const meta = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });
const q = (req) => req._validatedQuery || req.query;
const wrap = (fn) => async (req, res, next) => {
  try {
    const out = await fn(req, res);
    if (out !== undefined) res.success({ data: out });
  } catch (error) { next(error); }
};

async function viewerOf(req) {
  const isAdmin = req.user?.role?.name === 'Admin';
  const perms = isAdmin ? [] : await loadUserPermissions(req.user);
  return { id: String(req.user._id), seeAll: isAdmin || satisfiesPermission(perms, 'inbound-calls:admin') };
}
const owner = (req) => req.user._id;

/** Owner API: /api/v1/inbound-calls (web + mobile). */
const router = Router();
const read = [authenticate, requirePermission('inbound-calls:read')];
const write = [authenticate, requirePermission('inbound-calls:write')];

router.get('/', ...read, validate(schemas.list), wrap(async (req, res) => { res.success(await query.list(await viewerOf(req), q(req))); }));
router.get('/stats', ...read, validate(schemas.filters), wrap(async (req) => query.stats(await viewerOf(req), q(req))));
router.get('/analytics', ...read, validate(schemas.filters), wrap(async (req) => query.analytics(await viewerOf(req), q(req))));
router.get('/live', ...read, wrap(async (req) => query.live(await viewerOf(req))));
router.get('/export', ...read, validate(schemas.filters), async (req, res, next) => {
  try {
    const csv = await query.exportCsv(await viewerOf(req), q(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="incoming-calls-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (error) { next(error); }
});
router.get('/costs', ...read, validate(schemas.costs), wrap(async (req) => costs.analytics(await viewerOf(req), q(req))));
router.get('/costs/export', ...read, validate(schemas.costs), async (req, res, next) => {
  try {
    const csv = await costs.csv(await viewerOf(req), q(req));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="incoming-call-costs-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (error) { next(error); }
});
router.get('/question-templates', ...read, wrap(() => ({ templates: QUESTION_TEMPLATES, types: QUESTION_TYPES, standardKeys: Object.keys(STANDARD_KEYS) })));
router.get('/devices', ...read, wrap(async (req) => query.devices(await viewerOf(req))));
router.put('/devices/:id/sims', ...write, validate(schemas.reportSims), wrap((req) => service.reportSims(owner(req), req.params.id, req.body, meta(req))));
router.post('/agents/:agentId/test', ...write, validate(schemas.agentTest), wrap((req) => service.startBrowserTest(owner(req), req.params.agentId, meta(req))));
router.get('/settings', ...read, wrap((req) => service.getSettings(owner(req))));
router.patch('/settings', ...write, validate(schemas.settings), wrap((req) => service.updateSettings(owner(req), req.body, meta(req))));
router.post('/rules', ...write, validate(schemas.saveRule), wrap((req) => service.saveRule(owner(req), req.body, meta(req))));
router.post('/rules/test', ...read, validate(schemas.testRules), wrap((req) => service.testRules(owner(req), req.body)));
router.delete('/rules/:ruleId', ...write, validate(schemas.ruleId), wrap((req) => service.deleteRule(owner(req), req.params.ruleId, meta(req))));
router.get('/leads/:id', ...read, validate(schemas.callId), wrap(async (req) => query.forLead(await viewerOf(req), req.params.id)));
router.get('/:id', ...read, validate(schemas.callId), wrap(async (req) => query.get(await viewerOf(req), req.params.id)));
router.post('/:id/notes', ...write, validate(schemas.note), wrap(async (req) => query.addNote(await viewerOf(req), req.params.id, req.body.text)));
router.post('/:id/fields/:fieldId', ...write, validate(schemas.reviewField), wrap(async (req) => query.reviewField(await viewerOf(req), req.params.id, req.params.fieldId, req.body)));
router.post('/:id/match', ...write, validate(schemas.resolveMatch), wrap(async (req) => query.resolveMatch(await viewerOf(req), req.params.id, req.body.leadId)));
router.post('/:id/lead', ...write, validate(schemas.createLead), wrap(async (req) => query.createLead(await viewerOf(req), req.params.id, { force: Boolean(req.body?.force) })));
router.patch('/:id/work', ...write, validate(schemas.work), wrap(async (req) => query.updateWork(await viewerOf(req), req.params.id, req.body)));
router.post('/:id/recommendations/:recId', ...write, validate(schemas.recommendation), wrap(async (req) => query.decideRecommendation(await viewerOf(req), req.params.id, req.params.recId, req.body)));
router.post('/:id/follow-up', ...write, validate(schemas.followUp), wrap(async (req) => query.scheduleFollowUp(await viewerOf(req), req.params.id, req.body)));
// Live call control is owner-only (the phone is theirs), even for supervisors.
router.post('/:id/control/:kind', ...write, validate(schemas.control), wrap((req) => service.control(owner(req), req.params.id, req.params.kind, meta(req))));

/** Gateway API (device bearer token): /api/v1/paired-phone/gateway/inbound */
export const inboundGatewayRoutes = Router();
inboundGatewayRoutes.post('/ring', authenticateGateway, validate(schemas.ring), wrap((req) => service.ring(req.gatewayDevice, req.body)));
inboundGatewayRoutes.post('/calls/:callId/events', authenticateGateway, validate(schemas.gatewayEvent), wrap((req) => service.gatewayEvent(req.gatewayDevice, req.params.callId, req.body)));
inboundGatewayRoutes.post('/calls/:callId/answer-job', authenticateGateway, validate(schemas.gatewayCall), wrap((req) => service.answerJob(req.gatewayDevice, req.params.callId)));

/** Voice agent API (per-call token): /api/v1/inbound-calls/agent */
export const inboundAgentRoutes = Router();
const A = authenticateInboundAgent;
const id = (req) => req.agentCall.callId;
inboundAgentRoutes.get('/:callId/context', A, validate(schemas.agentOnly), wrap((req) => service.agentContext(id(req))));
inboundAgentRoutes.post('/:callId/answered', A, validate(schemas.agentOnly), wrap((req) => service.agentAnswered(id(req))));
inboundAgentRoutes.post('/:callId/caller-info', A, validate(schemas.agentInfo), wrap((req) => service.agentRecordInfo(id(req), req.body)));
inboundAgentRoutes.post('/:callId/caller-question', A, validate(schemas.agentQuestion), wrap((req) => service.agentRecordQuestion(id(req), req.body)));
inboundAgentRoutes.post('/:callId/intent', A, validate(schemas.agentIntent), wrap((req) => service.agentSetIntent(id(req), req.body)));
inboundAgentRoutes.post('/:callId/request-callback', A, validate(schemas.agentCallback), wrap((req) => service.agentRequestCallback(id(req), req.body)));
inboundAgentRoutes.post('/:callId/request-human', A, validate(schemas.agentHuman), wrap((req) => service.agentRequestHuman(id(req), req.body)));
inboundAgentRoutes.post('/:callId/do-not-contact', A, validate(schemas.agentOnly), wrap((req) => service.agentDoNotContact(id(req))));
inboundAgentRoutes.post('/:callId/transcript', A, validate(schemas.agentTranscript), wrap((req) => service.agentTranscript(id(req), req.body)));
inboundAgentRoutes.post('/:callId/activity', A, validate(schemas.agentActivity), wrap((req) => service.agentActivity(id(req), req.body)));
inboundAgentRoutes.post('/:callId/language', A, validate(schemas.agentLanguage), wrap((req) => service.agentLanguage(id(req), req.body)));
inboundAgentRoutes.post('/:callId/behavior', A, validate(schemas.agentLoose), wrap((req) => service.agentBehavior(id(req), req.body)));
inboundAgentRoutes.post('/:callId/voice-provider', A, validate(schemas.agentLoose), wrap((req) => service.agentProviderAttempt(id(req), req.body)));
inboundAgentRoutes.post('/:callId/end', A, validate(schemas.agentLoose), wrap((req) => service.agentEnd(id(req), req.body)));

export default router;
