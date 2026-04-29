import { Router } from 'express';
import projectController from './project.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  createProjectSchema, updateProjectSchema, listProjectsSchema,
  searchProjectsSchema, projectIdParamSchema, duplicateProjectSchema,
  bulkUpdateProjectsSchema, bulkDeleteProjectsSchema, exportProjectsSchema,
  createFromTemplateSchema,
} from './project.validation.js';

const router = Router();

// Named routes BEFORE /:id
router.get('/dashboard/summary', authenticate, requirePermission('projects:read'), (req, res, next) => projectController.dashboardSummary(req, res, next));
router.get('/dashboard/milestones', authenticate, requirePermission('projects:read'), (req, res, next) => projectController.dashboardMilestones(req, res, next));
router.get('/export', authenticate, requirePermission('projects:read'), validate(exportProjectsSchema), (req, res, next) => projectController.exportCsv(req, res, next));
router.post('/from-template', authenticate, requirePermission('projects:write'), validate(createFromTemplateSchema), (req, res, next) => projectController.createFromTemplate(req, res, next));
router.get('/search', authenticate, requirePermission('projects:read'), validate(searchProjectsSchema), (req, res, next) => projectController.search(req, res, next));
router.patch('/bulk-update', authenticate, requirePermission('projects:admin'), validate(bulkUpdateProjectsSchema), (req, res, next) => projectController.bulkUpdate(req, res, next));
router.post('/bulk-delete', authenticate, requirePermission('projects:admin'), validate(bulkDeleteProjectsSchema), (req, res, next) => projectController.bulkDeactivate(req, res, next));

// Standard CRUD
router.get('/', authenticate, requirePermission('projects:read'), validate(listProjectsSchema), (req, res, next) => projectController.list(req, res, next));
router.post('/', authenticate, requirePermission('projects:write'), validate(createProjectSchema), (req, res, next) => projectController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('projects:read'), validate(projectIdParamSchema), (req, res, next) => projectController.getById(req, res, next));
router.patch('/:id', authenticate, requirePermission('projects:write'), validate(updateProjectSchema), (req, res, next) => projectController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('projects:delete'), validate(projectIdParamSchema), (req, res, next) => projectController.delete(req, res, next));
router.post('/:id/duplicate', authenticate, requirePermission('projects:write'), validate(duplicateProjectSchema), (req, res, next) => projectController.duplicate(req, res, next));

export default router;
