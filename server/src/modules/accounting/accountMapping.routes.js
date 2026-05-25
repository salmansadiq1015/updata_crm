import { Router } from 'express';
import accountMappingController from './accountMapping.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listAccountMappingsSchema,
  resolveAccountMappingSchema,
  upsertAccountMappingSchema,
} from './accountMapping.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('accounting:chart:read'), validate(listAccountMappingsSchema), (req, res, next) => accountMappingController.list(req, res, next));
router.post('/', authenticate, requirePermission('accounting:chart:manage'), validate(upsertAccountMappingSchema), (req, res, next) => accountMappingController.upsert(req, res, next));
router.get('/resolve/:mappingType', authenticate, requirePermission('accounting:chart:read'), validate(resolveAccountMappingSchema), (req, res, next) => accountMappingController.resolve(req, res, next));

export default router;
