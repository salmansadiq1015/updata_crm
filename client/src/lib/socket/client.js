import { io } from 'socket.io-client';
import { resolveApiOrigin } from '@/lib/api/config';

function getSocketUrl() {
  const configured = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
  if (configured) return configured;
  const origin = resolveApiOrigin();
  if (origin) return origin;
  return 'http://localhost:9097';
}

let socket = null;

// Subscribers notified on every socket connect (initial + reconnects)
const connectHandlers = new Set();

export function getSocket() {
  return socket;
}

/**
 * Register a callback that fires whenever the socket connects.
 * If the socket is already connected, the callback fires immediately (sync).
 * Returns an unsubscribe function.
 */
export function onSocketConnect(fn) {
  connectHandlers.add(fn);
  if (socket?.connected) fn(socket);
  return () => connectHandlers.delete(fn);
}

export function connectSocket(accessToken) {
  if (socket?.connected) return socket;
  if (socket) {
    socket.disconnect();
  }

  socket = io(getSocketUrl(), {
    auth: { token: accessToken },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 10,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket.id);
    connectHandlers.forEach((fn) => fn(socket));
  });

  socket.on('connect_error', (err) => {
    if (err.message === 'Authentication required' || err.message === 'Authentication failed') {
      console.warn('[Socket] Auth rejected — stopping reconnection');
      socket.disconnect();
      return;
    }
    console.error('[Socket] Connection error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
