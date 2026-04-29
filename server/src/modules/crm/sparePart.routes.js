import { Router } from 'express';
import sparePartController from './sparePart.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createSparePartSchema,
  updateSparePartSchema,
  sparePartIdParamSchema,
  deleteSparePartSchema,
  listSparePartsSchema,
  searchSparePartsSchema,
  exportSparePartsSchema,
  linkSparePartSchema,
  unlinkSparePartSchema,
} from './sparePart.validation.js';

const router = Router();

// List (cursor-paginated)
router.get('/', authenticate, requirePermission('crm:read'), validate(listSparePartsSchema), (req, res, next) => sparePartController.list(req, res, next));

// Create
router.post('/', authenticate, requirePermission('crm:write'), validate(createSparePartSchema), (req, res, next) => sparePartController.create(req, res, next));

// Text search — BEFORE /:id
router.get('/search', authenticate, requirePermission('crm:read'), validate(searchSparePartsSchema), (req, res, next) => sparePartController.search(req, res, next));

// CSV export — BEFORE /:id
router.get('/export', authenticate, requirePermission('crm:read'), validate(exportSparePartsSchema), (req, res, next) => sparePartController.exportCsv(req, res, next));

// Get by ID
router.get('/:id', authenticate, requirePermission('crm:read'), validate(sparePartIdParamSchema), (req, res, next) => sparePartController.getById(req, res, next));

// Update
router.patch('/:id', authenticate, requirePermission('crm:write'), validate(updateSparePartSchema), (req, res, next) => sparePartController.update(req, res, next));

// Delete (soft)
router.delete('/:id', authenticate, requirePermission('crm:delete'), validate(deleteSparePartSchema), (req, res, next) => sparePartController.delete(req, res, next));

// --- Installation spare parts sub-router (mounted under /installations/:id) ---
const installationSparePartsRouter = Router({ mergeParams: true });

installationSparePartsRouter.get('/', authenticate, requirePermission('crm:read'), (req, res, next) => sparePartController.getByInstallation(req, res, next));
installationSparePartsRouter.post('/', authenticate, requirePermission('crm:write'), validate(linkSparePartSchema), (req, res, next) => sparePartController.linkToInstallation(req, res, next));
installationSparePartsRouter.delete('/:sparePartId', authenticate, requirePermission('crm:delete'), validate(unlinkSparePartSchema), (req, res, next) => sparePartController.unlinkFromInstallation(req, res, next));

export { installationSparePartsRouter };
export default router;
