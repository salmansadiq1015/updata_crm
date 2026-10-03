import { Router } from 'express';
import Joi from 'joi';
import discoveryController from './discovery.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { createLimiter } from '../../shared/middleware/rateLimiter.js';
import { objectId } from '../../shared/validation/commonSchemas.js';
import {
  createSession,
  listSessions,
  listResults,
  sessionIdParam,
} from './discovery.validation.js';
import {
  geocode as geocodeSchema,
  autocomplete as autocompleteSchema,
} from './discovery.location.validation.js';

const router = Router();

// Both ids validated in a single pass — chaining validate(sessionIdParam) with
// validate(resultIdParam) would strip each other's param (stripUnknown: true).
const resultDetailParams = {
  params: Joi.object({ id: objectId.required(), resultId: objectId.required() }),
};

// Discovery runs are expensive (Google Places quota). Rate-limit creation
// per-user — `authenticate` runs first so the limiter keys on req.user._id.
const createSessionLimiter = createLimiter({
  max: 20,
  message: 'Too many discovery requests, please slow down',
});

// ── Static / collection routes BEFORE parameterized ones ──

/**
 * @swagger
 * /business-discovery/business-types:
 *   get:
 *     tags: [Business Discovery]
 *     summary: Business-type catalog for the picker (static, i18n)
 *     responses:
 *       200:
 *         description: Grouped business types
 */
router.get(
  '/business-types',
  authenticate,
  requirePermission('discovery:read'),
  (req, res, next) => discoveryController.getBusinessTypes(req, res, next),
);

/**
 * @swagger
 * /business-discovery/usage:
 *   get:
 *     tags: [Business Discovery]
 *     summary: Cumulative provider usage for the current user
 *     responses:
 *       200:
 *         description: Aggregated usage
 */
router.get(
  '/usage',
  authenticate,
  requirePermission('discovery:read'),
  (req, res, next) => discoveryController.getUsage(req, res, next),
);

// ── Location proxy (cached geocode / autocomplete) ──
router.post(
  '/location/geocode',
  authenticate,
  requirePermission('discovery:read'),
  validate(geocodeSchema),
  (req, res, next) => discoveryController.geocode(req, res, next),
);
router.post(
  '/location/autocomplete',
  authenticate,
  requirePermission('discovery:read'),
  validate(autocompleteSchema),
  (req, res, next) => discoveryController.autocomplete(req, res, next),
);

// ── Sessions ──

/**
 * @swagger
 * /business-discovery/sessions:
 *   post:
 *     tags: [Business Discovery]
 *     summary: Start an "Analyze Area" discovery run
 *     responses:
 *       202:
 *         description: Accepted — returns { sessionId }
 *   get:
 *     tags: [Business Discovery]
 *     summary: List the current user's discovery sessions
 *     responses:
 *       200:
 *         description: Paginated sessions
 */
router.post(
  '/sessions',
  authenticate,
  createSessionLimiter,
  requirePermission('discovery:create'),
  validate(createSession),
  (req, res, next) => discoveryController.createDiscovery(req, res, next),
);
router.get(
  '/sessions',
  authenticate,
  requirePermission('discovery:read'),
  validate(listSessions),
  (req, res, next) => discoveryController.listSessions(req, res, next),
);

// Named sub-routes BEFORE the bare "/sessions/:id" param route.
router.post(
  '/sessions/:id/cancel',
  authenticate,
  requirePermission('discovery:create'),
  validate(sessionIdParam),
  (req, res, next) => discoveryController.cancelSession(req, res, next),
);
router.get(
  '/sessions/:id/results/:resultId',
  authenticate,
  requirePermission('discovery:read'),
  validate(resultDetailParams),
  (req, res, next) => discoveryController.getResult(req, res, next),
);
router.get(
  '/sessions/:id/results',
  authenticate,
  requirePermission('discovery:read'),
  validate(sessionIdParam),
  validate(listResults),
  (req, res, next) => discoveryController.listResults(req, res, next),
);

/**
 * @swagger
 * /business-discovery/sessions/{id}:
 *   get:
 *     tags: [Business Discovery]
 *     summary: Get a discovery session (progress / counts)
 *   delete:
 *     tags: [Business Discovery]
 *     summary: Soft-delete a discovery session
 */
router.get(
  '/sessions/:id',
  authenticate,
  requirePermission('discovery:read'),
  validate(sessionIdParam),
  (req, res, next) => discoveryController.getSession(req, res, next),
);
router.delete(
  '/sessions/:id',
  authenticate,
  requirePermission('discovery:delete'),
  validate(sessionIdParam),
  (req, res, next) => discoveryController.deleteSession(req, res, next),
);

export default router;
