import { Router } from 'express';
import controller from './governance.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { ipKeyGenerator } from 'express-rate-limit';
import { createLimiter } from '../../shared/middleware/rateLimiter.js';
import * as schemas from './governance.validation.js';

/**
 * Governance routes — mounted at /api/v1/governance (app.js).
 * authenticate → requirePermission → validate → controller.
 */
const router = Router();

// Reveal-for-action is the one way to read raw PII while masking is on: bounded per user.
const revealLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many contact reveals, please wait a minute',
  keyGenerator: (req) => (req.user?._id ? `pii-reveal:user:${req.user._id}` : `pii-reveal:ip:${ipKeyGenerator(req.ip || "")}`),
});

router.get('/settings', authenticate, (req, res, next) => controller.settings(req, res, next));

// Teams (membership administration). PATCH also admits a team's own manager (membership only).
router.get('/teams', authenticate, requirePermission('team:read'), validate(schemas.listTeams), (req, res, next) => controller.listTeams(req, res, next));
router.post('/teams', authenticate, requirePermission('team:manage'), validate(schemas.createTeam), (req, res, next) => controller.createTeam(req, res, next));
router.get('/teams/:id', authenticate, requirePermission('team:read'), validate(schemas.teamId), (req, res, next) => controller.getTeam(req, res, next));
router.patch('/teams/:id', authenticate, validate(schemas.updateTeam), (req, res, next) => controller.updateTeam(req, res, next));
router.delete('/teams/:id', authenticate, requirePermission('team:manage'), validate(schemas.teamId), (req, res, next) => controller.deleteTeam(req, res, next));

// Break-glass: state a reason before opening a lead you do not own (team mode).
router.post('/access-grants', authenticate, requirePermission('lead:read'), validate(schemas.createGrant), (req, res, next) => controller.createGrant(req, res, next));

// Audited reveal of one lead's contact values for a declared purpose.
router.post('/leads/:leadId/reveal', authenticate, requirePermission('lead:read'), revealLimiter, validate(schemas.revealContact), (req, res, next) => controller.reveal(req, res, next));

// Access log (admin screen) and per-lead "who accessed".
router.get('/access-log', authenticate, requirePermission('audit:read'), validate(schemas.accessLog), (req, res, next) => controller.accessLog(req, res, next));
router.get('/leads/:leadId/access-log', authenticate, requirePermission('audit:read'), validate(schemas.leadAccessLog), (req, res, next) => controller.leadAccessLog(req, res, next));

export default router;
