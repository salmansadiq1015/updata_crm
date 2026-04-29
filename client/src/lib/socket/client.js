import { io } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:9097';

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

  socket = io(SOCKET_URL, {
    auth: { token: accessToken },
    transports: ['polling', 'websocket'],
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
