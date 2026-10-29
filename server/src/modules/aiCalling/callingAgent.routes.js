import { Router } from 'express';
import multer from 'multer';
import service from './callingAgent.service.js';
import analytics from './callAnalytics.service.js';
import { agentAvatarPresets } from './agentAvatarPresets.js';
import * as schema from './callingAgent.validation.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { uploadLimiter } from '../../shared/middleware/rateLimiter.js';
import { validate } from '../../shared/validation/validate.js';

const router = Router();
const read = [authenticate, requirePermission('ai-calling:read')];
const write = [authenticate, requirePermission('ai-calling:write')];
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const meta = req => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });
const handle = (fn, { paged = false, statusCode = 200 } = {}) => async (req, res, next) => {
  try { const data = await fn(req); return res.success(paged ? (data.summary ? { data: { agents: data.data, summary: data.summary }, pagination: data.pagination } : data) : { data, statusCode }); } catch (e) { next(e); }
};
router.get('/agent-avatar-presets', read, handle(() => agentAvatarPresets));
router.get('/agent-images', read, validate(schema.listImages), handle(req => service.listImages(req.user._id, req._validatedQuery), { paged: true }));
router.post('/agent-images', write, uploadLimiter, upload.single('image'), handle(req => service.uploadImage(req.file, req.user._id), { statusCode: 201 }));
router.delete('/agent-images/:id', write, validate(schema.imageId), handle(req => service.removeImage(req.params.id, req.user._id)));
router.get('/agents', read, validate(schema.listAgents), handle(req => service.list(req.user._id, req._validatedQuery), { paged: true }));
router.post('/agents', write, validate(schema.createAgent), handle(req => service.create(req.body, req.user._id, meta(req)), { statusCode: 201 }));
router.get('/agents/:id', read, validate(schema.agentId), handle(req => service.get(req.params.id, req.user._id)));
router.get('/agents/:id/call-analytics', read, validate(schema.callAnalytics), handle(req => analytics.agentCallAnalytics(req.params.id, req.user._id, req._validatedQuery)));
router.get('/agents/:id/call-analytics/export', read, validate(schema.callAnalytics), async (req, res, next) => {
  try {
    const csv = await analytics.agentCallAnalyticsCsv(req.params.id, req.user._id, req._validatedQuery);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ai-agent-calls-${req.params.id}.csv"`);
    return res.send(csv);
  } catch (e) { next(e); }
});
router.patch('/agents/:id', write, validate(schema.updateAgent), handle(req => service.update(req.params.id, req.body, req.user._id, meta(req))));
router.delete('/agents/:id', write, validate(schema.agentId), handle(req => service.remove(req.params.id, req.user._id, meta(req))));
router.post('/agents/:id/duplicate', write, validate(schema.agentId), handle(req => service.duplicate(req.params.id, req.user._id, meta(req)), { statusCode: 201 }));
router.put('/agents/:id/leads', write, validate(schema.assignLeads), handle(req => service.assign(req.params.id, req.body, req.user._id, meta(req))));
router.post('/agents/:id/launch', write, validate(schema.launchAgent), handle(req => service.launch(req.params.id, req.body, req.user._id, meta(req)), { statusCode: 202 }));
export default router;
