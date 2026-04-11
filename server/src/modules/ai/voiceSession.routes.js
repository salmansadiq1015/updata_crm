import { Router } from 'express';
import multer from 'multer';
import voiceSessionController from './voiceSession.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createSessionSchema,
  sessionIdParamSchema,
  uploadAudioSchema,
  listSessionsSchema,
  submitCorrectionsSchema,
  confirmSessionSchema,
} from './voiceSession.validation.js';

const router = Router();

// Multer: memory storage for audio uploads (max 50 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.get('/', authenticate, requirePermission('ai:sessions'), validate(listSessionsSchema), (req, res, next) => voiceSessionController.list(req, res, next));
router.post('/', authenticate, requirePermission('ai:sessions'), validate(createSessionSchema), (req, res, next) => voiceSessionController.create(req, res, next));
router.get('/:sessionId', authenticate, requirePermission('ai:sessions'), validate(sessionIdParamSchema), (req, res, next) => voiceSessionController.getById(req, res, next));
router.post('/:sessionId/audio', authenticate, requirePermission('ai:sessions'), upload.single('audio'), validate(uploadAudioSchema), (req, res, next) => voiceSessionController.uploadAudio(req, res, next));
router.patch('/:sessionId/corrections', authenticate, requirePermission('ai:sessions'), validate(submitCorrectionsSchema), (req, res, next) => voiceSessionController.submitCorrections(req, res, next));
router.post('/:sessionId/confirm', authenticate, requirePermission('ai:sessions'), validate(confirmSessionSchema), (req, res, next) => voiceSessionController.confirm(req, res, next));
router.post('/:sessionId/cancel', authenticate, requirePermission('ai:sessions'), validate(sessionIdParamSchema), (req, res, next) => voiceSessionController.cancel(req, res, next));

export default router;
