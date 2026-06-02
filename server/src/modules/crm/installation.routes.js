import { Router } from 'express';
import multer from 'multer';
import installationController from './installation.controller.js';
import noteController from './note.controller.js';
import imageController from './image.controller.js';
import maintenanceController from './maintenance.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createInstallationSchema, updateInstallationSchema, decommissionSchema,
  installationIdParamSchema, siteIdParamSchema, listInstallationsSchema,
  installationActivitySchema, installationActivityExportSchema,
} from './installation.validation.js';
import { createNoteSchema } from './note.validation.js';
import { createImageSchema } from './image.validation.js';
import { createMaintenanceSchema } from './maintenance.validation.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Middleware to set entityType for polymorphic note/image controllers
const setInstallationEntity = (req, res, next) => { req.entityType = 'installation'; next(); };

// Standalone list (all installations across sites, cursor-paginated)
router.get('/', authenticate, requirePermission('crm:read'), validate(listInstallationsSchema), (req, res, next) => installationController.list(req, res, next));

// Standard CRUD
router.get('/:id', authenticate, requirePermission('crm:read'), validate(installationIdParamSchema), (req, res, next) => installationController.getById(req, res, next));
router.patch('/:id', authenticate, requirePermission('crm:write'), validate(updateInstallationSchema), (req, res, next) => installationController.update(req, res, next));
router.post('/:id/decommission', authenticate, requirePermission('crm:delete'), validate(decommissionSchema), (req, res, next) => installationController.decommission(req, res, next));
router.get('/:id/activity/export', authenticate, requirePermission('crm:read'), validate(installationActivityExportSchema), (req, res, next) => installationController.exportActivity(req, res, next));
router.get('/:id/activity', authenticate, requirePermission('crm:read'), validate(installationActivitySchema), (req, res, next) => installationController.getActivity(req, res, next));

// Notes sub-routes
router.get('/:id/notes', authenticate, requirePermission('crm:read'), setInstallationEntity, (req, res, next) => noteController.listByEntity(req, res, next));
router.post('/:id/notes', authenticate, requirePermission('crm:write'), setInstallationEntity, validate(createNoteSchema), (req, res, next) => noteController.create(req, res, next));

// Images sub-routes
router.get('/:id/images', authenticate, requirePermission('crm:read'), setInstallationEntity, (req, res, next) => imageController.listByEntity(req, res, next));
router.post('/:id/images', authenticate, requirePermission('crm:write'), setInstallationEntity, upload.single('image'), validate(createImageSchema), (req, res, next) => imageController.create(req, res, next));

// Maintenance sub-routes
router.get('/:id/maintenance', authenticate, requirePermission('crm:read'), (req, res, next) => maintenanceController.listByInstallation(req, res, next));
router.post('/:id/maintenance', authenticate, requirePermission('crm:write'), validate(createMaintenanceSchema), (req, res, next) => maintenanceController.createForInstallation(req, res, next));

// --- Nested site installations router ---
const siteInstallationsRouter = Router({ mergeParams: true });

siteInstallationsRouter.get('/', authenticate, requirePermission('crm:read'), validate(siteIdParamSchema), (req, res, next) => installationController.listBySite(req, res, next));
siteInstallationsRouter.post('/', authenticate, requirePermission('crm:write'), validate({ params: siteIdParamSchema.params, body: createInstallationSchema.body }), (req, res, next) => installationController.create(req, res, next));

export { siteInstallationsRouter };
export default router;
