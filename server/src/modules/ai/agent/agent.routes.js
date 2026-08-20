import { Router } from 'express';
import { authenticate, requirePermission } from '../../../shared/middleware/authenticate.js';
import { validate } from '../../../shared/validation/validate.js';
import agentController from './agent.controller.js';
import { runAgentSchema, confirmAgentSchema, listAgentRunsSchema } from './agent.validation.js';

const router = Router();

// Every role that may use the assistant carries ai:sessions (seeded on all roles);
// route-level RBAC here, per-action RBAC stays in the capability layer.
router.use(authenticate, requirePermission('ai:sessions'));

// GET /agent — list threads for authenticated user
router.get('/', validate({ query: listAgentRunsSchema }), agentController.list);

// POST /agent/run — dispatch a new agent run
router.post('/run', validate({ body: runAgentSchema }), agentController.run);

// GET /agent/thread/:threadId — get all runs in a thread
router.get('/thread/:threadId', agentController.listThread);

// PATCH /agent/thread/:threadId/archive — archive entire thread
router.patch('/thread/:threadId/archive', agentController.archiveThread);

// DELETE /agent/thread/:threadId — delete entire thread
router.delete('/thread/:threadId', agentController.deleteThread);

// GET /agent/:runId — get status of a specific agent run
router.get('/:runId', agentController.getStatus);

// POST /agent/:runId/confirm — confirm or cancel a pending agent run
router.post('/:runId/confirm', validate({ body: confirmAgentSchema }), agentController.confirm);

// PATCH /agent/:runId/archive — archive a run
router.patch('/:runId/archive', agentController.archive);

// PATCH /agent/:runId/unarchive — restore an archived run
router.patch('/:runId/unarchive', agentController.unarchive);

// DELETE /agent/:runId — permanently delete a run
router.delete('/:runId', agentController.delete);

export default router;
