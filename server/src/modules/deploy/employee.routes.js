import { Router } from 'express';
import deployEmployeeController from './employee.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { listDeployEmployeesSchema } from './employee.validation.js';

const router = Router();

router.get(
  '/',
  authenticate,
  requirePermission('scheduling:read'),
  validate(listDeployEmployeesSchema),
  (req, res, next) => deployEmployeeController.list(req, res, next),
);

export default router;
