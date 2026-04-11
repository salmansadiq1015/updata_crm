import { Router } from 'express';
import documentNumberSequenceController from './documentNumberSequence.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createSequenceSchema,
  updateSequenceSchema,
  sequenceIdSchema,
} from './documentNumberSequence.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('quotations:admin'), (req, res, next) => documentNumberSequenceController.list(req, res, next));
router.post('/', authenticate, requirePermission('quotations:admin'), validate(createSequenceSchema), (req, res, next) => documentNumberSequenceController.create(req, res, next));
router.put('/:id', authenticate, requirePermission('quotations:admin'), validate(updateSequenceSchema), (req, res, next) => documentNumberSequenceController.update(req, res, next));
router.get('/:id/preview', authenticate, requirePermission('quotations:admin'), validate(sequenceIdSchema), (req, res, next) => documentNumberSequenceController.preview(req, res, next));

export default router;
