import { Router } from 'express';

import controller from './pairedPhone.controller.js';
import service from './pairedPhone.service.js';
import * as schemas from './pairedPhone.validation.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { validate } from '../../shared/validation/validate.js';

/** Owner routes: /api/v1/paired-phone */
const router = Router();
router.get('/devices', authenticate, requirePermission('ai-calling:read'), controller.listDevices);
router.post('/devices/pairing-code', authenticate, requirePermission('ai-calling:admin'), validate(schemas.createPairingCode), controller.createPairingCode);
router.get('/devices/:id', authenticate, requirePermission('ai-calling:read'), validate(schemas.deviceId), controller.getDevice);
router.patch('/devices/:id', authenticate, requirePermission('ai-calling:admin'), validate(schemas.updateDevice), controller.updateDevice);
router.post('/devices/:id/revoke', authenticate, requirePermission('ai-calling:admin'), validate(schemas.deviceId), controller.revokeDevice);
router.post('/devices/:id/verify-audio', authenticate, requirePermission('ai-calling:admin'), validate(schemas.verifyAudio), controller.verifyAudio);
router.post('/devices/:id/rotate-key', authenticate, requirePermission('ai-calling:admin'), validate(schemas.deviceId), controller.rotateKey);
router.post('/devices/:id/clear', authenticate, requirePermission('ai-calling:write'), validate(schemas.deviceId), controller.clearAttention);
router.post('/calls/:callId/takeover', authenticate, requirePermission('ai-calling:write'), validate(schemas.callControl), controller.takeover);
router.post('/calls/:callId/hangup', authenticate, requirePermission('ai-calling:write'), validate(schemas.callControl), controller.hangup);

/** Gateway bearer token (header only; never in a query string). */
export async function authenticateGateway(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const device = await service.authenticateGateway(token);
    if (!device) return res.status(401).json({ success: false, error: { code: 'GATEWAY_UNAUTHORIZED', message: 'Gateway token is invalid or the device was revoked' } });
    req.gatewayDevice = device;
    return next();
  } catch (e) {
    return next(e);
  }
}

/** Gateway routes: /api/v1/paired-phone/gateway */
export const gatewayRoutes = Router();
gatewayRoutes.post('/pair', validate(schemas.redeem), controller.redeem);
gatewayRoutes.post('/heartbeat', authenticateGateway, validate(schemas.heartbeat), controller.heartbeat);
gatewayRoutes.post('/dial-key', authenticateGateway, controller.takeKey);
gatewayRoutes.post('/dial-key/confirm', authenticateGateway, validate(schemas.confirmKey), controller.confirmKey);
gatewayRoutes.post('/calls/claim', authenticateGateway, validate(schemas.claim), controller.claim);
gatewayRoutes.post('/calls/:callId/events', authenticateGateway, validate(schemas.event), controller.event);

export default router;
