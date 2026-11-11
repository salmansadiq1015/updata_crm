import { Router } from 'express';
import c from './workflow.controller.js';
import * as auth from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import * as s from './workflow.validation.js';
import { ipKeyGenerator } from 'express-rate-limit';
import { createLimiter } from '../../shared/middleware/rateLimiter.js';
import multer from 'multer';

// The copilot calls an LLM: a per-user budget keeps cost and abuse bounded.
const voiceLimiter = createLimiter({ windowMs: 60_000, max: 30, message: 'Too many voice requests, please wait a moment', keyGenerator: (req) => `wf-voice:${req.user?._id || ipKeyGenerator(req.ip || '')}` });
// Copilot dictation: audio stays in memory, is transcribed and discarded — never stored.
const VOICE_TYPES = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/wav', 'audio/x-wav']);
const voiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, VOICE_TYPES.has(String(file.mimetype).toLowerCase().split(';')[0])),
}).single('audio');
const checkLimiter = createLimiter({ windowMs: 60_000, max: 30, message: 'Too many checks, please wait a moment', keyGenerator: (req) => `wf-check:${req.user?._id || ipKeyGenerator(req.ip || '')}` });
const copilotLimiter = createLimiter({ windowMs: 60_000, max: 20, message: 'Too many AI requests, please wait a moment', keyGenerator: (req) => `wf-copilot:${req.user?._id || ipKeyGenerator(req.ip || '')}` });

/**
 * /api/v1/workflows — Workflow Automation (admin feature).
 *   workflow:read     view workflows, executions, events, analytics
 *   workflow:write    edit drafts, validate, dry-run test, duplicate
 *   workflow:publish  publish / pause / archive / roll back (changes live automation)
 *   workflow:execute  run campaigns and manually control executions (retry/skip/pause/stop)
 * Named routes are declared before '/:id'.
 */
const router = Router();
const { authenticate, requirePermission } = auth;
const read = [authenticate, requirePermission('workflow:read')];
const write = [authenticate, requirePermission('workflow:write')];
const publish = [authenticate, requirePermission('workflow:publish')];
const execute = [authenticate, requirePermission('workflow:execute')];

router.get('/catalog', ...read, c.catalog);
router.get('/templates', ...read, c.templates);
router.get('/analytics', ...read, validate(s.analytics), c.analytics);
router.get('/events', ...read, validate(s.listEvents), c.listEvents);
router.get('/leads/:leadId/history', ...read, validate(s.leadParam), c.leadHistory);

router.get('/runs', ...read, validate(s.listRuns), c.listRuns);
router.get('/runs/:id', ...read, validate(s.byId), c.getRun);
router.post('/runs/:id/:action', ...execute, validate(s.controlRun), c.controlRun);

router.get('/campaigns', ...read, validate(s.listCampaigns), c.listCampaigns);
router.post('/campaigns', ...execute, validate(s.createCampaign), c.createCampaign);
router.post('/campaigns/preview', ...execute, validate(s.previewCampaign), c.previewCampaign);
router.get('/campaigns/:id', ...read, validate(s.byId), c.getCampaign);
router.post('/campaigns/:id/start', ...execute, validate(s.byId), c.startCampaign);
router.post('/campaigns/:id/pause', ...execute, validate(s.byId), c.pauseCampaign);
router.post('/campaigns/:id/resume', ...execute, validate(s.byId), c.resumeCampaign);
router.post('/campaigns/:id/stop', ...execute, validate(s.byId), c.stopCampaign);

router.get('/', ...read, validate(s.list), c.list);
router.post('/', ...write, validate(s.create), c.create);
router.get('/:id', ...read, validate(s.byId), c.get);
router.patch('/:id', ...write, validate(s.update), c.update);
router.delete('/:id', ...write, validate(s.byId), c.remove);
router.post('/:id/validate', ...write, validate(s.validateGraph), c.validate);
router.post('/:id/test', ...write, validate(s.test), c.test);
router.post('/:id/analyze', ...write, checkLimiter, validate(s.analyze), c.analyze);
router.post('/:id/copilot', ...write, copilotLimiter, validate(s.copilot), c.copilot);
router.post('/:id/copilot/transcribe', ...write, voiceLimiter, validate(s.byId), voiceUpload, c.copilotTranscribe);
router.post('/:id/duplicate', ...write, validate(s.byId), c.duplicate);
router.post('/:id/publish', ...publish, validate(s.publish), c.publish);
router.post('/:id/status', ...publish, validate(s.setStatus), c.setStatus);
router.get('/:id/versions', ...read, validate(s.byId), c.versions);
router.get('/:id/versions/:version', ...read, validate(s.version), c.getVersion);
router.post('/:id/versions/:version/rollback', ...publish, validate(s.version), c.rollback);

export default router;
