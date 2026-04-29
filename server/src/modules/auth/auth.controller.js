import { UAParser } from 'ua-parser-js';
import authService from './auth.service.js';
import sessionService from './session.service.js';
import auditService from './audit.service.js';
import { Parser as Json2CsvParser } from '@json2csv/plainjs';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';

/**
 * Auth controller — HTTP layer only.
 * Parses request, extracts device metadata, calls service, formats response.
 */
class AuthController {
  /**
   * Parse device info from User-Agent header.
   */
  _parseMeta(req) {
    const ua = new UAParser(req.get('user-agent'));
    const result = ua.getResult();
    return {
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || null,
      deviceType: result.device.type || 'desktop',
      browser: result.browser.name || 'unknown',
      os: result.os.name || 'unknown',
    };
  }

  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const meta = this._parseMeta(req);
      const result = await authService.login(email, password, meta);
      return res.success({ data: result, message: 'Login successful', statusCode: 200 });
    } catch (err) {
      next(err);
    }
  }

  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;
      const result = await authService.refresh(refreshToken);
      return res.success({ data: result, message: 'Token refreshed successfully' });
    } catch (err) {
      next(err);
    }
  }

  async logout(req, res, next) {
    try {
      const meta = this._parseMeta(req);
      await authService.logout(req.user._id, req.sessionId, meta);
      return res.success({ message: 'Logged out successfully' });
    } catch (err) {
      next(err);
    }
  }

  async activate(req, res, next) {
    try {
      const { token, password } = req.body;
      const meta = this._parseMeta(req);
      await authService.activate(token, password, meta);
      return res.success({ message: 'Account activated successfully. You can now log in.' });
    } catch (err) {
      next(err);
    }
  }

  async requestPasswordReset(req, res, next) {
    try {
      const { email } = req.body;
      const meta = this._parseMeta(req);
      await authService.requestPasswordReset(email, meta);
      // Always return 200 — no email enumeration
      return res.success({
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    } catch (err) {
      next(err);
    }
  }

  async confirmPasswordReset(req, res, next) {
    try {
      const { token, password } = req.body;
      const meta = this._parseMeta(req);
      await authService.confirmPasswordReset(token, password, meta);
      return res.success({ message: 'Password has been reset successfully. Please log in with your new password.' });
    } catch (err) {
      next(err);
    }
  }

  async changePassword(req, res, next) {
    try {
      const { currentPassword, newPassword } = req.body;
      const meta = this._parseMeta(req);
      await authService.changePassword(
        req.user._id,
        currentPassword,
        newPassword,
        req.sessionId,
        meta,
      );
      return res.success({ message: 'Password changed successfully.' });
    } catch (err) {
      next(err);
    }
  }

  async listSessions(req, res, next) {
    try {
      const sessions = await sessionService.getSessionsByUser(req.user._id);
      // Mark current session
      const enriched = sessions.map((s) => ({
        ...s,
        isCurrent: s.sessionId === req.sessionId,
      }));
      return res.success({ data: enriched });
    } catch (err) {
      next(err);
    }
  }

  async revokeSession(req, res, next) {
    try {
      const { id: targetSessionId } = req.params;
      let targetUserId = req.user._id;

      if (req.user.role?.name === 'Admin') {
        const session = await sessionService.findSessionAcrossUsers(targetSessionId);
        if (!session) {
          return res.fail({
            statusCode: 404,
            message: 'Session not found.',
            code: 'NOT_FOUND',
          });
        }
        targetUserId = session.userId;
      } else {
        const sessions = await sessionService.getSessionsByUser(req.user._id);
        const owns = sessions.some((s) => s.sessionId === targetSessionId);
        if (!owns) {
          return res.fail({
            statusCode: 403,
            message: 'You can only revoke your own sessions.',
            code: 'INSUFFICIENT_PERMISSIONS',
          });
        }
      }

      await sessionService.revokeSession(targetUserId, targetSessionId);

      eventBus.publish(EVENT_TYPES.AUTH_SESSION_REVOKED, {
        userId: targetUserId,
        sessionId: targetSessionId,
        revokedBy: req.user._id,
      }, { source: 'auth:controller' });

      auditService.logEvent({
        eventType: 'session.revoked',
        userId: req.user._id,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        result: 'success',
        details: { revokedSessionId: targetSessionId, targetUserId },
      });

      return res.success({ message: 'Session revoked successfully.' });
    } catch (err) {
      next(err);
    }
  }

  async revokeOtherSessions(req, res, next) {
    try {
      const count = await sessionService.revokeOtherSessions(req.user._id, req.sessionId);
      return res.success({
        data: { revokedCount: count },
        message: `${count} session(s) revoked.`,
      });
    } catch (err) {
      next(err);
    }
  }

  async getAuditLog(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const { cursor, limit, sortBy, sortOrder, ...filters } = query;
      const result = await auditService.query({
        cursor,
        limit,
        sortBy: sortBy || 'timestamp',
        sortOrder: sortOrder || 'desc',
        filters,
      });
      return res.success({ data: result.data, pagination: result.pagination });
    } catch (err) {
      next(err);
    }
  }

  async exportAuditLog(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;
      const { format, ...filters } = query;
      const cursor = auditService.getExportCursor(filters);

      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=audit-log.csv');

        const fields = ['timestamp', 'eventType', 'userId', 'email', 'ipAddress', 'result', 'module', 'details'];
        const parser = new Json2CsvParser({ fields });

        const docs = [];
        for await (const doc of cursor) {
          docs.push({
            ...doc,
            details: doc.details ? JSON.stringify(doc.details) : '',
          });
        }

        const csv = parser.parse(docs);
        return res.send(csv);
      }

      // JSON export
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-log.json');

      const docs = [];
      for await (const doc of cursor) {
        docs.push(doc);
      }
      return res.json({ success: true, data: docs, count: docs.length });
    } catch (err) {
      next(err);
    }
  }
}

const authController = new AuthController();
export default authController;
