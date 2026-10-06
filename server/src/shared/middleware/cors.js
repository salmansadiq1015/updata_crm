import cors from 'cors';
import config from '../../config/index.js';

/**
 * CORS configuration.
 *
 * Production: strict origin whitelist from ALLOWED_ORIGINS env var.
 * Development: allows localhost origins with credentials.
 * Never wildcard '*' in production with credentials.
 */
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, server-to-server)
    if (!origin) return callback(null, true);

    // Development convenience is restricted to loopback web origins. Allowing
    // every origin here also trusts every unpacked Chrome extension whenever a
    // server is accidentally deployed with NODE_ENV=development.
    if (config.isDevelopment && isLoopbackOrigin(origin)) {
      return callback(null, true);
    }

    if (config.client.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Requested-With'],
  exposedHeaders: ['X-Request-Id', 'X-Response-Time', 'Retry-After'],
  maxAge: 86400, // Preflight cache: 24 hours
};

function isLoopbackOrigin(origin) {
  try {
    const url = new URL(origin);
    return ['http:', 'https:'].includes(url.protocol)
      && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

export const corsMiddleware = cors(corsOptions);
export default corsMiddleware;
