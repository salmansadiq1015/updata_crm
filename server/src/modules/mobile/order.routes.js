import { Router } from 'express';
import multer from 'multer';
import orderController from './order.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import config from '../../config/index.js';
import {
  listOrdersSchema,
  orderExportQuerySchema,
  orderIdParamSchema,
  orderImportSchema,
  updateStatusSchema,
} from './order.validation.js';

const router = Router();

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Math.min(config.storage.maxFileSize, 2 * 1024 * 1024) },
  fileFilter(_req, file, cb) {
    const name = `${file.originalname || ''}`.toLowerCase();
    const mime = `${file.mimetype || ''}`.toLowerCase();
    const allowed = name.endsWith('.csv') || mime.includes('csv') || mime === 'text/plain' || mime === 'application/vnd.ms-excel';
    cb(allowed ? null : new Error('Only CSV order import files are supported.'), allowed);
  },
});

router.post(
  '/',
  authenticate,
  requirePermission('mobile:write'),
  (req, res, next) => orderController.createOrder(req, res, next),
);

router.get(
  '/',
  authenticate,
  requirePermission('mobile:read'),
  validate(listOrdersSchema),
  (req, res, next) => orderController.listOrders(req, res, next),
);

router.get(
  '/export',
  authenticate,
  requirePermission('mobile:read'),
  validate(orderExportQuerySchema),
  (req, res, next) => orderController.exportCsv(req, res, next),
);

router.get(
  '/import/template',
  authenticate,
  requirePermission('mobile:read'),
  (req, res, next) => orderController.importTemplate(req, res, next),
);

router.post(
  '/import',
  authenticate,
  requirePermission('mobile:write'),
  importUpload.single('file'),
  validate(orderImportSchema),
  (req, res, next) => orderController.importCsv(req, res, next),
);

router.get(
  '/:id',
  authenticate,
  requirePermission('mobile:read'),
  validate(orderIdParamSchema),
  (req, res, next) => orderController.getOrderDetail(req, res, next),
);

router.put(
  '/:id',
  authenticate,
  requirePermission('mobile:write'),
  validate(orderIdParamSchema),
  (req, res, next) => orderController.updateOrder(req, res, next),
);

router.delete(
  '/:id',
  authenticate,
  requirePermission('mobile:write'),
  validate(orderIdParamSchema),
  (req, res, next) => orderController.deleteOrder(req, res, next),
);

router.post(
  '/bulk-delete',
  authenticate,
  requirePermission('mobile:write'),
  (req, res, next) => orderController.bulkDeleteOrders(req, res, next),
);

router.put(
  '/:id/status',
  authenticate,
  requirePermission('mobile:write'),
  validate(updateStatusSchema),
  (req, res, next) => orderController.updateStatus(req, res, next),
);

router.get(
  '/:id/history',
  authenticate,
  requirePermission('mobile:read'),
  validate(orderIdParamSchema),
  (req, res, next) => orderController.getOrderHistory(req, res, next),
);

export default router;
