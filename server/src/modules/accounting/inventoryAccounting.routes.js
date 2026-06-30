import { Router } from 'express';
import inventoryAccountingController from './inventoryAccounting.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  inventoryEntriesSchema,
  inventoryMovementsSchema,
  inventoryValuationSchema,
  postInventoryMovementSchema,
  postInventoryPeriodSchema,
} from './inventoryAccounting.validation.js';

const router = Router();

router.get('/valuation', authenticate, requirePermission('accounting:read'), validate(inventoryValuationSchema), (req, res, next) => inventoryAccountingController.valuation(req, res, next));
router.get('/movements', authenticate, requirePermission('accounting:read'), validate(inventoryMovementsSchema), (req, res, next) => inventoryAccountingController.movements(req, res, next));
router.get('/entries', authenticate, requirePermission('accounting:read'), validate(inventoryEntriesSchema), (req, res, next) => inventoryAccountingController.entries(req, res, next));
router.post('/movements/:movementId/post', authenticate, requirePermission('accounting:admin'), validate(postInventoryMovementSchema), (req, res, next) => inventoryAccountingController.postMovement(req, res, next));
router.post('/post-period', authenticate, requirePermission('accounting:admin'), validate(postInventoryPeriodSchema), (req, res, next) => inventoryAccountingController.postPeriod(req, res, next));

export default router;
