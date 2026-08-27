import { Router } from 'express';
import ingestionController from './ingestion.controller.js';
import { validate } from '../../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../../shared/middleware/authenticate.js';
import { updateSourceSchema, sourceKeySchema } from './ingestion.validation.js';

const router = Router();

// Reading which mailbox the firm's paperwork flows through, and switching it
// on, is administration — not something a technician needs.
router.use(authenticate, requirePermission('integrations:admin'));

router.get('/', (req, res, next) => ingestionController.overview(req, res, next));
router.put('/:key', validate(updateSourceSchema), (req, res, next) => ingestionController.update(req, res, next));
router.post('/:key/test', validate(sourceKeySchema), (req, res, next) => ingestionController.test(req, res, next));
router.post('/:key/run', validate(sourceKeySchema), (req, res, next) => ingestionController.runNow(req, res, next));

export default router;
