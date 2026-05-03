import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate.js';
import { validate } from '../../../shared/validation/validate.js';
import agentController from './agent.controller.js';
import { runAgentSchema, confirmAgentSchema, listAgentRunsSchema } from './agent.validation.js';

const router = Router();

// GET /agent — list agent runs for authenticated user
router.get('/', authenticate, validate({ query: listAgentRunsSchema }), agentController.list);

// POST /agent/run — dispatch a new agent run
router.post('/run', authenticate, validate({ body: runAgentSchema }), agentController.run);

// GET /agent/:runId — get status of a specific agent run
router.get('/:runId', authenticate, agentController.getStatus);

// POST /agent/:runId/confirm — confirm or cancel a pending agent run
router.post('/:runId/confirm', authenticate, validate({ body: confirmAgentSchema }), agentController.confirm);

export default router;
