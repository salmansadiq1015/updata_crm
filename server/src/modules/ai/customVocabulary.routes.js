import { Router } from 'express';
import customVocabularyController from './customVocabulary.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createVocabularySchema,
  updateVocabularySchema,
  vocabularyIdParamSchema,
  listVocabularySchema,
} from './customVocabulary.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('ai:vocabulary:manage'), validate(listVocabularySchema), (req, res, next) => customVocabularyController.list(req, res, next));
router.post('/', authenticate, requirePermission('ai:vocabulary:manage'), validate(createVocabularySchema), (req, res, next) => customVocabularyController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('ai:vocabulary:manage'), validate(vocabularyIdParamSchema), (req, res, next) => customVocabularyController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('ai:vocabulary:manage'), validate(updateVocabularySchema), (req, res, next) => customVocabularyController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('ai:vocabulary:manage'), validate(vocabularyIdParamSchema), (req, res, next) => customVocabularyController.remove(req, res, next));

export default router;
