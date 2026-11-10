import { Router } from 'express';
import { ipKeyGenerator } from 'express-rate-limit';
import extensionController from './extension.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { createLimiter } from '../../shared/middleware/rateLimiter.js';
import config from '../../config/index.js';
import { redeemPairing, heartbeat, disconnect, listImports } from './extension.validation.js';

/**
 * Chrome Extension connect routes — mounted at /api/v1/extension by app.js.
 *
 * Only `/pairing/redeem` is public: it is authorised solely by a single-use,
 * short-lived pairing grant that itself required an authenticated CRM session
 * to mint. Everything else is authenticate() + the existing `lead:read`
 * permission (same gate as viewing the Leads page). No new permission is
 * introduced; RBAC and lead ownership are reused unchanged.
 */
const router = Router();

// Dedicated namespaces so these counters never share with login / global.
const pairingLimiter = createLimiter({
  windowMs: config.rateLimit.windowMs,
  keyGenerator: (req) =>
    (req.user?._id ? `extpair:user:${req.user._id}` : `extpair:ip:${ipKeyGenerator(req.ip || "")}`),
  max: config.isDevelopment ? 10_000 : 20,
  message: 'Too many extension pairing requests, please try again later',
});

// Redeem is unauthenticated (the extension has no token yet): throttle hard by
// IP so a leaked/guessed grant cannot be brute-forced.
const redeemLimiter = createLimiter({
  windowMs: config.rateLimit.windowMs,
  keyGenerator: (req) => `extredeem:ip:${ipKeyGenerator(req.ip || "")}`,
  max: config.isDevelopment ? 10_000 : 30,
  message: 'Too many extension connect attempts, please try again later',
});

// Mint a one-time pairing grant for the authenticated user.
router.post(
  '/pairing',
  authenticate,
  requirePermission('lead:read'),
  pairingLimiter,
  (req, res, next) => extensionController.createPairing(req, res, next),
);

// Redeem a pairing grant → extension-scoped token pair. PUBLIC by design.
router.post(
  '/pairing/redeem',
  redeemLimiter,
  validate(redeemPairing),
  (req, res, next) => extensionController.redeemPairing(req, res, next),
);

// Connection status for the Lead-page card.
router.get(
  '/status',
  authenticate,
  requirePermission('lead:read'),
  (req, res, next) => extensionController.getStatus(req, res, next),
);

// Recent extension import runs (for the Lead page's live/historical view).
router.get(
  '/imports',
  authenticate,
  requirePermission('lead:read'),
  validate(listImports),
  (req, res, next) => extensionController.listImports(req, res, next),
);

// Heartbeat from the extension's own authenticated session (no extra perm —
// it can only touch the connection backing its own session id).
router.post(
  '/heartbeat',
  authenticate,
  validate(heartbeat),
  (req, res, next) => extensionController.heartbeat(req, res, next),
);

// Disconnect one or all of the user's linked extensions.
router.post(
  '/disconnect',
  authenticate,
  requirePermission('lead:read'),
  validate(disconnect),
  (req, res, next) => extensionController.disconnect(req, res, next),
);

export default router;
