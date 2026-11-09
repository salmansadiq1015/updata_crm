import { Router } from 'express';
import { authenticate, requirePermission } from '../../../shared/middleware/authenticate.js';
import { validate } from '../../../shared/validation/validate.js';
import controller from './voiceAgent.controller.js';
import { createVoiceSessionSchema, runVoiceToolSchema } from './voiceAgent.validation.js';

const router = Router();

// Same gate as the chat assistant; each tool then checks its own module permission.
router.use(authenticate, requirePermission('ai:sessions'));

router.get('/status', controller.status);
router.post('/session', validate({ body: createVoiceSessionSchema }), controller.createSession);
router.post('/tool', validate({ body: runVoiceToolSchema }), controller.runTool);

export default router;
