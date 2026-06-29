import { Router } from 'express';
import fiscalPeriodController from './fiscalPeriod.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  closeFiscalPeriodSchema,
  createFiscalPeriodSchema,
  fiscalPeriodIdParamSchema,
  listFiscalPeriodsSchema,
  reopenFiscalPeriodSchema,
} from './fiscalPeriod.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('accounting:journal:read'), validate(listFiscalPeriodsSchema), (req, res, next) => fiscalPeriodController.list(req, res, next));
router.post('/', authenticate, requirePermission('accounting:journal:write'), validate(createFiscalPeriodSchema), (req, res, next) => fiscalPeriodController.create(req, res, next));
router.post('/:id/close', authenticate, requirePermission('accounting:journal:write'), validate(closeFiscalPeriodSchema), (req, res, next) => fiscalPeriodController.close(req, res, next));
router.post('/:id/reopen', authenticate, requirePermission('accounting:journal:write'), validate(reopenFiscalPeriodSchema), (req, res, next) => fiscalPeriodController.reopen(req, res, next));
router.get('/:id', authenticate, requirePermission('accounting:journal:read'), validate(fiscalPeriodIdParamSchema), (req, res, next) => fiscalPeriodController.getById(req, res, next));

export default router;
