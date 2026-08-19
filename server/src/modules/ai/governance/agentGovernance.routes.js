import { Router } from 'express';
import { authenticate, requirePermission } from '../../../shared/middleware/authenticate.js';
import { validate } from '../../../shared/validation/validate.js';
import agentGovernanceController from './agentGovernance.controller.js';
import { setEnabledSchema, emergencyStopSchema } from './agentGovernance.validation.js';

const router = Router();

// Switching an agent off is an administrative act, not a user preference.
router.use(authenticate, requirePermission('ai:agents:manage'));

// GET /ai/governance — registry, emergency-stop state, risk vocabulary
router.get('/', agentGovernanceController.list);

// PATCH /ai/governance/agents/:key — per-agent kill switch
router.patch('/agents/:key', validate(setEnabledSchema), agentGovernanceController.setEnabled);

// POST /ai/governance/emergency-stop — halt or release every agent at once
router.post('/emergency-stop', validate(emergencyStopSchema), agentGovernanceController.emergencyStop);

export default router;
