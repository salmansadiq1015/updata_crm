import { randomUUID } from 'node:crypto';
import Device from './pairedDevice.model.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import audit from '../auth/audit.service.js';
import { HEARTBEAT_STALE_MS } from './readiness.js';
import { SETUP_ACTIONS, SETUP_ACTIVE, SETUP_TTL_MS, publicSetup } from './setupCommand.js';

function emit(d) { global.io?.to(`user:${d.createdBy}`).emit('paired-phone:device', { deviceId: String(d._id), event: 'setup' }); }
async function owned(actor, id) {
  const d = await Device.findOne({ _id: id, createdBy: actor, revokedAt: null, archivedAt: null });
  if (!d) throw new NotFoundError('PairedDevice', id);
  return d;
}
const busy = d => Boolean(d.currentCallId || d.state?.call || d.state?.callsetup);

export default {
  async settings(actor, id, input, meta = {}) {
    const d = await owned(actor, id);
    const set = {};
    if (input.playbackGainDb !== undefined) set['setup.playbackGainDb'] = input.playbackGainDb;
    if (input.autoConnect !== undefined) set['setup.autoConnect'] = input.autoConnect;
    await Device.updateOne({ _id: d._id, createdBy: actor }, { $set: set });
    audit.logEvent({ eventType: 'paired_phone.setup_settings', userId: actor, module: 'paired-phone', result: 'success', ...meta, ipAddress: meta.ipAddress || 'internal', details: { deviceId: id, ...input } });
    emit(d);
    return publicSetup((await Device.findById(id).select('setup').lean()).setup);
  },
  async request(actor, id, action, meta = {}) {
    if (!SETUP_ACTIONS.includes(action)) throw new ValidationError('Unsupported setup action');
    const d = await owned(actor, id);
    if (!d.lastHeartbeatAt || Date.now() - d.lastHeartbeatAt > HEARTBEAT_STALE_MS) throw new ConflictError('Start the gateway on your computer first');
    const version = String(d.gateway?.version || '').split('.').map(Number);
    if (!(version[0] >= 1 || (version[0] === 0 && version[1] >= 3))) throw new ConflictError('Install gateway 0.3.0 or newer using the CRM setup guide');
    if (busy(d)) throw new ConflictError('End the phone call before changing the bridge setup');
    if (action === 'provision_key' && d.dialKey?.state === 'provisioned') throw new ConflictError('The key is already provisioned. Routine reconnection does not need a new key or BOOT.');
    const command = { id: randomUUID(), action, state: 'pending', requestedAt: new Date(), expiresAt: new Date(Date.now() + SETUP_TTL_MS), message: 'Waiting for the laptop gateway', startedAt: null, completedAt: null };
    const updated = await Device.findOneAndUpdate({ _id: id, createdBy: actor, revokedAt: null, archivedAt: null, currentCallId: null, 'state.call': 0, 'state.callsetup': 0,
      $or: [{ 'setup.command.state': { $nin: SETUP_ACTIVE } }, { 'setup.command.expiresAt': { $lte: new Date() } }] },
    { $set: { 'setup.command': command, ...(['connect_phone', 'pair_phone', 'disconnect_phone'].includes(action) ? { 'setup.autoConnect': action !== 'disconnect_phone' } : {}) } }, { returnDocument: 'after' });
    if (!updated) throw new ConflictError('Another setup action or call is in progress');
    audit.logEvent({ eventType: 'paired_phone.setup_requested', userId: actor, module: 'paired-phone', result: 'success', ...meta, ipAddress: meta.ipAddress || 'internal', details: { deviceId: id, action, commandId: command.id } });
    emit(d);
    return publicSetup(updated.setup);
  },
  async claim(device, commandId) {
    const d = await Device.findOneAndUpdate({ _id: device._id, revokedAt: null, currentCallId: null,
      'state.call': 0, 'state.callsetup': 0, 'setup.command.id': commandId, 'setup.command.state': 'pending', 'setup.command.expiresAt': { $gt: new Date() } },
    { $set: { 'setup.command.state': 'running', 'setup.command.startedAt': new Date(), 'setup.command.message': 'Gateway is performing this action' } }, { returnDocument: 'after' });
    if (!d) throw new ConflictError('Setup action expired, was already claimed, or the phone is in a call');
    emit(d);
    return publicSetup(d.setup).command;
  },
  async complete(device, commandId, { succeeded, code = '' }) {
    // Only known result codes enter the UI; never persist arbitrary local errors/keys.
    const messages = { no_presence: 'Hold the BOOT button on the bridge, then choose Save security key again.', no_peer: 'Open Phone setup and choose Pair a new phone first.', no_board: 'The computer cannot reach the USB bridge. Unplug and reconnect its USB cable, then try again.', busy: 'The phone is in a call. Try again after it ends.', failed: 'That step did not finish. Check the USB cable and phone Bluetooth, then try again.' };
    const d = await Device.findOneAndUpdate({ _id: device._id, revokedAt: null, 'setup.command.id': commandId, 'setup.command.state': 'running' },
    { $set: { 'setup.command.state': succeeded ? 'succeeded' : 'failed', 'setup.command.completedAt': new Date(), 'setup.command.message': succeeded ? 'Gateway confirmed the action completed' : (messages[code] || messages.failed) } }, { returnDocument: 'after' });
    if (!d) throw new ConflictError('Setup action is no longer active');
    audit.logEvent({ eventType: 'paired_phone.setup_completed', userId: d.createdBy, module: 'paired-phone', result: succeeded ? 'success' : 'failure', ipAddress: 'gateway', details: { deviceId: String(d._id), commandId, action: d.setup.command.action, code: succeeded ? null : code } });
    emit(d);
    return { ok: true };
  },
};
