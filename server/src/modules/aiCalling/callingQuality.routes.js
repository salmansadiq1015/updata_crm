import { Router } from 'express';
import crypto from 'node:crypto';
import multer from 'multer';
import quality from './callQuality.service.js';
import benchmarks from './benchmark.service.js';
import experiments from './scriptExperiment.service.js';
import fileService from '../files/file.service.js';
import * as schema from './callingQuality.validation.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { uploadLimiter } from '../../shared/middleware/rateLimiter.js';
import { validate } from '../../shared/validation/validate.js';
import { ValidationError } from '../../shared/errors/AppError.js';

/**
 * Calling quality (telemetry dashboard), benchmarks and script experiments.
 * Mounted inside /api/v1/ai-calling. Reads need ai-calling:read; editing cases and
 * running benchmarks ai-calling:write; approving ground truth, starting/promoting
 * experiments and rollback ai-calling:admin.
 */
const router = Router();
const read = [authenticate, requirePermission('ai-calling:read')];
const write = [authenticate, requirePermission('ai-calling:write')];
const admin = [authenticate, requirePermission('ai-calling:admin')];
const meta = req => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });
const handle = (fn, { statusCode = 200 } = {}) => async (req, res, next) => {
  try { const data = await fn(req); return res.success({ data, statusCode }); } catch (e) { next(e); }
};
const query = req => req._validatedQuery || {};
// Audio types the storage layer accepts (config/storage.js).
const AUDIO_TYPES = new Set(['audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm']);
const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

// ---- quality dashboard
router.get('/quality/summary', read, validate(schema.qualitySummary), handle(req => quality.summary(req.user._id, query(req))));
router.get('/quality/flagged', read, validate(schema.qualityFlagged), handle(req => quality.flagged(req.user._id, query(req))));

// ---- benchmarks (named routes before :id)
router.get('/benchmarks/suites', read, validate(schema.listSuites), handle(req => benchmarks.listSuites(req.user._id, query(req))));
router.post('/benchmarks/suites', write, validate(schema.createSuite), handle(req => benchmarks.createSuite(req.body, req.user._id, meta(req)), { statusCode: 201 }));
router.post('/benchmarks/suites/sample', write, handle(req => benchmarks.seedSampleSuite(req.user._id, meta(req)), { statusCode: 201 }));
router.get('/benchmarks/suites/:id', read, validate(schema.suiteId), handle(req => benchmarks.getSuite(req.params.id, req.user._id)));
router.patch('/benchmarks/suites/:id', write, validate(schema.updateSuite), handle(req => benchmarks.updateSuite(req.params.id, req.body, req.user._id, meta(req))));
router.post('/benchmarks/suites/:id/cases', write, validate(schema.createCase), handle(req => benchmarks.createCase(req.params.id, req.body, req.user._id, meta(req)), { statusCode: 201 }));
router.get('/benchmarks/suites/:id/runs', read, validate(schema.suiteId), handle(req => benchmarks.listRuns(req.params.id, req.user._id)));
router.post('/benchmarks/suites/:id/runs', write, validate(schema.createRun), handle(req => benchmarks.createRun(req.params.id, req.body, req.user._id, meta(req)), { statusCode: 202 }));
router.patch('/benchmarks/cases/:caseId', write, validate(schema.updateCase), handle(req => benchmarks.updateCase(req.params.caseId, req.body, req.user._id, meta(req))));
router.delete('/benchmarks/cases/:caseId', write, validate(schema.caseId), handle(req => benchmarks.removeCase(req.params.caseId, req.user._id, meta(req))));
router.post('/benchmarks/cases/:caseId/review', admin, validate(schema.reviewCase), handle(req => benchmarks.reviewCase(req.params.caseId, req.body, req.user._id, meta(req))));
router.get('/benchmarks/runs/compare', read, validate(schema.compareRuns), handle(req => benchmarks.compareRuns(query(req).a, query(req).b, req.user._id)));
router.get('/benchmarks/runs/:runId', read, validate(schema.runId), handle(req => benchmarks.getRun(req.params.runId, req.user._id)));
router.post('/benchmarks/audio', write, uploadLimiter, audioUpload.single('audio'), handle(async (req) => {
  const file = req.file;
  if (!file || !AUDIO_TYPES.has(file.mimetype)) throw new ValidationError('Upload a WAV, MP3, M4A, OGG or WebM recording up to 25 MB');
  const ext = (file.originalname.match(/\.[a-z0-9]{2,5}$/i)?.[0] || '').toLowerCase();
  const uploaded = await fileService.upload({ buffer: file.buffer, originalName: `${crypto.randomUUID()}${ext}`, mimeType: file.mimetype, sizeBytes: file.size,
    module: 'ai-calling', entityType: 'benchmark-audio', entityId: req.user._id, uploadedBy: req.user._id, bucket: 'all' });
  const doc = uploaded.toObject ? uploaded.toObject() : uploaded;
  return { fileId: String(doc._id), mimeType: file.mimetype, size: file.size };
}, { statusCode: 201 }));

// ---- script versions + experiments
router.get('/script-versions', read, validate(schema.listVersions), handle(req => experiments.listVersions(query(req).agentId, req.user._id)));
router.post('/script-versions', write, validate(schema.createVersion), handle(req => experiments.createVersion(req.body, req.user._id, meta(req)), { statusCode: 201 }));
router.get('/script-versions/agents/:agentId/state', read, validate(schema.agentScriptState), handle(req => experiments.scriptState(req.params.agentId, req.user._id)));
router.post('/script-versions/agents/:agentId/rollback', admin, validate(schema.rollback), handle(req => experiments.rollback(req.params.agentId, req.body, req.user._id, meta(req))));
router.get('/experiments', read, validate(schema.listExperiments), handle(req => experiments.listExperiments(query(req).agentId, req.user._id)));
router.post('/experiments', write, validate(schema.createExperiment), handle(req => experiments.createExperiment(req.body, req.user._id, meta(req)), { statusCode: 201 }));
router.get('/experiments/:id', read, validate(schema.experimentId), handle(req => experiments.getExperiment(req.params.id, req.user._id)));
router.patch('/experiments/:id', write, validate(schema.updateExperiment), handle(req => experiments.updateExperiment(req.params.id, req.body, req.user._id, meta(req))));
router.post('/experiments/:id/start', admin, validate(schema.experimentAction), handle(req => experiments.startExperiment(req.params.id, req.user._id, meta(req))));
router.post('/experiments/:id/pause', write, validate(schema.experimentAction), handle(req => experiments.pauseExperiment(req.params.id, req.user._id, req.body, meta(req))));
router.post('/experiments/:id/promote', admin, validate(schema.promoteExperiment), handle(req => experiments.promote(req.params.id, req.body, req.user._id, meta(req))));

export default router;
