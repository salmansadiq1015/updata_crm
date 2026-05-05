import { verifyToken } from '../utils/crypto.js';
import User from '../../modules/auth/user.model.js';
import sessionService from '../../modules/auth/session.service.js';
import auditService from '../../modules/auth/audit.service.js';
import cacheManager from '../cache/CacheManager.js';
import logger from '../logger/index.js';

/**
 * Authentication & authorization middleware.
 *
 * Exports:
 *   authenticate       — Verify JWT + Redis session, attach user to req
 *   requirePermission   — Check user has specific 'module:action' permission
 *   authGuard           — Combined [authenticate, requirePermission] array
 */

// --- Authenticate: Verify JWT + Session and attach user to req ---

export const authenticate = async (req, res, next) => {
  try {
    // Extract token from Authorization header
    let token = null;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer ')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.fail({
        statusCode: 401,
        message: 'Access denied. No authentication token provided.',
        code: 'NO_TOKEN',
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.fail({
          statusCode: 401,
          message: 'Authentication token has expired. Please login again.',
          code: 'TOKEN_EXPIRED',
        });
      }
      return res.fail({
        statusCode: 401,
        message: 'Invalid authentication token.',
        code: 'INVALID_TOKEN',
      });
    }

    const userId = decoded.sub;
    const sessionId = decoded.sid;

    // Validate session in Redis
    if (sessionId) {
      const sessionActive = await sessionService.isSessionActive(userId, sessionId);
      if (!sessionActive) {
        return res.fail({
          statusCode: 401,
          message: 'Session has been revoked or expired. Please login again.',
          code: 'SESSION_REVOKED',
        });
      }
      // Fire-and-forget: update lastActivity
      sessionService.touchSession(userId, sessionId);
    }

    // Fetch user with populated role
    const user = await User.findById(userId)
      .select('+passwordChangedAt')
      .populate('role', 'name permissions isSystem');

    if (!user) {
      return res.fail({
        statusCode: 401,
        message: 'User belonging to this token no longer exists.',
        code: 'USER_NOT_FOUND',
      });
    }

    if (user.status !== 'active') {
      return res.fail({
        statusCode: 403,
        message: 'Your account has been deactivated. Contact an administrator.',
        code: 'ACCOUNT_DEACTIVATED',
      });
    }

    // Check if password was changed after token was issued
    if (user.changedPasswordAfter(decoded.iat)) {
      return res.fail({
        statusCode: 401,
        message: 'Password was recently changed. Please login again.',
        code: 'PASSWORD_CHANGED',
      });
    }

    // Attach user and session info to request
    req.user = user;
    req.sessionId = sessionId || null;
    next();
  } catch (error) {
    next(error);
  }
};

// --- RequirePermission: Module:action level access control ---

/**
 * Middleware factory for permission-based authorization.
 * Uses cached permission strings (module:action format).
 *
 * Usage: requirePermission('crm:write'), requirePermission('users:admin')
 *
 * @param {string} permission - Required permission string (e.g., 'crm:read')
 * @returns {Function} Express middleware
 */
export const requirePermission = (permission) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.fail({
        statusCode: 401,
        message: 'Authentication required.',
        code: 'NOT_AUTHENTICATED',
      });
    }

    try {
      // Load permissions from cache or DB
      const permissions = await _loadPermissions(req.user);

      // Admin role has all permissions
      if (req.user.role?.name === 'Admin') {
        return next();
      }

      if (!permissions.includes(permission)) {
        // Log permission denied
        auditService.logEvent({
          eventType: 'permission.denied',
          userId: req.user._id,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          result: 'failure',
          details: {
            requiredPermission: permission,
            path: req.originalUrl,
            method: req.method,
          },
        });

        return res.fail({
          statusCode: 403,
          message: `Insufficient permissions. Required: ${permission}`,
          code: 'INSUFFICIENT_PERMISSIONS',
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Combined guard: [authenticate, requirePermission].
 *
 * Usage: router.get('/path', ...authGuard('crm:read'), controller.method)
 *
 * @param {string} permission - Required permission string
 * @returns {Function[]} Array of middleware
 */
export const authGuard = (permission) => {
  return [authenticate, requirePermission(permission)];
};

// --- Legacy compatibility exports ---

/**
 * Role-name based authorization (kept for backwards compatibility).
 * Prefer requirePermission() for new code.
 */
export const authorize = (...roleNames) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.fail({
        statusCode: 401,
        message: 'Authentication required.',
        code: 'NOT_AUTHENTICATED',
      });
    }

    const userRoleName = req.user.role?.name;

    if (!userRoleName || !roleNames.includes(userRoleName)) {
      return res.fail({
        statusCode: 403,
        message: `Access denied. Required role: ${roleNames.join(' or ')}. Your role: ${userRoleName || 'none'}.`,
        code: 'INSUFFICIENT_PERMISSIONS',
      });
    }

    next();
  };
};

/**
 * Load permission strings for a user (exported for non-middleware use).
 * Returns array of 'module:action' strings, e.g. ['tasks:write', 'crm:read'].
 * Admin role yields every permission currently in the DB.
 */
export const loadUserPermissions = (user) => _loadPermissions(user);

// --- Internal helpers ---

const PERMISSION_CACHE_TTL = { l1Ttl: 60, l2Ttl: 300 };

/**
 * Load user's permission strings from cache or DB.
 * Returns array of 'module:action' strings.
 */
async function _loadPermissions(user) {
  const cacheKey = `auth:permissions:${user._id}`;

  return cacheManager.getOrSet(
    cacheKey,
    async () => {
      // Populate permissions on the role
      const populatedUser = await User.findById(user._id)
        .populate({
          path: 'role',
          populate: { path: 'permissions' },
        })
        .lean();

      if (!populatedUser?.role?.permissions) return [];

      return populatedUser.role.permissions.map(
        (p) => `${p.module}:${p.action}`,
      );
    },
    PERMISSION_CACHE_TTL,
  );
}
