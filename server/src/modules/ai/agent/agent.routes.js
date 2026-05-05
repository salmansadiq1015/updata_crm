import { Router } from 'express';
import { authenticate } from '../../../shared/middleware/authenticate.js';
import { validate } from '../../../shared/validation/validate.js';
import agentController from './agent.controller.js';
import { runAgentSchema, confirmAgentSchema, listAgentRunsSchema } from './agent.validation.js';

const router = Router();

// GET /agent — list threads for authenticated user
router.get('/', authenticate, validate({ query: listAgentRunsSchema }), agentController.list);

// POST /agent/run — dispatch a new agent run
router.post('/run', authenticate, validate({ body: runAgentSchema }), agentController.run);

// GET /agent/thread/:threadId — get all runs in a thread
router.get('/thread/:threadId', authenticate, agentController.listThread);

// PATCH /agent/thread/:threadId/archive — archive entire thread
router.patch('/thread/:threadId/archive', authenticate, agentController.archiveThread);

// DELETE /agent/thread/:threadId — delete entire thread
router.delete('/thread/:threadId', authenticate, agentController.deleteThread);

// GET /agent/:runId — get status of a specific agent run
router.get('/:runId', authenticate, agentController.getStatus);

// POST /agent/:runId/confirm — confirm or cancel a pending agent run
router.post('/:runId/confirm', authenticate, validate({ body: confirmAgentSchema }), agentController.confirm);

// PATCH /agent/:runId/archive — archive a run
router.patch('/:runId/archive', authenticate, agentController.archive);

// PATCH /agent/:runId/unarchive — restore an archived run
router.patch('/:runId/unarchive', authenticate, agentController.unarchive);

// DELETE /agent/:runId — permanently delete a run
router.delete('/:runId', authenticate, agentController.delete);

export default router;
