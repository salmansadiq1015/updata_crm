// Sentry must be imported first so it can instrument Node.js modules
import Sentry from './config/sentry.js';
import { execFileSync } from 'child_process';
import http from 'http';
import net from 'net';
import { performance } from 'node:perf_hooks';
import config from './config/index.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { getRedisClient, disconnectRedis, waitForRedisReady } from './config/redis.js';
import cacheManager from './shared/cache/CacheManager.js';
import queueManager from './shared/queue/QueueManager.js';
import eventBus from './shared/events/EventBus.js';
import EVENT_TYPES from './shared/events/eventTypes.js';
import { seedDatabase } from './seed/seed.js';
import logger from './shared/logger/index.js';

/**
 * Server bootstrap with graceful shutdown.
 *
 * Startup sequence:
 * 1. Connect MongoDB
 * 2. Connect Redis → initialize L2 cache
 * 3. Sync seed data, then load the application and its event handlers
 * 4. Register background jobs
 * 5. Start HTTP server
 * 6. Publish system.started event
 *
 * Shutdown sequence (on SIGTERM/SIGINT):
 * 1. Stop accepting new connections
 * 2. Drain in-flight requests (10s timeout)
 * 3. Close queue workers
 * 4. Disconnect Redis
 * 5. Disconnect MongoDB
 * 6. Exit
 */

let server;

function checkPortAvailable(port, host) {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();

    probe.once('error', reject);
    probe.once('listening', () => {
      probe.close(resolve);
    });

    probe.listen(port, host);
  });
}

function getPortOwnerDetails(port) {
  if (!config.isDevelopment) return null;

  try {
    const output = execFileSync(
      'lsof',
      ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();

    return output || null;
  } catch {
    return null;
  }
}

function handleServerError(err) {
  if (err.code === 'EADDRINUSE') {
    const portOwner = getPortOwnerDetails(config.server.port);

    logger.error(`Port ${config.server.port} is already in use`, {
      module: 'server',
      action: 'listen',
      host: config.server.host,
      port: config.server.port,
      error: { message: err.message, code: err.code },
      ...(portOwner ? { portOwner } : {}),
      hint: `Stop the existing process on port ${config.server.port}, or start this API with PORT=<free-port>.`,
    });
    process.exit(1);
  }

  logger.error('Server error', {
    module: 'server',
    action: 'error',
    error: { message: err.message, code: err.code },
  });
  process.exit(1);
}

async function start() {
  const startedAt = performance.now();
  const logPhase = (phase) => logger.info('Startup phase complete', {
    module: 'server', action: 'startup', phase,
    duration: Math.round(performance.now() - startedAt),
  });
  try {
    // Fail before database/cache/job initialization if another API instance is
    // already bound to the configured port.
    await checkPortAvailable(config.server.port, config.server.host);

    // 1. Connect MongoDB
    await connectDatabase(logger);
    logPhase('database');

    // 2. Connect Redis + init L2 cache
    let redisClient;
    try {
      redisClient = getRedisClient(logger);
      await waitForRedisReady(redisClient);
      cacheManager.initL2(redisClient);

      // In development, flush stale rate-limit counters so a server restart
      // never leaves developers locked out of endpoints like file upload.
      if (config.isDevelopment) {
        try {
          const rlKeys = await redisClient.keys(`${config.redis.keyPrefix}rl:*`);
          if (rlKeys.length > 0) {
            // Strip the keyPrefix that ioredis would re-add before issuing DEL
            const stripped = rlKeys.map(k => k.replace(new RegExp(`^${config.redis.keyPrefix}`), ''));
            await redisClient.del(...stripped);
            logger.debug(`Flushed ${rlKeys.length} stale rate-limit key(s) on dev restart`, { module: 'server' });
          }
        } catch {
          // Non-fatal — startup continues
        }
      }
    } catch (err) {
      logger.warn('Redis connection failed — running without L2 cache', {
        module: 'server',
        action: 'startup',
        error: { message: err.message },
      });
    }
    logPhase('redis');

    // 2.5. Sync seed definitions on every boot, preserving existing data.
    try {
      await seedDatabase();
    } catch (err) {
      logger.warn('Database seeding failed — continuing startup', {
        module: 'server',
        action: 'startup',
        error: { message: err.message },
      });
    }
    logPhase('seed');

    // Load the full application after seeding. Importing every route first
    // registers hundreds of models whose automatic index checks saturate the
    // database pool before the bootstrap queries can run.
    const { createApp, registerJobs, initializeSocketServer, registerDiscoverySocket, registerEventHandlers } = await import('./runtime.js');
    registerEventHandlers();
    logPhase('application');

    // 3. Create Express app
    const app = createApp();

    // 4. Register background jobs
    try {
      registerJobs();
    } catch (err) {
      logger.warn('Job registration failed — running without background jobs', {
        module: 'server',
        action: 'startup',
        error: { message: err.message },
      });
    }

    // 5. Start HTTP server + Socket.IO
    server = http.createServer(app);
    initializeSocketServer(server);
    // Discovery realtime: subscribe/unsubscribe handlers + progress emit bridge (uses global.io)
    registerDiscoverySocket(global.io);

    server.on('error', handleServerError);

    server.listen(config.server.port, config.server.host, () => {
      logger.info(`Server started on ${config.server.host}:${config.server.port}`, {
        module: 'server',
        action: 'startup',
        port: config.server.port,
        env: config.env,
        duration: Math.round(performance.now() - startedAt),
      });

      // 6. Publish startup event
      eventBus.publish(EVENT_TYPES.SYSTEM_STARTED, {
        version: process.env.npm_package_version || '1.0.0',
        environment: config.env,
        port: config.server.port,
      });
    });
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      handleServerError(err);
      return;
    }

    logger.error('Failed to start server', {
      module: 'server',
      action: 'startup',
      error: { message: err.message, stack: err.stack },
    });
    process.exit(1);
  }
}

/**
 * Graceful shutdown.
 * Drains in-flight requests before closing connections.
 */
async function shutdown(signal) {
  logger.info(`${signal} received — starting graceful shutdown`, {
    module: 'server',
    action: 'shutdown',
  });

  // 1. Close Socket.IO connections
  if (global.io) {
    global.io.close();
    logger.info('Socket.IO closed', { module: 'server' });
  }

  // 2. Stop accepting new connections
  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
      // Force close after 10 seconds
      setTimeout(() => {
        logger.warn('Forcing shutdown after timeout', { module: 'server' });
        resolve();
      }, 10000);
    });
    logger.info('HTTP server closed', { module: 'server' });
  }

  // 2. Close queue workers
  try {
    await queueManager.shutdown();
  } catch (err) {
    logger.error('Error shutting down queues', {
      module: 'server',
      error: { message: err.message },
    });
  }

  // 3. Disconnect Redis
  try {
    await disconnectRedis(logger);
  } catch (err) {
    logger.error('Error disconnecting Redis', {
      module: 'server',
      error: { message: err.message },
    });
  }

  // 4. Disconnect MongoDB
  try {
    await disconnectDatabase(logger);
  } catch (err) {
    logger.error('Error disconnecting MongoDB', {
      module: 'server',
      error: { message: err.message },
    });
  }

  // 5. Flush Sentry events before exit
  if (Sentry) {
    try {
      await Sentry.flush(2000);
    } catch {
      // Best-effort — don't block shutdown
    }
  }

  logger.info('Graceful shutdown complete', { module: 'server' });
  process.exit(0);
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Catch unhandled errors at process level
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', {
    module: 'server',
    action: 'unhandledRejection',
    error: { message: reason?.message || String(reason), stack: reason?.stack },
  });
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception — shutting down', {
    module: 'server',
    action: 'uncaughtException',
    error: { message: err.message, stack: err.stack },
  });
  shutdown('uncaughtException');
});

// Start the server
start();
