// Live updates for incoming calls from the CRM's Socket.IO server (server/src/shared/socket/
// socketServer.js), which emits `inbound-call:*` events to the owner's `user:<id>` room.
//
// The app has no socket.io-client dependency, so this speaks the small part of the
// Engine.IO v4 / Socket.IO v4 wire protocol it needs over React Native's built-in WebSocket:
//   server "0{…}" open → client "40{token}" connect (JWT, same check as the web client)
//   server "40…" connected · "44{…}" connect error · "2" ping → client "3" pong
//   server "42[name, payload]" event.
// It is an optimisation only: every screen keeps polling (faster while a call is active),
// so a blocked or dropped socket never hides a call.
import { getEnv } from '@/config/env';
import { tokenManager } from '@/services/auth/tokenManager';
import { logger } from '@/services/logging/logger';

export type InboundEvent = { name: string; payload: unknown };
type Listener = (event: InboundEvent) => void;

export type Packet =
  | { type: 'open'; pingInterval: number; pingTimeout: number }
  | { type: 'ping' }
  | { type: 'connected' }
  | { type: 'connectError'; message: string }
  | { type: 'disconnect' }
  | { type: 'close' }
  | { type: 'event'; name: string; payload: unknown }
  | { type: 'other' };

/** ws(s)://host/socket.io/… from the API base URL (which ends in /api/v1). */
export function socketUrl(apiUrl: string): string {
  const origin = apiUrl
    .replace(/\/+$/, '')
    .replace(/\/api\/v\d+$/i, '')
    .replace(/^http/i, 'ws');
  return `${origin}/socket.io/?EIO=4&transport=websocket`;
}

const safeJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export function parsePacket(raw: string): Packet {
  if (raw.startsWith('0')) {
    const open = safeJson(raw.slice(1)) as { pingInterval?: number; pingTimeout?: number } | null;
    return {
      type: 'open',
      pingInterval: Number(open?.pingInterval) || 25_000,
      pingTimeout: Number(open?.pingTimeout) || 20_000,
    };
  }
  if (raw === '1') return { type: 'close' };
  if (raw === '2') return { type: 'ping' };
  if (raw.startsWith('40')) return { type: 'connected' };
  if (raw.startsWith('41')) return { type: 'disconnect' };
  if (raw.startsWith('44')) {
    const body = safeJson(raw.slice(2)) as { message?: string } | null;
    return { type: 'connectError', message: body?.message ?? 'connect_error' };
  }
  if (raw.startsWith('42')) {
    // Default namespace, no ack id expected; tolerate "42<ackId>[…]" anyway.
    const start = raw.indexOf('[');
    const body = start >= 0 ? safeJson(raw.slice(start)) : null;
    if (Array.isArray(body) && typeof body[0] === 'string') {
      return { type: 'event', name: body[0], payload: body[1] ?? null };
    }
  }
  return { type: 'other' };
}

const listeners = new Set<Listener>();
const statusListeners = new Set<() => void>();
let socket: WebSocket | null = null;
let connected = false;
let attempt = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let watchdog: ReturnType<typeof setTimeout> | null = null;

const setConnected = (value: boolean) => {
  if (connected === value) return;
  connected = value;
  statusListeners.forEach((fn) => fn());
};

const clearTimers = () => {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (watchdog) clearTimeout(watchdog);
  reconnectTimer = null;
  watchdog = null;
};

function teardown() {
  clearTimers();
  const s = socket;
  socket = null;
  setConnected(false);
  if (s) {
    s.onopen = null;
    s.onmessage = null;
    s.onerror = null;
    s.onclose = null;
    try {
      s.close();
    } catch {
      /* already closed */
    }
  }
}

function scheduleReconnect() {
  teardown();
  if (listeners.size === 0) return;
  // 2 s, 4 s, 8 s … capped at 30 s. Polling covers the gap.
  const delay = Math.min(30_000, 2_000 * 2 ** Math.min(attempt, 4));
  attempt += 1;
  reconnectTimer = setTimeout(connect, delay);
}

function armWatchdog(ms: number) {
  if (watchdog) clearTimeout(watchdog);
  // No ping within interval + timeout: the link is dead even if the OS did not say so.
  watchdog = setTimeout(scheduleReconnect, ms);
}

function connect() {
  reconnectTimer = null;
  if (socket || listeners.size === 0 || typeof WebSocket === 'undefined') return;
  const token = tokenManager.getAccessToken();
  if (!token) return;
  let pingWindow = 45_000;
  let ws: WebSocket;
  try {
    ws = new WebSocket(socketUrl(getEnv().apiUrl));
  } catch (error) {
    logger.debug('inbound.socket.open_failed', { error: String(error) });
    scheduleReconnect();
    return;
  }
  socket = ws;
  ws.onmessage = (message: { data?: unknown }) => {
    if (typeof message.data !== 'string') return;
    const packet = parsePacket(message.data);
    switch (packet.type) {
      case 'open':
        pingWindow = packet.pingInterval + packet.pingTimeout;
        armWatchdog(pingWindow);
        // Read the token again: it may have been refreshed while the socket opened.
        ws.send(`40${JSON.stringify({ token: tokenManager.getAccessToken() ?? token })}`);
        break;
      case 'connected':
        attempt = 0;
        setConnected(true);
        break;
      case 'ping':
        armWatchdog(pingWindow);
        ws.send('3');
        break;
      case 'event':
        if (packet.name.startsWith('inbound-call:')) {
          listeners.forEach((fn) => fn({ name: packet.name, payload: packet.payload }));
        }
        break;
      case 'connectError':
        logger.debug('inbound.socket.rejected', { message: packet.message });
        scheduleReconnect();
        break;
      case 'disconnect':
      case 'close':
        scheduleReconnect();
        break;
      default:
        break;
    }
  };
  ws.onerror = () => scheduleReconnect();
  ws.onclose = () => {
    if (socket === ws) scheduleReconnect();
  };
}

/** Receive `inbound-call:*` events. The connection lives while at least one listener is subscribed. */
export function subscribeInboundEvents(listener: Listener): () => void {
  listeners.add(listener);
  if (!socket && !reconnectTimer) {
    attempt = 0;
    connect();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      attempt = 0;
      teardown();
    }
  };
}

export function isInboundSocketConnected(): boolean {
  return connected;
}

export function subscribeInboundSocketStatus(callback: () => void): () => void {
  statusListeners.add(callback);
  return () => statusListeners.delete(callback);
}
