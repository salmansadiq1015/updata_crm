/**
 * Realtime bridge for Business Discovery (Module 15).
 *
 * The worker writes progress/results/completion to Mongo and mirrors them to the
 * client over Socket.IO (design §12 realtime). Clients subscribe to a per-session
 * room — `discovery:session:<id>` — and receive `discovery:progress`,
 * `discovery:result` and `discovery:completed` events. The event names + room are
 * part of the client contract (`use-discovery-realtime`) and must match exactly.
 *
 * Mirrors the pattern in {@link ../ai/ai.events.js}: emit helpers go straight
 * through `global.io`, so the worker never holds a socket reference.
 *
 * SCOPING: a subscription is only honored when the session belongs to the
 * socket's authenticated user (identity comes from `socket.userId`, set by the
 * JWT handshake in socketServer.js — never from the payload).
 *
 * NOTE: server.js (the orchestrator) must call `registerDiscoverySocket(io)`
 * once, after the Socket.IO server is initialized.
 */

import logger from '../../shared/logger/index.js';
import discoveryRepository from './discovery.repository.js';

const LOG_MODULE = 'businessDiscovery';

/** Room name for a session's realtime channel. */
export function discoveryRoom(sessionId) {
  return `discovery:session:${sessionId}`;
}

/**
 * Register the per-connection subscribe/unsubscribe handlers. Called once by the
 * orchestrator with the shared Socket.IO server.
 */
export function registerDiscoverySocket(io) {
  if (!io) return;

  io.on('connection', (socket) => {
    socket.on('discovery:subscribe', async ({ sessionId } = {}) => {
      if (!sessionId || !socket.userId) return;
      try {
        // Ownership check — the session must belong to this user.
        const session = await discoveryRepository.getSessionById(sessionId, { createdBy: socket.userId });
        if (!session) {
          logger.warn('Rejected discovery subscription (not owner / not found)', {
            module: LOG_MODULE,
            action: 'socket.subscribe',
            sessionId: String(sessionId),
          });
          return;
        }
        socket.join(discoveryRoom(sessionId));
      } catch (err) {
        logger.warn('Discovery subscription failed', {
          module: LOG_MODULE,
          action: 'socket.subscribe',
          error: { message: err.message },
        });
      }
    });

    socket.on('discovery:unsubscribe', ({ sessionId } = {}) => {
      if (!sessionId) return;
      socket.leave(discoveryRoom(sessionId));
    });
  });

  logger.info('Discovery socket handlers registered', {
    module: LOG_MODULE,
    action: 'events.register',
  });
}

// ─── Emit helpers used by the worker (go straight through global.io) ───

/** Emit a live progress update to a session's room. */
export function emitDiscoveryProgress(sessionId, payload = {}) {
  if (!sessionId) return;
  global.io?.to(discoveryRoom(sessionId)).emit('discovery:progress', payload);
}

/** Emit a batch-of-results signal to a session's room. */
export function emitDiscoveryResult(sessionId, payload = {}) {
  if (!sessionId) return;
  global.io?.to(discoveryRoom(sessionId)).emit('discovery:result', payload);
}

/** Emit the terminal (completed / partial / cancelled / failed) event to a session's room. */
export function emitDiscoveryCompleted(sessionId, payload = {}) {
  if (!sessionId) return;
  global.io?.to(discoveryRoom(sessionId)).emit('discovery:completed', payload);
}

export default {
  registerDiscoverySocket,
  emitDiscoveryProgress,
  emitDiscoveryResult,
  emitDiscoveryCompleted,
  discoveryRoom,
};
