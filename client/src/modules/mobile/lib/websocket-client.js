'use client';

import { io } from 'socket.io-client';
import { resolveApiOrigin } from '@/lib/api/config';

let socket = null;

function getSocketUrl() {
  const configured = process.env.NEXT_PUBLIC_SOCKET_URL?.trim();
  if (configured) return configured;
  const origin = resolveApiOrigin();
  if (origin) return origin;
  return 'http://localhost:9097';
}

export function getSocket(token) {
  if (socket?.connected) return socket;

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(getSocketUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity,
    timeout: 10000,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getExistingSocket() {
  return socket;
}
