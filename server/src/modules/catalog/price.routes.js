import { Router } from 'express';
import priceController from './price.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  updatePriceSchema,
  previewPriceSchema,
  priceHistorySchema,
  schedulePriceSchema,
  rollbackSchema,
  listBatchesSchema,
} from './price.validation.js';

const router = Router();

router.get('/batches', authenticate, requirePermission('catalog:price'), validate(listBatchesSchema), (req, res, next) => priceController.listBatches(req, res, next));
router.post('/preview', authenticate, requirePermission('catalog:price'), validate(previewPriceSchema), (req, res, next) => priceController.preview(req, res, next));
router.post('/update', authenticate, requirePermission('catalog:price'), validate(updatePriceSchema), (req, res, next) => priceController.updatePrice(req, res, next));
router.get('/history/:articleId', authenticate, requirePermission('catalog:read'), validate(priceHistorySchema), (req, res, next) => priceController.getHistory(req, res, next));
router.post('/schedule', authenticate, requirePermission('catalog:price'), validate(schedulePriceSchema), (req, res, next) => priceController.scheduleUpdate(req, res, next));
router.post('/rollback/:batchId', authenticate, requirePermission('catalog:admin'), validate(rollbackSchema), (req, res, next) => priceController.rollback(req, res, next));

export default router;
