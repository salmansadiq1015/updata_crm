import { Router } from 'express';
import controller from './leadMerge.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  listDuplicateGroups, candidateIdParam, dismissCandidate, mergePreview, createMerge, mergeIdParam, listMerges,
} from './leadMerge.validation.js';

/**
 * Duplicate review queue — mounted at /api/v1/crm/lead-duplicates.
 * Reading the queue needs lead:read; deciding (dismiss/scan) needs lead:merge.
 */
export const leadDuplicateRouter = Router();
leadDuplicateRouter.get('/', authenticate, requirePermission('lead:read'), validate(listDuplicateGroups), (req, res, next) => controller.listGroups(req, res, next));
leadDuplicateRouter.post('/scan', authenticate, requirePermission('lead:merge'), (req, res, next) => controller.scan(req, res, next));
leadDuplicateRouter.post('/:id/dismiss', authenticate, requirePermission('lead:merge'), validate(dismissCandidate), (req, res, next) => controller.dismiss(req, res, next));
leadDuplicateRouter.post('/:id/reopen', authenticate, requirePermission('lead:merge'), validate(candidateIdParam), (req, res, next) => controller.reopen(req, res, next));

/**
 * Lead merges — mounted at /api/v1/crm/lead-merges. Named routes before /:id.
 */
const router = Router();
router.get('/preview', authenticate, requirePermission('lead:merge'), validate(mergePreview), (req, res, next) => controller.preview(req, res, next));
router.get('/', authenticate, requirePermission('lead:read'), validate(listMerges), (req, res, next) => controller.list(req, res, next));
router.post('/', authenticate, requirePermission('lead:merge'), validate(createMerge), (req, res, next) => controller.merge(req, res, next));
router.get('/:id', authenticate, requirePermission('lead:read'), validate(mergeIdParam), (req, res, next) => controller.getById(req, res, next));
router.post('/:id/resume', authenticate, requirePermission('lead:merge'), validate(mergeIdParam), (req, res, next) => controller.resume(req, res, next));
router.post('/:id/undo', authenticate, requirePermission('lead:merge'), validate(mergeIdParam), (req, res, next) => controller.undo(req, res, next));

export default router;
