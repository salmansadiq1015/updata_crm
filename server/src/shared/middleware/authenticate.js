import { verifyToken } from '../utils/crypto.js';
import User from '../../modules/auth/user.model.js';
import Permission from '../../modules/auth/permission.model.js';
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

/**
 * Permission implications — a coarse permission grants a set of finer-grained
 * permissions. Purely additive: it can only widen access, never restrict it, so
 * existing roles keep working unchanged. This lets routes express the granular
 * permission vocabulary from the requirements (e.g. `project:create`) while roles
 * seeded with the coarse `projects:write` continue to satisfy them.
 */
export const PERMISSION_IMPLICATIONS = Object.freeze({
  'ai-calling:admin': ['ai-calling:read', 'ai-calling:write'],
  'projects:read': [
    'project:read',
    'project:documents:read',
    'project:prep-actions:read',
    'project:schedule:read',
    'project:status:read',
    'chat:read',
  ],
  'projects:write': [
    'project:create',
    'project:edit',
    'project:status:update',
    'project:prep-actions:manage',
    'project:schedule:manage',
    'project:documents:create',
    'project:documents:write',
    'chat:write',
  ],
  'projects:admin': [
    'project:status:override',
  ],
  'projects:delete': [
    'project:delete',
    'project:documents:delete',
  ],
  'project:documents:read': [
    'documents:read',
  ],
  'project:documents:write': [
    'documents:write',
    'files:upload',
  ],
  'project:documents:delete': [
    'documents:delete',
  ],
  'templates:read': [
    'documents:read',
  ],
  'templates:write': [
    'documents:write',
    'files:upload',
  ],
  'templates:delete': [
    'documents:delete',
  ],
  'quotations:read': [
    'documents:read',
  ],
  'invoicing:read': [
    'documents:read',
  ],
  'accounting:documents:read': [
    'documents:read',
  ],
  'accounting:documents:manage': [
    'documents:write',
    'files:upload',
  ],
  'crm:write': [
    'documents:write',
    'files:upload',
    // AI voice calling: anyone who can write CRM data can build/run call campaigns.
    'ai-calling:read',
    'ai-calling:write',
  ],
  // Reading leads/CRM data is enough to view call campaigns, history and analytics.
  'crm:read': [
    'ai-calling:read',
  ],
  'lead:read': [
    'ai-calling:read',
  ],
  // Full CRM administration covers the sensitive call operations (reconcile).
  'crm:admin': [
    'ai-calling:read',
    'ai-calling:write',
    'ai-calling:admin',
    'analytics:attribution:read',
    'lead:assign-policy',
  ],
  'field-service:read': [
    'mobile:read',
    'chat:read',
    'field-ticket:read',
    'field-ticket:comment',
  ],
  'field-service:write': [
    'mobile:write',
    'chat:write',
    'files:upload',
    'field-ticket:write',
    'field-ticket:comment',
  ],
  'field-service:admin': [
    'field-ticket:read',
    'field-ticket:write',
    'field-ticket:assign',
    'field-ticket:comment',
    'field-ticket:admin',
  ],
  'field-ticket:write': [
    'field-ticket:read',
    'field-ticket:comment',
    'files:upload',
  ],
  'field-ticket:assign': [
    'field-ticket:read',
    'field-ticket:write',
  ],
  'field-ticket:admin': [
    'field-ticket:read',
    'field-ticket:write',
    'field-ticket:assign',
    'field-ticket:comment',
  ],
  // Platform governance: user administrators manage teams.
  'users:admin': [
    'team:read',
    'team:manage',
  ],
  'team:manage': [
    'team:read',
  ],
  'chat:write': [
    'chat:read',
  ],
  'chat:admin': [
    'chat:read',
    'chat:write',
  ],
  'time-tracking:write': [
    'time-tracking:read',
  ],
  'time-tracking:admin': [
    'time-tracking:read',
    'time-tracking:write',
    'time:release:override',
  ],
  'files:upload': [
    'files:view',
  ],
  'files:list': [
    'files:view',
  ],
  'catalog:write': [
    'catalog:manage',
  ],
  'catalog:admin': [
    'catalog:manage',
    'catalog:igh:manage',
    'catalog:pricing',
  ],
  'catalog:price': [
    'catalog:pricing',
  ],
  'catalog:pricing': [
    'catalog:price',
  ],
  'catalog:manage': [
    'catalog:write',
  ],
});

/**
 * True when the user's permission set satisfies `required`, either directly or
 * through an implication (coarse → granular).
 */
export const satisfiesPermission = (userPermissions, required) => {
  if (userPermissions.includes(required)) return true;
  for (const held of userPermissions) {
    const implied = PERMISSION_IMPLICATIONS[held];
    if (implied && implied.includes(required)) return true;
  }
  return false;
};

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

      if (!satisfiesPermission(permissions, permission)) {
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
      if (user.role?.name === 'Admin') {
        const permissions = await Permission.find().lean();
        return permissions.map((p) => `${p.module}:${p.action}`);
      }
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
