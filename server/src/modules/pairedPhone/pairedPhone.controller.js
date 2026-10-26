import service from './pairedPhone.service.js';

const meta = (req) => ({ ipAddress: req.ip, userAgent: req.get('user-agent') });
const wrap = (fn) => async (req, res, next) => { try { return await fn(req, res); } catch (e) { return next(e); } };

export default {
  // ---- owner (user session) ----
  listDevices: wrap(async (req, res) => res.success({ data: await service.listDevices(req.user._id) })),
  getDevice: wrap(async (req, res) => res.success({ data: await service.getDevice(req.user._id, req.params.id) })),
  createPairingCode: wrap(async (req, res) => res.success({ data: await service.createPairingCode(req.user._id, req.body, meta(req)), message: 'Pairing code created', statusCode: 201 })),
  updateDevice: wrap(async (req, res) => res.success({ data: await service.updateDevice(req.user._id, req.params.id, req.body), message: 'Device updated' })),
  revokeDevice: wrap(async (req, res) => res.success({ data: await service.revokeDevice(req.user._id, req.params.id, meta(req)), message: 'Device revoked' })),
  verifyAudio: wrap(async (req, res) => res.success({ data: await service.verifyAudio(req.user._id, req.params.id, req.body, meta(req)), message: 'Call audio verified' })),
  rotateKey: wrap(async (req, res) => res.success({ data: await service.rotateDialKey(req.user._id, req.params.id, meta(req)), message: 'Dial key rotated; provision it on the ESP32' })),
  clearAttention: wrap(async (req, res) => res.success({ data: await service.clearAttention(req.user._id, req.params.id, meta(req)), message: 'Device cleared' })),
  takeover: wrap(async (req, res) => res.success({ data: await service.requestCallControl(req.user._id, req.params.callId, 'takeover', meta(req)), message: 'Takeover requested' })),
  hangup: wrap(async (req, res) => res.success({ data: await service.requestCallControl(req.user._id, req.params.callId, 'hangup', meta(req)), message: 'Hang-up requested' })),

  // ---- gateway (device token) ----
  redeem: wrap(async (req, res) => res.success({ data: await service.redeemPairingCode(req.body.code, req.body.gateway, meta(req)), message: 'Gateway paired', statusCode: 201 })),
  heartbeat: wrap(async (req, res) => res.success({ data: await service.heartbeat(req.gatewayDevice, req.body) })),
  takeKey: wrap(async (req, res) => res.success({ data: await service.takeDialKey(req.gatewayDevice) })),
  confirmKey: wrap(async (req, res) => res.success({ data: await service.confirmDialKey(req.gatewayDevice, req.body) })),
  claim: wrap(async (req, res) => res.success({ data: await service.claimCall(req.gatewayDevice, req.body) })),
  event: wrap(async (req, res) => res.success({ data: await service.reportEvent(req.gatewayDevice, req.params.callId, req.body) })),
};
