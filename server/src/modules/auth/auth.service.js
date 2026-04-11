import crypto from 'crypto';
import userRepository from './user.repository.js';
import sessionService from './session.service.js';
import auditService from './audit.service.js';
import passwordHistoryRepository from './passwordHistory.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import queueManager from '../../shared/queue/QueueManager.js';
import { AuthenticationError, ValidationError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import {
  hashPassword,
  comparePassword,
  comparePasswordTimingSafe,
  generateTokenPair,
  verifyToken,
  generateResetToken,
  hashResetToken,
  generateActivationToken,
  DUMMY_HASH,
} from '../../shared/utils/crypto.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

/**
 * Auth service — handles login, token refresh, logout, password operations.
 */
class AuthService {
  /**
   * Authenticate user with email and password.
   */
  async login(email, password, meta = {}) {
    const normalizedEmail = email.toLowerCase().trim();

    // Check lockout via Redis counter
    const failedCount = await sessionService.getFailedLoginCount(normalizedEmail);
    const lockoutThreshold = config.auth?.lockoutThreshold || 5;

    if (failedCount >= lockoutThreshold) {
      auditService.logEvent({
        eventType: 'login.failed',
        email: normalizedEmail,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        result: 'failure',
        details: { reason: 'account_locked' },
      });

      throw new AuthenticationError(
        'Account temporarily locked due to too many failed attempts. Please try again later.',
        ERROR_CODES.ACCOUNT_LOCKED,
      );
    }

    // Fetch user with secret fields
    const user = await userRepository.findByEmail(normalizedEmail, { includeSecrets: true });

    // Timing-safe: always compare even if user not found
    const passwordValid = await comparePasswordTimingSafe(
      password,
      user?.passwordHash,
    );

    if (!user || !passwordValid) {
      // Increment failed counter
      const newCount = await sessionService.incrementFailedLogin(normalizedEmail);

      // Publish events
      eventBus.publish(EVENT_TYPES.AUTH_LOGIN_FAILED, {
        email: normalizedEmail,
        ipAddress: meta.ipAddress,
        failedAttempts: newCount,
      }, { source: 'auth:service' });

      // Check if this attempt triggers lockout
      if (newCount >= lockoutThreshold) {
        eventBus.publish(EVENT_TYPES.AUTH_ACCOUNT_LOCKED, {
          email: normalizedEmail,
          ipAddress: meta.ipAddress,
        }, { source: 'auth:service' });
      }

      auditService.logEvent({
        eventType: 'login.failed',
        userId: user?._id,
        email: normalizedEmail,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        result: 'failure',
        details: { reason: user ? 'invalid_password' : 'user_not_found', failedAttempts: newCount },
      });

      throw new AuthenticationError(
        'Invalid email or password.',
        ERROR_CODES.INVALID_CREDENTIALS,
      );
    }

    // Check account status
    if (user.status !== 'active') {
      auditService.logEvent({
        eventType: 'login.failed',
        userId: user._id,
        email: normalizedEmail,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        result: 'failure',
        details: { reason: `account_${user.status}` },
      });

      if (user.status === 'pending_activation') {
        throw new AuthenticationError(
          'Account not yet activated. Please check your email for the activation link.',
          ERROR_CODES.ACCOUNT_DEACTIVATED,
        );
      }

      throw new AuthenticationError(
        'Account has been deactivated. Contact an administrator.',
        ERROR_CODES.ACCOUNT_DEACTIVATED,
      );
    }

    // Success — clear failed counter
    await sessionService.clearFailedLogin(normalizedEmail);

    // Generate session
    const sessionId = crypto.randomUUID();
    const tokens = generateTokenPair(user, sessionId);

    // Hash refresh token for storage
    const refreshTokenHash = crypto
      .createHash('sha256')
      .update(tokens.refreshToken)
      .digest('hex');

    // Store session in Redis
    await sessionService.createSession(user._id, sessionId, {
      refreshTokenHash,
      deviceType: meta.deviceType || 'unknown',
      browser: meta.browser || 'unknown',
      os: meta.os || 'unknown',
      ipAddress: meta.ipAddress || 'unknown',
    });

    // Update last login
    await userRepository.updateById(user._id, { lastLoginAt: new Date() });

    // Publish success event
    eventBus.publish(EVENT_TYPES.AUTH_LOGIN_SUCCESS, {
      userId: user._id,
      email: normalizedEmail,
      sessionId,
      ipAddress: meta.ipAddress,
    }, { source: 'auth:service' });

    auditService.logEvent({
      eventType: 'login.success',
      userId: user._id,
      email: normalizedEmail,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      result: 'success',
      details: { sessionId, deviceType: meta.deviceType },
    });

    logger.info('User logged in', {
      module: 'auth',
      action: 'login',
      userId: user._id,
    });

    // Return sanitized user data
    const sanitizedUser = {
      _id: user._id,
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      fullName: `${user.firstName} ${user.lastName}`,
      phone: user.phone,
      language: user.language,
      avatarFileId: user.avatarFileId,
      role: user.role,
      status: user.status,
      lastLoginAt: new Date(),
    };

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 900, // 15 minutes in seconds
      tokenType: 'Bearer',
      user: sanitizedUser,
    };
  }

  /**
   * Refresh access token using refresh token.
   * Implements token rotation: old refresh token is invalidated.
   */
  async refresh(refreshToken) {
    // Verify JWT signature
    let decoded;
    try {
      decoded = verifyToken(refreshToken);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AuthenticationError(
          'Refresh token has expired. Please login again.',
          ERROR_CODES.TOKEN_EXPIRED,
        );
      }
      throw new AuthenticationError(
        'Invalid refresh token.',
        ERROR_CODES.INVALID_TOKEN,
      );
    }

    // Verify it's a refresh token
    if (decoded.type !== 'refresh') {
      throw new AuthenticationError(
        'Invalid token type.',
        ERROR_CODES.INVALID_TOKEN,
      );
    }

    const userId = decoded.sub;
    const sessionId = decoded.sid;

    // Hash the provided refresh token and compare with stored hash
    const providedHash = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    const session = await sessionService.getSession(userId, sessionId);
    if (!session) {
      throw new AuthenticationError(
        'Session not found or has been revoked. Please login again.',
        ERROR_CODES.SESSION_REVOKED,
      );
    }

    if (session.refreshTokenHash !== providedHash) {
      // Potential token reuse — revoke session for safety
      await sessionService.revokeSession(userId, sessionId);
      logger.warn('Refresh token hash mismatch — session revoked (potential replay)', {
        module: 'auth',
        action: 'refresh',
        userId,
        sessionId,
      });
      throw new AuthenticationError(
        'Invalid refresh token. Session has been revoked.',
        ERROR_CODES.INVALID_TOKEN,
      );
    }

    // Fetch fresh user data
    const user = await userRepository.findById(userId);
    if (!user || user.status !== 'active') {
      await sessionService.revokeSession(userId, sessionId);
      throw new AuthenticationError(
        'Account is no longer active.',
        ERROR_CODES.ACCOUNT_DEACTIVATED,
      );
    }

    // Generate new token pair (rotation)
    const newTokens = generateTokenPair(user, sessionId);

    // Update refresh token hash in Redis
    const newRefreshHash = crypto
      .createHash('sha256')
      .update(newTokens.refreshToken)
      .digest('hex');

    await sessionService.updateRefreshTokenHash(userId, sessionId, newRefreshHash);

    return {
      accessToken: newTokens.accessToken,
      refreshToken: newTokens.refreshToken,
      expiresIn: 900,
      tokenType: 'Bearer',
    };
  }

  /**
   * Logout — revoke the current session's refresh token.
   */
  async logout(userId, sessionId, meta = {}) {
    await sessionService.revokeSession(userId, sessionId);

    eventBus.publish(EVENT_TYPES.AUTH_LOGOUT, {
      userId,
      sessionId,
    }, { source: 'auth:service' });

    auditService.logEvent({
      eventType: 'logout',
      userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      result: 'success',
    });
  }

  /**
   * Request password reset — ALWAYS returns success (no email enumeration).
   */
  async requestPasswordReset(email, meta = {}) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await userRepository.findByEmail(normalizedEmail);

    if (!user || user.status === 'deactivated') {
      // Silently return — don't reveal whether email exists
      return;
    }

    const { resetToken, hashedToken, expires } = generateResetToken();

    // Store hashed token on user
    await userRepository.updateById(user._id, {
      resetTokenHash: hashedToken,
      resetTokenExpires: expires,
    });

    // Enqueue reset email
    const resetUrl = `${config.client.uri}/reset-password?token=${resetToken}`;
    try {
      await queueManager.addJob('auth-email', 'send-reset-email', {
        email: normalizedEmail,
        name: user.firstName,
        resetUrl,
      });
    } catch (err) {
      logger.error('Failed to enqueue password reset email', {
        module: 'auth',
        action: 'requestPasswordReset',
        error: { message: err.message },
      });
    }

    eventBus.publish(EVENT_TYPES.AUTH_PASSWORD_RESET_REQUESTED, {
      userId: user._id,
      email: normalizedEmail,
    }, { source: 'auth:service' });

    auditService.logEvent({
      eventType: 'password.reset_requested',
      userId: user._id,
      email: normalizedEmail,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      result: 'success',
    });
  }

  /**
   * Confirm password reset with token.
   */
  async confirmPasswordReset(token, newPassword, meta = {}) {
    const hashedToken = hashResetToken(token);

    // Find user with valid token
    const user = await userRepository.findByEmail(null, { includeSecrets: true });
    // We need to query by resetTokenHash directly
    const User = (await import('./user.model.js')).default;
    const userDoc = await User.findOne({
      resetTokenHash: hashedToken,
      resetTokenExpires: { $gt: new Date() },
    }).select('+passwordHash +resetTokenHash +resetTokenExpires');

    if (!userDoc) {
      throw new AuthenticationError(
        'Invalid or expired reset token.',
        ERROR_CODES.INVALID_RESET_TOKEN,
      );
    }

    // Validate password strength (service-level check for history)
    await this._validatePasswordHistory(userDoc._id, newPassword);

    // Hash new password
    const newHash = await hashPassword(newPassword);

    // Save old password to history
    if (userDoc.passwordHash) {
      await passwordHistoryRepository.create(userDoc._id, userDoc.passwordHash);
    }

    // Update user
    await userRepository.updateById(userDoc._id, {
      passwordHash: newHash,
      passwordChangedAt: new Date(),
      resetTokenHash: null,
      resetTokenExpires: null,
    });

    // Revoke all sessions
    await sessionService.revokeAllUserSessions(userDoc._id);
    await cacheManager.del(`auth:permissions:${userDoc._id}`);

    eventBus.publish(EVENT_TYPES.AUTH_PASSWORD_CHANGED, {
      userId: userDoc._id,
      method: 'reset',
    }, { source: 'auth:service' });

    auditService.logEvent({
      eventType: 'password.changed',
      userId: userDoc._id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      result: 'success',
      details: { method: 'reset' },
    });

    // Notify user
    try {
      await queueManager.addJob('auth-email', 'send-password-changed-email', {
        email: userDoc.email,
        name: userDoc.firstName,
      });
    } catch (err) {
      logger.warn('Failed to enqueue password changed email', {
        module: 'auth',
        error: { message: err.message },
      });
    }
  }

  /**
   * Change password (authenticated user).
   */
  async changePassword(userId, currentPassword, newPassword, sessionId, meta = {}) {
    const User = (await import('./user.model.js')).default;
    const user = await User.findById(userId).select('+passwordHash');

    if (!user) {
      throw new AuthenticationError('User not found.', ERROR_CODES.INVALID_CREDENTIALS);
    }

    // Verify current password
    const isValid = await comparePassword(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new AuthenticationError(
        'Current password is incorrect.',
        ERROR_CODES.INVALID_CREDENTIALS,
      );
    }

    // Validate password history
    await this._validatePasswordHistory(userId, newPassword);

    // Hash new password
    const newHash = await hashPassword(newPassword);

    // Save old to history
    await passwordHistoryRepository.create(userId, user.passwordHash);

    // Update
    await userRepository.updateById(userId, {
      passwordHash: newHash,
      passwordChangedAt: new Date(),
    });

    // Revoke all sessions except current
    if (sessionId) {
      await sessionService.revokeOtherSessions(userId, sessionId);
    }

    await cacheManager.del(`auth:permissions:${userId}`);

    eventBus.publish(EVENT_TYPES.AUTH_PASSWORD_CHANGED, {
      userId,
      method: 'change',
    }, { source: 'auth:service' });

    auditService.logEvent({
      eventType: 'password.changed',
      userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      result: 'success',
      details: { method: 'change' },
    });

    // Notify user
    try {
      await queueManager.addJob('auth-email', 'send-password-changed-email', {
        email: user.email,
        name: user.firstName,
      });
    } catch (err) {
      logger.warn('Failed to enqueue password changed email', {
        module: 'auth',
        error: { message: err.message },
      });
    }
  }

  /**
   * Activate account with token and set password.
   */
  async activate(token, password, meta = {}) {
    const hashedToken = hashResetToken(token);

    const User = (await import('./user.model.js')).default;
    const user = await User.findOne({
      activationTokenHash: hashedToken,
      activationTokenExpires: { $gt: new Date() },
      status: 'pending_activation',
    }).select('+passwordHash +activationTokenHash +activationTokenExpires');

    if (!user) {
      throw new AuthenticationError(
        'Invalid or expired activation token.',
        ERROR_CODES.INVALID_ACTIVATION_TOKEN,
      );
    }

    // Hash the new password
    const newHash = await hashPassword(password);

    // Save old (temp) password to history
    if (user.passwordHash) {
      await passwordHistoryRepository.create(user._id, user.passwordHash);
    }

    // Activate user
    await userRepository.updateById(user._id, {
      passwordHash: newHash,
      passwordChangedAt: new Date(),
      status: 'active',
      activationTokenHash: null,
      activationTokenExpires: null,
    });

    auditService.logEvent({
      eventType: 'account.activated',
      userId: user._id,
      email: user.email,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      result: 'success',
    });

    logger.info('Account activated', {
      module: 'auth',
      action: 'activate',
      userId: user._id,
    });
  }

  /**
   * Validate new password against history.
   */
  async _validatePasswordHistory(userId, newPassword) {
    const recentPasswords = await passwordHistoryRepository.findRecentByUser(userId, 5);

    for (const entry of recentPasswords) {
      const matches = await comparePassword(newPassword, entry.passwordHash);
      if (matches) {
        throw new ValidationError('Password was used recently. Choose a different password.', [
          { field: 'password', message: 'Cannot reuse any of the last 5 passwords' },
        ]);
      }
    }
  }
}

const authService = new AuthService();
export default authService;
