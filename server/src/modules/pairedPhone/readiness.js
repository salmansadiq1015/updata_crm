/**
 * Can this paired phone take the next campaign call right now? Pure, so every rule is unit-tested.
 * `ok` only when every check passes; `retryInMs` says when to look again for waits that clear by
 * themselves (cooldown, hourly cap); `blocking` reasons need a person.
 */

export const HEARTBEAT_STALE_MS = 20_000;

const REASON_TEXT = {
  revoked: 'Device was revoked',
  audio_not_verified: 'Two-way call audio has not been verified on this device yet',
  gateway_offline: 'The laptop gateway is offline',
  board_disconnected: 'The ESP32 board is not connected to the laptop',
  key_not_provisioned: 'The dial key is not provisioned on the ESP32',
  phone_not_connected: 'The phone is not connected to the ESP32 over Bluetooth (hands-free)',
  phone_in_call: 'The phone is already in a call',
  device_busy: 'The device is handling another call',
  needs_attention: 'A previous call ended with an unknown outcome; check the phone and clear it',
  cooldown: 'Cooling down between calls',
  hourly_cap: 'Hourly call limit reached',
  daily_cap: 'Daily call limit reached',
  firmware_fault: 'The ESP32 reports a fault',
};

export const reasonText = (code) => REASON_TEXT[code] || code;

/**
 * @param device lean PairedDevice
 * @param {{ now?: Date, callsLastHour?: number, callsToday?: number }} usage
 */
export function deviceReadiness(device, { now = new Date(), callsLastHour = 0, callsToday = 0 } = {}) {
  const reasons = [];
  let retryInMs = null;
  const nowMs = now.getTime();
  const limits = { cooldownSeconds: 60, maxCallsPerHour: 20, maxCallsPerDay: 100, ...(device?.limits || {}) };
  const online = Boolean(device?.lastHeartbeatAt) && nowMs - new Date(device.lastHeartbeatAt).getTime() <= HEARTBEAT_STALE_MS;

  if (!device) return { ok: false, online: false, reasons: ['revoked'], blocking: true, retryInMs: null };
  if (device.revokedAt) reasons.push('revoked');
  if (!device.audioVerifiedAt) reasons.push('audio_not_verified');
  if (!online) reasons.push('gateway_offline');
  if (online && !device.board?.connected) reasons.push('board_disconnected');
  if (online && device.board?.connected && device.state?.device === 'fault') reasons.push('firmware_fault');
  if (online && device.board?.connected && !device.board?.keyProvisioned) reasons.push('key_not_provisioned');
  if (online && device.board?.connected && device.state?.hfp !== 'slc') reasons.push('phone_not_connected');
  if (online && (device.state?.call || device.state?.callsetup) && !device.currentCallId) reasons.push('phone_in_call');
  if (device.attention?.needed) reasons.push('needs_attention');
  if (device.currentCallId) reasons.push('device_busy');

  if (device.lastCallEndedAt) {
    const wait = new Date(device.lastCallEndedAt).getTime() + limits.cooldownSeconds * 1000 - nowMs;
    if (wait > 0) {
      reasons.push('cooldown');
      retryInMs = wait;
    }
  }
  if (callsLastHour >= limits.maxCallsPerHour) {
    reasons.push('hourly_cap');
    retryInMs = Math.max(retryInMs || 0, 5 * 60_000);
  }
  if (callsToday >= limits.maxCallsPerDay) {
    reasons.push('daily_cap');
    retryInMs = Math.max(retryInMs || 0, 60 * 60_000);
  }
  const selfClearing = new Set(['cooldown', 'hourly_cap', 'daily_cap', 'device_busy', 'gateway_offline', 'phone_not_connected', 'board_disconnected', 'phone_in_call']);
  return {
    ok: reasons.length === 0,
    online,
    reasons,
    messages: reasons.map(reasonText),
    blocking: reasons.some((r) => !selfClearing.has(r)),
    retryInMs: reasons.length ? (retryInMs ?? 30_000) : 0,
  };
}
