import { Router } from 'express';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticateAgentCall } from './callAuth.js';
import * as schema from './callingIntelligence.validation.js';
import intelligence from './callIntelligence.service.js';
import knowledge from './knowledge.service.js';
import transfer from './humanTransfer.service.js';

/**
 * Calling intelligence (evidence-linked extraction + review), approved business
 * knowledge, and human transfer. Mounted inside /api/v1/ai-calling. Every route
 * carries its own auth: this router also sees /agent/* requests, which use the
 * per-call worker token instead of a user session.
 */
const router = Router();
const read = [authenticate, requirePermission('ai-calling:read')];
const write = [authenticate, requirePermission('ai-calling:write')];
const admin = [authenticate, requirePermission('ai-calling:admin')];
const meta = req => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });
const handle = (fn, { statusCode = 200, paged = false } = {}) => async (req, res, next) => {
  try { const data = await fn(req); return res.success(paged ? data : { data, statusCode }); } catch (e) { next(e); }
};
const q = req => req._validatedQuery || {};

// Evidence-linked extraction + review queue
router.get('/intelligence/review', read, validate(schema.reviewQueue), handle(req => intelligence.listReviewItems(req.user._id, q(req)), { paged: true }));
router.get('/calls/:id/intelligence', read, validate(schema.callId), handle(req => intelligence.getIntelligence(req.params.id, req.user._id)));
router.post('/calls/:id/intelligence/rerun', write, validate(schema.callId), handle(req => intelligence.rerun(req.params.id, req.user._id), { statusCode: 202 }));
router.post('/calls/:id/intelligence/items/:itemId/decision', write, validate(schema.decideItem), handle(req => intelligence.decide(req.params.id, req.params.itemId, req.user._id, req.body, meta(req))));

// Approved business knowledge (authoring: write; approval / publish / rollback: admin)
router.get('/knowledge', read, validate(schema.listKnowledge), handle(req => knowledge.list(q(req)), { paged: true }));
router.post('/knowledge', write, validate(schema.createEntry), handle(req => knowledge.create(req.body, req.user._id, meta(req)), { statusCode: 201 }));
router.get('/knowledge/versions', read, validate(schema.listVersions), handle(req => knowledge.listVersions(q(req)), { paged: true }));
router.post('/knowledge/versions', admin, validate(schema.publish), handle(req => knowledge.publish(req.user._id, req.body, meta(req)), { statusCode: 201 }));
router.get('/knowledge/versions/:id', read, validate(schema.versionId), handle(req => knowledge.getVersion(req.params.id)));
router.get('/knowledge/versions/:id/diff', read, validate(schema.diff), handle(req => knowledge.diff(req.params.id, q(req).from || null)));
router.post('/knowledge/versions/:id/rollback', admin, validate(schema.rollback), handle(req => knowledge.rollback(req.params.id, req.user._id, req.body, meta(req)), { statusCode: 201 }));
router.get('/knowledge/:id', read, validate(schema.entryId), handle(req => knowledge.get(req.params.id)));
router.patch('/knowledge/:id', write, validate(schema.updateEntry), handle(req => knowledge.update(req.params.id, req.body, req.user._id, meta(req))));
router.post('/knowledge/:id/submit', write, validate(schema.entryId), handle(req => knowledge.submit(req.params.id, req.user._id, meta(req))));
router.post('/knowledge/:id/approve', admin, validate(schema.approveEntry), handle(req => knowledge.approve(req.params.id, req.user._id, req.body, meta(req))));
router.post('/knowledge/:id/reject', admin, validate(schema.rejectEntry), handle(req => knowledge.reject(req.params.id, req.user._id, req.body, meta(req))));
router.post('/knowledge/:id/archive', write, validate(schema.entryId), handle(req => knowledge.archive(req.params.id, req.user._id, meta(req))));
router.post('/knowledge/:id/restore', write, validate(schema.entryId), handle(req => knowledge.restore(req.params.id, req.user._id, meta(req))));
router.put('/agents/:id/knowledge', write, validate(schema.agentKnowledge), handle(req => knowledge.setAgentKnowledge(req.params.id, req.user._id, req.body, meta(req))));

// Human transfer
router.get('/transfer/presence', read, handle(req => transfer.getPresence(req.user._id)));
router.put('/transfer/presence', read, validate(schema.presence), handle(req => transfer.setPresence(req.user._id, req.body, meta(req))));
router.get('/transfer/targets', write, handle(() => transfer.listTargets()));
router.get('/transfer/offers', read, handle(req => transfer.listOffers(req.user._id)));
router.post('/transfer/:id/accept', read, validate(schema.acceptTransfer), handle(req => transfer.accept(req.params.id, req.user._id, req.body, meta(req))));
router.post('/transfer/:id/decline', read, validate(schema.transferId), handle(req => transfer.decline(req.params.id, req.user._id, meta(req))));
router.post('/transfer/:id/joined', read, validate(schema.transferId), handle(req => transfer.markJoined({ _id: req.params.id, 'handoff.targetUserId': req.user._id }, req.user._id)));
router.put('/agents/:id/transfer', write, validate(schema.agentTransfer), handle(req => transfer.setAgentTransfer(req.params.id, req.user._id, req.body, meta(req))));

/** Worker tool endpoints (per-call bearer token), added to agentToolRoutes. */
export function registerTransferAgentTools(agentRoutes) {
  agentRoutes.post('/:callId/transfer', authenticateAgentCall, validate(schema.workerTransfer), handle(req => transfer.requestTransfer(req.agentCall.callId, req.body)));
  agentRoutes.get('/:callId/transfer', authenticateAgentCall, validate(schema.workerCallOnly), handle(req => transfer.transferStatus(req.agentCall.callId)));
  agentRoutes.post('/:callId/transfer/execute', authenticateAgentCall, validate(schema.workerCallOnly), handle(req => transfer.executePhoneTransfer(req.agentCall.callId)));
  agentRoutes.post('/:callId/transfer/joined', authenticateAgentCall, validate(schema.workerCallOnly), handle(req => transfer.markJoined({ internalCallId: req.agentCall.callId })));
  return agentRoutes;
}

export default router;
