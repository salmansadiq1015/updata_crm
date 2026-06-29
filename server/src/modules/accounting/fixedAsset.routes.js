import { Router } from 'express';
import fixedAssetController from './fixedAsset.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  activateFixedAssetSchema,
  createFixedAssetSchema,
  depreciateFixedAssetSchema,
  disposeFixedAssetSchema,
  fixedAssetIdSchema,
  fixedAssetSummarySchema,
  listFixedAssetsSchema,
  updateFixedAssetSchema,
} from './fixedAsset.validation.js';

const router = Router();

router.get('/', authenticate, requirePermission('accounting:read'), validate(listFixedAssetsSchema), (req, res, next) => fixedAssetController.list(req, res, next));
router.get('/summary', authenticate, requirePermission('accounting:read'), validate(fixedAssetSummarySchema), (req, res, next) => fixedAssetController.summary(req, res, next));
router.post('/', authenticate, requirePermission('accounting:admin'), validate(createFixedAssetSchema), (req, res, next) => fixedAssetController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('accounting:read'), validate(fixedAssetIdSchema), (req, res, next) => fixedAssetController.getById(req, res, next));
router.put('/:id', authenticate, requirePermission('accounting:admin'), validate(updateFixedAssetSchema), (req, res, next) => fixedAssetController.update(req, res, next));
router.post('/:id/activate', authenticate, requirePermission('accounting:admin'), validate(activateFixedAssetSchema), (req, res, next) => fixedAssetController.activate(req, res, next));
router.post('/:id/depreciate', authenticate, requirePermission('accounting:admin'), validate(depreciateFixedAssetSchema), (req, res, next) => fixedAssetController.depreciate(req, res, next));
router.post('/:id/dispose', authenticate, requirePermission('accounting:admin'), validate(disposeFixedAssetSchema), (req, res, next) => fixedAssetController.dispose(req, res, next));

export default router;
