import type { PairedDevice } from './types/ai-calling-types';

// Same heartbeat lifetime as the CRM. Cached connection flags cease to be live
// even when the browser has not received the next poll/socket update yet.
const HEARTBEAT_STALE_MS = 20_000;

export function pairedPhoneConnection(d: PairedDevice, now = Date.now()) {
  const reportedAt = d.lastHeartbeatAt ? Date.parse(d.lastHeartbeatAt) : NaN;
  const gatewayOnline = d.online && Number.isFinite(reportedAt) && now - reportedAt <= HEARTBEAT_STALE_MS;
  const board = !gatewayOnline ? 'unknown' : !d.board.connected ? 'disconnected'
    : d.state.device === 'fault' ? 'fault' : 'connected';
  const phone = board !== 'connected' ? 'unknown' : d.state.hfp === 'slc' ? 'connected'
    : ['connecting', 'connected'].includes(d.state.hfp) ? 'connecting' : 'disconnected';
  return { gatewayOnline, board, phone } as const;
}
