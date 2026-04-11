import { Router } from 'express';
import pickerController from './picker.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  pickerArticlesSchema,
  pickerTextBlocksSchema,
  barcodeSchema,
} from './picker.validation.js';

const router = Router();

router.get('/articles', authenticate, requirePermission('catalog:read'), validate(pickerArticlesSchema), (req, res, next) => pickerController.searchArticles(req, res, next));
router.get('/text-blocks', authenticate, requirePermission('catalog:read'), validate(pickerTextBlocksSchema), (req, res, next) => pickerController.searchTextBlocks(req, res, next));
router.post('/barcode', authenticate, requirePermission('catalog:read'), validate(barcodeSchema), (req, res, next) => pickerController.lookupBarcode(req, res, next));

export default router;
