import crypto from 'crypto';
import { getRedisClient } from '../../config/redis.js';
import logger from '../../shared/logger/index.js';
import userRepository from '../auth/user.repository.js';
import sessionService from '../auth/session.service.js';
import auditService from '../auth/audit.service.js';
import extensionRepository from './extension.repository.js';
import { EXTENSION_CONNECTION_STATUS } from './extensionConnection.model.js';
import { LEAD_FINDER_EXTENSION_ID } from '../../shared/middleware/cors.js';
import { generateTokenPair, generateRandomString } from '../../shared/utils/crypto.js';
import { AuthenticationError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';

/**
 * Extension service — the secure connect handoff between an authenticated CRM
 * session and the Lead Finder Chrome extension.
 *
 * Flow (no password ever enters the extension):
 *   1. CRM Lead page (already authenticated) → createPairingGrant() mints a
 *      single-use, short-lived code bound to req.user._id, held only in Redis.
 *   2. The page hands the code to the extension via chrome.runtime.sendMessage
 *      (externally_connectable, CRM origin only).
 *   3. The extension → redeemPairingGrant() consumes the code and receives a
 *      normal rotating access/refresh pair tied to a dedicated 'extension'
 *      session, plus an ExtensionConnection record for status/disconnect.
 *
 * Everything downstream reuses the existing auth stack: /auth/refresh rotates
 * the token, authenticate() enforces RBAC, and lead ownership stays
 * server-derived. The extension is just another client of the existing session.
 */

// A pairing grant is only a transient bearer of "this user authorised a link".
// Keep it short: long enough to click through, short enough to limit exposure.
const GRANT_TTL_SECONDS = 300; // 5 minutes
const GRANT_PREFIX = 'ext:grant:';
// A connection whose session is still active but has not phoned home within this
// window is reported as 'connected' but stale is tolerated; the session check is
// the real liveness signal.

class ExtensionService {
  _redis() {
    return getRedisClient(logger);
  }

  _grantKey(code) {
    return `${GRANT_PREFIX}${code}`;
  }

  /**
   * Mint a single-use pairing grant for an authenticated user. The grant never
   * leaves Redis except as an opaque code returned to the user's own CRM page.
   */
  async createPairingGrant(userId, meta = {}) {
    const code = generateRandomString(32); // 64 hex chars
    const payload = JSON.stringify({
      userId: userId.toString(),
      createdAt: new Date().toISOString(),
      ipAddress: meta.ipAddress || null,
    });
    await this._redis().set(this._grantKey(code), payload, 'EX', GRANT_TTL_SECONDS);

    auditService.logEvent({
      eventType: 'extension.pairing_created',
      userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      result: 'success',
    });

    return {
      grant: code,
      extensionId: LEAD_FINDER_EXTENSION_ID,
      expiresInSec: GRANT_TTL_SECONDS,
    };
  }

  /**
   * Redeem a pairing grant: consume it atomically, mint a token pair bound to a
   * new extension session, and record the connection. Called by the extension
   * with NO prior token — the grant is the only authorisation, so it must be
   * single-use and short-lived (both enforced here + by the Redis TTL).
   */
  async redeemPairingGrant(grant, { instanceId, extensionVersion, meta = {} } = {}) {
    if (!grant || typeof grant !== 'string') {
      throw new AuthenticationError('Missing pairing grant.', ERROR_CODES.INVALID_TOKEN);
    }

    // Atomic single-use: GET + DEL in one transaction so a replayed code can
    // never be redeemed twice even under concurrent requests.
    const [[, raw]] = await this._redis()
      .multi()
      .get(this._grantKey(grant))
      .del(this._grantKey(grant))
      .exec();

    if (!raw) {
      throw new AuthenticationError(
        'This connect link has expired or was already used. Generate a new one from the CRM.',
        ERROR_CODES.INVALID_TOKEN,
      );
    }

    const { userId } = JSON.parse(raw);
    const user = await userRepository.findById(userId);
    if (!user || user.status !== 'active') {
      throw new AuthenticationError(
        'The CRM account for this connect link is unavailable.',
        ERROR_CODES.ACCOUNT_DEACTIVATED,
      );
    }

    const resolvedInstanceId = this._normalizeInstanceId(instanceId);

    // Reconnecting the same browser install? Revoke its previous token session
    // first so we never leave an orphaned, still-valid extension session behind.
    const previous = await extensionRepository.findByInstance(userId, resolvedInstanceId);
    if (previous?.sessionId) {
      await sessionService.revokeSession(userId, previous.sessionId);
    }

    // Mint a normal session + rotating token pair — identical machinery to a
    // browser login, tagged as an extension so it is visible/revocable in the
    // user's session list.
    const sessionId = crypto.randomUUID();
    const tokens = generateTokenPair(user, sessionId);
    const refreshTokenHash = crypto
      .createHash('sha256')
      .update(tokens.refreshToken)
      .digest('hex');

    await sessionService.createSession(user._id, sessionId, {
      refreshTokenHash,
      deviceType: 'extension',
      browser: meta.browser || 'Lead Finder extension',
      os: meta.os || 'unknown',
      ipAddress: meta.ipAddress || 'unknown',
    });

    const connection = await extensionRepository.upsertConnection(user._id, resolvedInstanceId, {
      sessionId,
      status: EXTENSION_CONNECTION_STATUS.CONNECTED,
      extensionVersion: extensionVersion || null,
      userAgent: meta.userAgent || null,
      browser: meta.browser || null,
      os: meta.os || null,
      ipAddress: meta.ipAddress || null,
      connectedAt: new Date(),
      lastSeenAt: new Date(),
      revokedAt: null,
    });

    auditService.logEvent({
      eventType: 'extension.connected',
      userId: user._id,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      result: 'success',
      details: { instanceId: resolvedInstanceId, connectionId: connection?._id?.toString() },
    });

    logger.info('Chrome extension connected', {
      module: 'extension',
      action: 'redeem',
      userId: user._id.toString(),
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: 900,
      tokenType: 'Bearer',
      user: {
        id: user._id.toString(),
        _id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`,
        role: user.role?.name || null,
      },
    };
  }

  /**
   * Report the connection state the CRM Lead page shows. The authoritative
   * liveness check is whether the backing Redis session still exists — a user
   * who logged out everywhere, or disconnected, must not read as "connected".
   */
  async getStatusForUser(userId) {
    const connection = await extensionRepository.findActiveByUser(userId);
    if (!connection) {
      return { connected: false, extensionId: LEAD_FINDER_EXTENSION_ID, connection: null };
    }

    const sessionAlive = connection.sessionId
      ? await sessionService.isSessionActive(userId, connection.sessionId)
      : false;

    if (!sessionAlive) {
      // The link's token session is gone. Surface it as an error state so the
      // page can prompt a reconnect rather than silently claiming "connected".
      await extensionRepository.markStatus(connection._id, EXTENSION_CONNECTION_STATUS.ERROR);
      return {
        connected: false,
        error: 'session_expired',
        extensionId: LEAD_FINDER_EXTENSION_ID,
        connection: this._publicConnection({ ...connection, status: EXTENSION_CONNECTION_STATUS.ERROR }),
      };
    }

    return {
      connected: true,
      extensionId: LEAD_FINDER_EXTENSION_ID,
      connection: this._publicConnection(connection),
    };
  }

  /**
   * Heartbeat from the extension's own authenticated session — refreshes
   * lastSeenAt (and version) for the matching connection. Best-effort.
   */
  async heartbeat(userId, sessionId, { extensionVersion } = {}) {
    if (!sessionId) return null;
    const connection = await extensionRepository.findBySession(userId, sessionId);
    if (!connection) return null;
    return extensionRepository.touch(connection._id, {
      status: EXTENSION_CONNECTION_STATUS.CONNECTED,
      ...(extensionVersion ? { extensionVersion } : {}),
    });
  }

  /**
   * Disconnect the extension from the CRM side. Revokes the backing token
   * session (immediately invalidating the extension) and marks the record.
   * When no connectionId is given, every link the user owns is revoked.
   */
  async disconnect(userId, { connectionId, meta = {} } = {}) {
    const connections = connectionId
      ? [await extensionRepository.findByIdForUser(connectionId, userId)].filter(Boolean)
      : await extensionRepository.listActiveByUser(userId);

    if (connectionId && connections.length === 0) {
      // Nothing owned by this user under that id — treat as already gone.
      return { disconnected: 0 };
    }

    for (const connection of connections) {
      if (connection.sessionId) {
        await sessionService.revokeSession(userId, connection.sessionId);
      }
      await extensionRepository.markStatus(connection._id, EXTENSION_CONNECTION_STATUS.REVOKED, {
        revokedAt: new Date(),
        sessionId: null,
      });
    }

    auditService.logEvent({
      eventType: 'extension.disconnected',
      userId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      result: 'success',
      details: { count: connections.length },
    });

    return { disconnected: connections.length };
  }

  _normalizeInstanceId(instanceId) {
    const value = typeof instanceId === 'string' ? instanceId.trim() : '';
    if (value && value.length <= 128) return value;
    // The extension should always supply one; fall back to a server id so a
    // malformed client still produces a usable, unique connection record.
    return `srv-${generateRandomString(12)}`;
  }

  _publicConnection(connection) {
    return {
      id: connection._id.toString(),
      instanceId: connection.instanceId,
      status: connection.status,
      extensionVersion: connection.extensionVersion || null,
      browser: connection.browser || null,
      os: connection.os || null,
      connectedAt: connection.connectedAt || null,
      lastSeenAt: connection.lastSeenAt || null,
    };
  }
}

const extensionService = new ExtensionService();
export default extensionService;
