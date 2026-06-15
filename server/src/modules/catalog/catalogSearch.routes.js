import { Router } from 'express';
import catalogSearchController from './catalogSearch.controller.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';
import { recentSearchesSchema } from './catalogSearch.validation.js';

const router = Router();

router.get('/recent', authenticate, requirePermission('catalog:read'), validate(recentSearchesSchema), (req, res, next) => catalogSearchController.recent(req, res, next));

export default router;
