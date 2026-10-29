import { Router } from 'express';
import controller from './leadScoring.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import {
  updateScoringConfig, previewScoringConfig, leadScoreParam, scoringVersions,
} from './leadScoring.validation.js';

/**
 * Per-lead score — mounted at /api/v1/crm/leads/:leadId/score (mergeParams).
 *   GET  /            evidence-backed explanation (fresh compute + stored copy)
 *   POST /recalculate recompute and persist now
 */
export const leadScoreRouter = Router({ mergeParams: true });
leadScoreRouter.get('/', authenticate, requirePermission('lead:read'), validate(leadScoreParam), (req, res, next) => controller.explain(req, res, next));
leadScoreRouter.post('/recalculate', authenticate, requirePermission('lead:write'), validate(leadScoreParam), (req, res, next) => controller.recalculate(req, res, next));

/**
 * Scoring configuration — mounted at /api/v1/crm/lead-scoring.
 * Everything here is admin-only ('lead:scoring-admin').
 */
const router = Router();
router.get('/config', authenticate, requirePermission('lead:scoring-admin'), (req, res, next) => controller.getConfig(req, res, next));
router.put('/config', authenticate, requirePermission('lead:scoring-admin'), validate(updateScoringConfig), (req, res, next) => controller.updateConfig(req, res, next));
router.get('/versions', authenticate, requirePermission('lead:scoring-admin'), validate(scoringVersions), (req, res, next) => controller.versions(req, res, next));
router.post('/preview', authenticate, requirePermission('lead:scoring-admin'), validate(previewScoringConfig), (req, res, next) => controller.preview(req, res, next));
router.post('/recompute', authenticate, requirePermission('lead:scoring-admin'), (req, res, next) => controller.recompute(req, res, next));

export default router;
