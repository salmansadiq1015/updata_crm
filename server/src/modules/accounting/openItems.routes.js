import { Router } from 'express';
import openItemsController from './openItems.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listOpenItemsSchema, agingSchema, statementSchema, netPositionSchema,
} from './openItems.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('accounting:openitems:read'), validate(listOpenItemsSchema), (req, res, next) => openItemsController.getOpenItems(req, res, next));
router.get('/aging', authenticate, requirePermission('accounting:openitems:read'), validate(agingSchema), (req, res, next) => openItemsController.getAging(req, res, next));
router.post('/statement/:entityId', authenticate, requirePermission('accounting:openitems:read'), validate(statementSchema), (req, res, next) => openItemsController.generateStatement(req, res, next));
router.post('/net/:entityId', authenticate, requirePermission('accounting:openitems:read'), validate(netPositionSchema), (req, res, next) => openItemsController.getNetPosition(req, res, next));

export default router;
