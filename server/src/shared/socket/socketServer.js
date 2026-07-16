import { Server as SocketIOServer } from 'socket.io';
import { verifyToken } from '../utils/crypto.js';
import logger from '../logger/index.js';

// ─── Connected users: userId → Set<socketId> ──────────────
const connectedUsers = new Map();
let socketServer = null;

/**
 * Check if a user has at least one active socket connection.
 */
export function isUserOnline(userId) {
  const sockets = connectedUsers.get(String(userId));
  return sockets ? sockets.size > 0 : false;
}

/**
 * Get the number of active socket connections for a user.
 */
export function getConnectedSocketCount(userId) {
  const sockets = connectedUsers.get(String(userId));
  return sockets ? sockets.size : 0;
}

export function emitTaskRealtimeEvent(eventName, payload) {
  if (!socketServer) return false;
  socketServer.to('tasks:workspace').emit(eventName, payload);
  if (payload?.listId) {
    socketServer.to(`tasks:list:${payload.listId}`).emit(eventName, payload);
  }
  return true;
}

export function emitTimeTrackingRealtimeEvent(payload = {}) {
  if (!socketServer) return false;
  socketServer.to('time-tracking:workspace').emit('time-tracking:updated', {
    ...payload,
    emittedAt: new Date().toISOString(),
  });
  return true;
}

// ─── Lazy-load models to avoid circular deps ──────────────
let UserModel = null;
async function getUserModel() {
  if (!UserModel) {
    try {
      UserModel = (await import('../../modules/auth/user.model.js')).default;
    } catch { /* model not available */ }
  }
  return UserModel;
}

/**
 * Deliver pending PUSH notifications on socket reconnect.
 * Queries NotificationDelivery for PENDING push items and emits them.
 */
async function deliverPendingNotifications(userId, io) {
  try {
    const deliveryRepo = (await import('../../modules/notifications/notificationDelivery.repository.js')).default;
    const notifRepo = (await import('../../modules/notifications/notification.repository.js')).default;
    const { buildNotificationDeepLink } = await import('../../modules/notifications/notificationDeepLink.js');

    const pendingDeliveries = await deliveryRepo.findPendingPush(userId, 50);
    if (pendingDeliveries.length === 0) return;

    logger.info(`Delivering ${pendingDeliveries.length} pending push notifications on reconnect`, {
      module: 'socket',
      action: 'deliverPending',
      userId: String(userId),
      count: pendingDeliveries.length,
    });

    for (const delivery of pendingDeliveries) {
      try {
        // Enrich content from parent notification
        let title = delivery.renderedSubject || 'Notification';
        let body = delivery.renderedBody || '';
        let category = 'SYSTEM';
        let priority = 'NORMAL';
        let deepLink = null;
        let icon = null;
        let relatedEntityType = null;
        let relatedEntityId = null;

        if (delivery.notificationId) {
          const notification = await notifRepo.findById(delivery.notificationId);
          if (notification) {
            category = notification.category || 'SYSTEM';
            priority = notification.priority || 'NORMAL';
            deepLink = notification.payload?.deepLink
              || buildNotificationDeepLink(notification.sourceEntityType, notification.sourceEntityId);
            icon = notification.payload?.icon || null;
            relatedEntityType = notification.sourceEntityType || null;
            relatedEntityId = notification.sourceEntityId || null;
          }
        }

        const payload = {
          deliveryId: delivery._id.toString(),
          notificationId: delivery.notificationId?.toString(),
          category,
          priority,
          title,
          body,
          icon,
          deepLink,
          relatedEntityType,
          relatedEntityId,
          sentAt: new Date().toISOString(),
        };

        io.to(String(userId)).emit('pushNotification', payload);

        await deliveryRepo.updateById(delivery._id, {
          status: 'SENT',
          sentAt: new Date(),
          providerMessageId: `ws-reconnect-${delivery._id}`,
        });
      } catch (err) {
        logger.warn('Failed to deliver pending notification', {
          module: 'socket',
          deliveryId: delivery._id?.toString(),
          error: err.message,
        });
      }
    }
  } catch (err) {
    logger.error('Failed to flush pending notifications', {
      module: 'socket',
      action: 'deliverPending',
      userId: String(userId),
      error: { message: err.message },
    });
  }
}

/**
 * Initialize Socket.IO server with JWT authentication and notification support.
 * Sets global.io for use by notification adapters.
 */
export function initializeSocketServer(httpServer) {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? (process.env.ALLOWED_ORIGINS || process.env.CLIENT_URI || '').split(',').map((s) => s.trim()).filter(Boolean)
        : true,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });
  socketServer = io;

  // ─── JWT Authentication Middleware ──────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = verifyToken(token);
      socket.userId = decoded.sub;
      socket.sessionId = decoded.sid || null;
      next();
    } catch (err) {
      logger.warn('Socket authentication failed', {
        module: 'socket',
        action: 'auth',
        error: err.message,
      });
      return next(new Error('Authentication failed'));
    }
  });

  // ─── Connection Handler ─────────────────────────────────
  io.on('connection', async (socket) => {
    const userId = socket.userId;

    if (!userId) {
      socket.disconnect(true);
      return;
    }

    // Track connected socket (multi-device support)
    if (!connectedUsers.has(userId)) {
      connectedUsers.set(userId, new Set());
    }
    connectedUsers.get(userId).add(socket.id);

    // Join personal notification room
    socket.join(userId);

    // Join personal room for sidebar notifications
    socket.join(`user:${socket.userId}`);

    logger.info('Socket connected', {
      module: 'socket',
      action: 'connect',
      userId,
      socketId: socket.id,
      activeConnections: connectedUsers.get(userId).size,
    });

    // Update online status — fire-and-forget so the socket.on(...) listeners below
    // (tasks:subscribe, etc.) register synchronously in this same tick. If we awaited
    // here, a client emitting tasks:subscribe right after connect would race ahead of
    // its handler and never join the room (realtime silently broken until reload).
    (async () => {
      try {
        const User = await getUserModel();
        if (User) {
          await User.findByIdAndUpdate(userId, { isOnline: true });
        }
        io.emit('userStatus', { userId, isOnline: true });
        // Hydrate new client with current online roster
        const onlineUserIds = Array.from(connectedUsers.keys());
        socket.emit('userStatus:init', { onlineUserIds });
      } catch (err) {
        logger.warn('Failed to update online status', { module: 'socket', userId, error: err.message });
      }
    })();

    // Flush pending push notifications on reconnect
    deliverPendingNotifications(userId, io);

    // ─── Notification Acknowledgment ─────────────────────
    socket.on('ack:notification', async ({ deliveryId }) => {
      if (!deliveryId) return;
      try {
        const deliveryRepo = (await import('../../modules/notifications/notificationDelivery.repository.js')).default;
        await deliveryRepo.updateById(deliveryId, {
          status: 'DELIVERED',
          deliveredAt: new Date(),
        });
      } catch (err) {
        logger.warn('Failed to ack notification', { module: 'socket', deliveryId, error: err.message });
      }
    });

    socket.on('tasks:subscribe', ({ listId } = {}) => {
      socket.join('tasks:workspace');
      if (listId) socket.join(`tasks:list:${listId}`);
    });

    socket.on('tasks:unsubscribe', ({ listId } = {}) => {
      socket.leave('tasks:workspace');
      if (listId) socket.leave(`tasks:list:${listId}`);
    });

    socket.on('time-tracking:subscribe', () => {
      socket.join('time-tracking:workspace');
    });

    socket.on('time-tracking:unsubscribe', () => {
      socket.leave('time-tracking:workspace');
    });

    // ─── Chat Events (preserved from existing) ───────────
    socket.on('join chat', (room) => {
      socket.join(room);
    });

    socket.on('NewMessageAdded', (data) => {
      try {
        const { chatId } = data || {};
        if (chatId) {
          io.to(chatId).emit('fetchMessages', data);
          io.to(chatId).emit('newMessageSummary', data);
        } else {
          io.emit('fetchMessages', data);
        }
      } catch (err) {
        logger.error('Error emitting NewMessageAdded', { module: 'socket', error: err.message });
      }
    });

    socket.on('typing', (room) => {
      socket.in(room).emit('typing');
    });

    socket.on('stop typing', (room) => {
      socket.in(room).emit('stop typing');
    });

    socket.on('notification', (notification) => {
      io.emit('newNotification', notification);
    });

    socket.on('messageReaction', ({ chatId, reaction }) => {
      if (chatId && reaction) {
        io.to(chatId).emit('messageReaction', { chatId, reaction });
      }
    });

    socket.on('markRead', ({ chatId, userId: readUserId }) => {
      if (chatId) {
        io.to(chatId).emit('messagesRead', { chatId, userId: readUserId });
      }
    });

    socket.on('messageEdited', ({ chatId, messageId, message }) => {
      if (chatId && messageId) {
        io.to(chatId).emit('messageEdited', { chatId, messageId, message });
      }
    });

    socket.on('messageDeleted', ({ chatId, messageId }) => {
      if (chatId && messageId) {
        io.to(chatId).emit('messageDeleted', { chatId, messageId });
      }
    });

    socket.on('messageUpdated', ({ chatId, messageId, message }) => {
      if (chatId && messageId) {
        io.to(chatId).emit('messageUpdated', { chatId, messageId, message });
      }
    });

    // ─── Room-based Chat Events ──────────────────────────
    socket.on('join room', ({ roomId }) => {
      if (roomId) socket.join(`room:${roomId}`);
    });

    socket.on('chat:typing', ({ roomId, userName }) => {
      if (roomId) {
        socket.to(`room:${roomId}`).emit('chat:typing', {
          roomId,
          userId: socket.userId,
          userName: userName || 'Unknown',
        });
      }
    });

    socket.on('chat:stop typing', ({ roomId }) => {
      if (roomId) {
        socket.to(`room:${roomId}`).emit('chat:stop typing', {
          roomId,
          userId: socket.userId || socket.user?._id,
        });
      }
    });

    // ─── Disconnect ──────────────────────────────────────
    socket.on('disconnect', async () => {
      const sockets = connectedUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          connectedUsers.delete(userId);

          // User fully offline
          try {
            const User = await getUserModel();
            if (User) {
              await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen: new Date() });
            }
            io.emit('userStatus', { userId, isOnline: false });
          } catch (err) {
            logger.warn('Failed to update offline status', { module: 'socket', userId, error: err.message });
          }
        }
      }

      logger.debug('Socket disconnected', {
        module: 'socket',
        action: 'disconnect',
        userId,
        socketId: socket.id,
        remaining: connectedUsers.get(userId)?.size || 0,
      });
    });
  });

  // Set global.io for notification adapters
  global.io = io;

  logger.info('Socket.IO initialized with JWT auth', {
    module: 'socket',
    action: 'init',
  });

  return io;
}
