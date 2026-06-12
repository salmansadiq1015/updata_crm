import { Router } from 'express';
import Joi from 'joi';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import { objectId } from '../../shared/validation/commonSchemas.js';
import aiDocumentController from './aiDocument.controller.js';

const router = Router();

const generateSchema = {
  body: Joi.object({
    sessionId: objectId.required(),
    templateType: Joi.string().optional(),
  }),
};

const previewSchema = {
  body: Joi.object({
    sessionId: objectId.required(),
    templateType: Joi.string().optional(),
  }),
};

router.post(
  '/preview',
  authenticate,
  requirePermission('ai:sessions'),
  validate(previewSchema),
  (req, res, next) => aiDocumentController.preview(req, res, next),
);

router.post(
  '/generate',
  authenticate,
  requirePermission('ai:sessions'),
  validate(generateSchema),
  (req, res, next) => aiDocumentController.generate(req, res, next),
);

export default router;
