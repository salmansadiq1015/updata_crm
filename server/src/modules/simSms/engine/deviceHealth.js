/**
 * Android SMS device health — pure derivation from the last heartbeat (no I/O).
 *
 *   online  : heartbeat < 10 min ago and nothing that blocks sending
 *   warning : online, but something needs attention (permission, SIM, queue…)
 *   offline : no heartbeat for ≥ 10 min (the phone can't be reached)
 *
 * Reasons carry a severity: 'critical' (sending is blocked), 'warning'
 * (degraded / needs a human), 'info' (FYI). Status is warning when any
 * critical/warning reason exists.
 */
export const ONLINE_WINDOW_MS = 10 * 60_000;
export const STALE_QUEUE_MS = 30 * 60_000;
export const HISTORY_LIMIT = 50;

/** Compare dotted versions numerically ("0.1.10" > "0.1.9"). */
export function compareVersions(a, b) {
  const pa = String(a || '').split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);
  const pb = String(b || '').split(/[.+-]/).map((x) => Number.parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
  }
  return 0;
}

/** Mask a SIM-reported number: only the last 4 digits survive. */
export function maskNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : '••••';
}

/**
 * @param {object} device  SmsDevice document (lean)
 * @param {{ now?: Date, minAppVersion?: string|null }} opts
 * @returns {{ status:'online'|'warning'|'offline', online:boolean, reasons:{code:string,severity:string}[], lastSeenMs:number|null }}
 */
export function deriveHealth(device, { now = new Date(), minAppVersion = null } = {}) {
  const reasons = [];
  const add = (code, severity) => reasons.push({ code, severity });
  const last = device?.lastHeartbeatAt ? new Date(device.lastHeartbeatAt).getTime() : null;
  const lastSeenMs = last == null ? null : now.getTime() - last;
  const online = last != null && lastSeenMs < ONLINE_WINDOW_MS;
  if (!online) add('offline', 'critical');

  const perms = device?.permissions || {};
  const smsBuild = device?.buildProfile === 'private' || perms.smsDeclared === true;
  if (perms.sendSms === false) add('missing_permission_send_sms', 'critical');
  if (smsBuild && perms.receiveSms === false) add('missing_permission_receive_sms', 'warning');
  if (perms.readPhoneState === false) add('missing_permission_read_phone_state', 'warning');
  if (perms.postNotifications === false) add('missing_permission_notifications', 'warning');
  if (perms.batteryOptimizationIgnored === false) add('battery_optimization_on', 'warning');

  const sims = Array.isArray(device?.sims) ? device.sims : [];
  if (device?.simState && device.simState !== 'ready') add('no_sim', 'critical');
  else if (!sims.length && device?.simState !== 'ready') add('no_sim', 'critical');
  if (sims.length > 1 && !sims.some((s) => s.selected)) add('no_sim_selected', 'info');

  const net = device?.network || {};
  if (net.airplaneMode) add('airplane_mode', 'critical');
  else if (net.connected === false) add('network_offline', 'critical');

  const q = device?.queue || {};
  if ((q.unknown || 0) > 0) add('unknown_results_pending', 'warning');
  if ((q.failed || 0) > 0) add('failed_results_pending', 'info');
  const lastActivity = Math.max(
    device?.last?.leaseAt ? new Date(device.last.leaseAt).getTime() : 0,
    device?.last?.resultPostAt ? new Date(device.last.resultPostAt).getTime() : 0,
  );
  if (((q.pending || 0) + (q.attempting || 0)) > 0 && (!lastActivity || now.getTime() - lastActivity > STALE_QUEUE_MS)) add('stale_queue', 'warning');
  if ((device?.journalMismatch?.count || 0) > 0) add('journal_mismatch', 'warning');
  if (device?.resyncRequestedAt && (!device.resyncCompletedAt || new Date(device.resyncCompletedAt) < new Date(device.resyncRequestedAt))) add('resync_pending', 'info');

  if (minAppVersion && device?.appVersion && compareVersions(device.appVersion, minAppVersion) < 0) add('outdated_app', 'warning');
  if (device?.lastError?.code && device.lastError.at && now.getTime() - new Date(device.lastError.at).getTime() < 60 * 60_000) add('recent_error', 'info');

  const status = !online ? 'offline' : (reasons.some((r) => r.severity === 'critical' || r.severity === 'warning') ? 'warning' : 'online');
  return { status, online, reasons, lastSeenMs };
}

/** Queue gauge fractions for the dashboard (0..1 of a soft capacity). */
export function queueLoad(queue = {}, capacity = 50) {
  const total = (queue.pending || 0) + (queue.attempting || 0) + (queue.unknown || 0) + (queue.failed || 0);
  return { total, ratio: Math.min(1, total / capacity) };
}
