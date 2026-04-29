import { getRedisClient } from '../../config/redis.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

/**
 * Session service — manages user sessions in Redis.
 *
 * Key pattern: session:{userId}:{sessionId}
 * Value: JSON { refreshTokenHash, userId, deviceType, browser, os, ipAddress, createdAt, lastActiveAt }
 * TTL: 604800s (7 days)
 *
 * Note: ioredis auto-prepends config.redis.keyPrefix ('mb:') to all commands
 * except SCAN. For SCAN, we manually include the prefix.
 */

const SESSION_TTL = 604800; // 7 days in seconds
const SESSION_PREFIX = 'session:';

class SessionService {
  _getRedis() {
    return getRedisClient(logger);
  }

  _key(userId, sessionId) {
    return `${SESSION_PREFIX}${userId}:${sessionId}`;
  }

  /**
   * Create a new session in Redis.
   */
  async createSession(userId, sessionId, data) {
    const redis = this._getRedis();
    const session = {
      refreshTokenHash: data.refreshTokenHash,
      userId: userId.toString(),
      deviceType: data.deviceType || 'unknown',
      browser: data.browser || 'unknown',
      os: data.os || 'unknown',
      ipAddress: data.ipAddress || 'unknown',
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
    };

    const key = this._key(userId, sessionId);
    await redis.set(key, JSON.stringify(session), 'EX', SESSION_TTL);

    // Enforce session limit
    await this._enforceSessionLimit(userId, sessionId);

    return session;
  }

  /**
   * Check if a session exists and is active.
   */
  async isSessionActive(userId, sessionId) {
    const redis = this._getRedis();
    const data = await redis.get(this._key(userId, sessionId));
    return data !== null;
  }

  /**
   * Get session data.
   */
  async getSession(userId, sessionId) {
    const redis = this._getRedis();
    const data = await redis.get(this._key(userId, sessionId));
    return data ? JSON.parse(data) : null;
  }

  /**
   * Update lastActiveAt (fire-and-forget).
   */
  async touchSession(userId, sessionId) {
    try {
      const redis = this._getRedis();
      const key = this._key(userId, sessionId);
      const data = await redis.get(key);
      if (!data) return;

      const session = JSON.parse(data);
      session.lastActiveAt = new Date().toISOString();

      // Preserve remaining TTL
      const ttl = await redis.ttl(key);
      if (ttl > 0) {
        await redis.set(key, JSON.stringify(session), 'EX', ttl);
      }
    } catch (err) {
      logger.warn('Failed to touch session', {
        module: 'auth',
        action: 'touchSession',
        error: { message: err.message },
      });
    }
  }

  /**
   * List all sessions for a user.
   */
  async getSessionsByUser(userId) {
    const redis = this._getRedis();
    const prefix = config.redis.keyPrefix || '';
    const pattern = `${prefix}${SESSION_PREFIX}${userId}:*`;

    const keys = [];
    const stream = redis.scanStream({ match: pattern, count: 100 });

    await new Promise((resolve, reject) => {
      stream.on('data', (resultKeys) => keys.push(...resultKeys));
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    if (keys.length === 0) return [];

    // Fetch all session data via pipeline
    const pipeline = redis.pipeline();
    for (const key of keys) {
      // Use raw key (SCAN returns full key including prefix)
      pipeline.get(key);
    }
    const results = await pipeline.exec();

    const sessions = [];
    for (let i = 0; i < keys.length; i++) {
      const [err, data] = results[i];
      if (err || !data) continue;

      const session = JSON.parse(data);
      // Extract sessionId from key: {prefix}session:{userId}:{sessionId}
      const keyWithoutPrefix = keys[i].replace(prefix, '');
      const sessionId = keyWithoutPrefix.split(':').pop();

      sessions.push({
        sessionId,
        ...session,
      });
    }

    // Sort by createdAt descending
    sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sessions;
  }

  /**
   * Revoke a single session.
   */
  async revokeSession(userId, sessionId) {
    const redis = this._getRedis();
    await redis.del(this._key(userId, sessionId));
  }

  /**
   * Revoke all sessions for a user.
   */
  async revokeAllUserSessions(userId) {
    const redis = this._getRedis();
    const prefix = config.redis.keyPrefix || '';
    const pattern = `${prefix}${SESSION_PREFIX}${userId}:*`;

    const keys = [];
    const stream = redis.scanStream({ match: pattern, count: 100 });

    await new Promise((resolve, reject) => {
      stream.on('data', (resultKeys) => keys.push(...resultKeys));
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    if (keys.length > 0) {
      // DEL with raw keys (already include prefix from SCAN)
      const pipeline = redis.pipeline();
      for (const key of keys) {
        pipeline.del(key);
      }
      await pipeline.exec();
    }

    return keys.length;
  }

  /**
   * Revoke all sessions except the current one.
   */
  async revokeOtherSessions(userId, currentSessionId) {
    const redis = this._getRedis();
    const prefix = config.redis.keyPrefix || '';
    const pattern = `${prefix}${SESSION_PREFIX}${userId}:*`;
    const currentKey = `${prefix}${SESSION_PREFIX}${userId}:${currentSessionId}`;

    const keys = [];
    const stream = redis.scanStream({ match: pattern, count: 100 });

    await new Promise((resolve, reject) => {
      stream.on('data', (resultKeys) => keys.push(...resultKeys));
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    const keysToDelete = keys.filter((k) => k !== currentKey);
    if (keysToDelete.length > 0) {
      const pipeline = redis.pipeline();
      for (const key of keysToDelete) {
        pipeline.del(key);
      }
      await pipeline.exec();
    }

    return keysToDelete.length;
  }

  /**
   * Update the refresh token hash for a session (token rotation).
   */
  async updateRefreshTokenHash(userId, sessionId, newRefreshTokenHash) {
    const redis = this._getRedis();
    const key = this._key(userId, sessionId);
    const data = await redis.get(key);
    if (!data) return false;

    const session = JSON.parse(data);
    session.refreshTokenHash = newRefreshTokenHash;
    session.lastActiveAt = new Date().toISOString();

    const ttl = await redis.ttl(key);
    if (ttl > 0) {
      await redis.set(key, JSON.stringify(session), 'EX', ttl);
    }
    return true;
  }

  /**
   * Enforce per-user session limit. Revokes oldest if exceeded.
   */
  async _enforceSessionLimit(userId, currentSessionId) {
    const maxSessions = config.auth?.sessionMaxPerUser || 10;
    const sessions = await this.getSessionsByUser(userId);

    if (sessions.length <= maxSessions) return;

    // Sort by createdAt ascending (oldest first)
    const sorted = sessions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    // Revoke oldest sessions until within limit, but never revoke current
    const toRevoke = sorted.length - maxSessions;
    let revoked = 0;

    for (const session of sorted) {
      if (revoked >= toRevoke) break;
      if (session.sessionId === currentSessionId) continue;
      await this.revokeSession(userId, session.sessionId);
      revoked++;
    }

    if (revoked > 0) {
      logger.info('Session limit enforced — oldest sessions revoked', {
        module: 'auth',
        action: 'enforceSessionLimit',
        userId: userId.toString(),
        revokedCount: revoked,
      });
    }
  }

  /**
   * Find a session across all users by sessionId (for admin revocation).
   */
  async findSessionAcrossUsers(targetSessionId) {
    const redis = this._getRedis();
    const prefix = config.redis.keyPrefix || '';
    const pattern = `${prefix}${SESSION_PREFIX}*:${targetSessionId}`;

    const keys = [];
    const stream = redis.scanStream({ match: pattern, count: 100 });
    await new Promise((resolve, reject) => {
      stream.on('data', (resultKeys) => keys.push(...resultKeys));
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    if (keys.length === 0) return null;

    const data = await redis.get(keys[0]);
    if (!data) return null;

    const session = JSON.parse(data);
    const keyWithoutPrefix = keys[0].replace(prefix, '');
    const parts = keyWithoutPrefix.replace(SESSION_PREFIX, '').split(':');
    const userId = parts[0];

    return { ...session, userId, sessionId: targetSessionId };
  }

  /**
   * Get failed login count for an email.
   */
  async getFailedLoginCount(email) {
    const redis = this._getRedis();
    const count = await redis.get(`auth:failed:${email}`);
    return parseInt(count || '0', 10);
  }

  /**
   * Increment failed login counter with TTL.
   */
  async incrementFailedLogin(email) {
    const redis = this._getRedis();
    const key = `auth:failed:${email}`;
    const count = await redis.incr(key);
    // Set/refresh TTL on the counter
    await redis.expire(key, config.auth?.lockoutWindowSeconds || 900);
    return count;
  }

  /**
   * Clear failed login counter.
   */
  async clearFailedLogin(email) {
    const redis = this._getRedis();
    await redis.del(`auth:failed:${email}`);
  }
}

const sessionService = new SessionService();
export default sessionService;
