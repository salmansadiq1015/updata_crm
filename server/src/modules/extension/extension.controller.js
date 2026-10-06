import { UAParser } from 'ua-parser-js';
import extensionService from './extension.service.js';

/**
 * Extension controller — HTTP layer only. Parses the request, derives device
 * metadata, delegates to the service, formats the response envelope. Identity
 * is always taken from req.user (set by authenticate), never from the body.
 */
class ExtensionController {
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

  // POST /extension/pairing — authenticated CRM user mints a one-time grant.
  async createPairing(req, res, next) {
    try {
      const meta = this._parseMeta(req);
      const result = await extensionService.createPairingGrant(req.user._id, meta);
      return res.success({ data: result, message: 'Pairing grant created' });
    } catch (err) {
      next(err);
    }
  }

  // POST /extension/pairing/redeem — PUBLIC, authorised solely by the grant.
  async redeemPairing(req, res, next) {
    try {
      const { grant, instanceId, extensionVersion } = req.body;
      const meta = this._parseMeta(req);
      const result = await extensionService.redeemPairingGrant(grant, {
        instanceId,
        extensionVersion,
        meta,
      });
      return res.success({ data: result, message: 'Extension connected' });
    } catch (err) {
      next(err);
    }
  }

  // GET /extension/status — connection state for the Lead-page card.
  async getStatus(req, res, next) {
    try {
      const result = await extensionService.getStatusForUser(req.user._id);
      return res.success({ data: result });
    } catch (err) {
      next(err);
    }
  }

  // POST /extension/heartbeat — called by the extension's own session.
  async heartbeat(req, res, next) {
    try {
      const { extensionVersion } = req.body || {};
      await extensionService.heartbeat(req.user._id, req.sessionId, { extensionVersion });
      return res.success({ message: 'ok' });
    } catch (err) {
      next(err);
    }
  }

  // POST /extension/disconnect — revoke one or all of the user's links.
  async disconnect(req, res, next) {
    try {
      const { connectionId } = req.body || {};
      const meta = this._parseMeta(req);
      const result = await extensionService.disconnect(req.user._id, { connectionId, meta });
      return res.success({ data: result, message: 'Extension disconnected' });
    } catch (err) {
      next(err);
    }
  }
}

const extensionController = new ExtensionController();
export default extensionController;
