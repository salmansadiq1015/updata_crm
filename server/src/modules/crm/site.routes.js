import { Router } from 'express';
import multer from 'multer';
import siteController from './site.controller.js';
import noteController from './note.controller.js';
import imageController from './image.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createSiteSchema, updateSiteSchema, siteIdParamSchema,
  customerIdParamSchema, listSitesSchema, siteActivitySchema, siteActivityExportSchema,
} from './site.validation.js';
import { createNoteSchema } from './note.validation.js';
import { createImageSchema } from './image.validation.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Middleware to set entityType for polymorphic note/image controllers
const setSiteEntity = (req, res, next) => { req.entityType = 'site'; next(); };

// Standalone list (all sites across customers, cursor-paginated)
router.get('/', authenticate, requirePermission('crm:read'), validate(listSitesSchema), (req, res, next) => siteController.list(req, res, next));

// Standard CRUD
router.get('/:id', authenticate, requirePermission('crm:read'), validate(siteIdParamSchema), (req, res, next) => siteController.getById(req, res, next));
router.patch('/:id', authenticate, requirePermission('crm:write'), validate(updateSiteSchema), (req, res, next) => siteController.update(req, res, next));
router.post('/:id/deactivate', authenticate, requirePermission('crm:delete'), validate(siteIdParamSchema), (req, res, next) => siteController.deactivate(req, res, next));
router.get('/:id/activity/export', authenticate, requirePermission('crm:read'), validate(siteActivityExportSchema), (req, res, next) => siteController.exportActivity(req, res, next));
router.get('/:id/activity', authenticate, requirePermission('crm:read'), validate(siteActivitySchema), (req, res, next) => siteController.getActivity(req, res, next));

// Notes sub-routes
router.get('/:id/notes', authenticate, requirePermission('crm:read'), setSiteEntity, (req, res, next) => noteController.listByEntity(req, res, next));
router.post('/:id/notes', authenticate, requirePermission('crm:write'), setSiteEntity, validate(createNoteSchema), (req, res, next) => noteController.create(req, res, next));

// Images sub-routes
router.get('/:id/images', authenticate, requirePermission('crm:read'), setSiteEntity, (req, res, next) => imageController.listByEntity(req, res, next));
router.post('/:id/images', authenticate, requirePermission('crm:write'), setSiteEntity, upload.single('image'), validate(createImageSchema), (req, res, next) => imageController.create(req, res, next));

// --- Nested customer sites router ---
const customerSitesRouter = Router({ mergeParams: true });

customerSitesRouter.get('/', authenticate, requirePermission('crm:read'), validate(customerIdParamSchema), (req, res, next) => siteController.listByCustomer(req, res, next));
customerSitesRouter.post('/', authenticate, requirePermission('crm:write'), validate({ params: customerIdParamSchema.params, body: createSiteSchema.body }), (req, res, next) => siteController.create(req, res, next));

export { customerSitesRouter };
export default router;
