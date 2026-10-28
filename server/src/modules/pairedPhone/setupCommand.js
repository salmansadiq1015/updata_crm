export const SETUP_ACTIONS = ['status', 'pair_phone', 'connect_phone', 'disconnect_phone', 'provision_key', 'reconnect_usb'];
export const SETUP_ACTIVE = ['pending', 'running'];
export const SETUP_TTL_MS = 120_000;

export function publicSetup(setup = {}, now = new Date()) {
  const s = setup?.toObject ? setup.toObject() : setup;
  const command = s.command?.id ? { ...s.command } : null;
  if (command && SETUP_ACTIVE.includes(command.state) && new Date(command.expiresAt) <= now) {
    command.state = 'expired';
    command.message = 'The gateway did not finish in time. Check the connection, then request the action again.';
  }
  return { autoConnect: s.autoConnect !== false, playbackGainDb: s.playbackGainDb ?? 0, command };
}
