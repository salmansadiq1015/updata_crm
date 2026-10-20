import { Router } from 'express';
import multer from 'multer';
import leadCommunicationController from './leadCommunication.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { getQualification, proposeQualification, transcribeVoiceNote } from './leadCommunication.validation.js';

/**
 * Lead qualification — mounted at /api/v1/crm/leads/:leadId/qualification by
 * lead.routes.js (mergeParams). `propose` only suggests; it never writes.
 */
const router = Router({ mergeParams: true });

router.get('/', authenticate, requirePermission('lead:read'), validate(getQualification), (req, res, next) => leadCommunicationController.getQualification(req, res, next));
router.post('/propose', authenticate, requirePermission('lead:write'), validate(proposeQualification), (req, res, next) => leadCommunicationController.proposeQualification(req, res, next));

// Voice note → text (after a call: Android gives apps no microphone during a SIM
// call). Audio is held in memory only, transcribed and discarded — never stored.
const AUDIO_TYPES = new Set(['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm']);
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, AUDIO_TYPES.has(String(file.mimetype).toLowerCase())),
}).single('audio');
router.post('/transcribe', authenticate, requirePermission('lead:write'), validate(transcribeVoiceNote), audioUpload, (req, res, next) => leadCommunicationController.transcribeVoiceNote(req, res, next));

export default router;
