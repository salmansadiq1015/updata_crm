import { Router } from 'express';
import accountingSearchController from './accountingSearch.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { accountingSearchSchema } from './accountingSearch.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('accounting:read'), validate(accountingSearchSchema), (req, res, next) => accountingSearchController.search(req, res, next));

export default router;
