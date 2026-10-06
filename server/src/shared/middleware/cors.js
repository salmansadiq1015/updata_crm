import cors from 'cors';
import config from '../../config/index.js';
import { AuthorizationError } from '../errors/AppError.js';

// The manifest public key pins this ID for unpacked and packaged builds. Keep
// the allowlist exact: authentication tokens must never be exposed to arbitrary
// extensions installed in the same browser.
export const LEAD_FINDER_EXTENSION_ID = 'bnmjibohjdkkibimeknikhnolhlbgmnk';
export const LEAD_FINDER_EXTENSION_ORIGIN = `chrome-extension://${LEAD_FINDER_EXTENSION_ID}`;

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

    if (isCorsOriginAllowed(origin)) {
      return callback(null, true);
    }

    callback(new AuthorizationError('Origin not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Requested-With'],
  exposedHeaders: ['X-Request-Id', 'X-Response-Time', 'Retry-After'],
  maxAge: 86400, // Preflight cache: 24 hours
};

export function isCorsOriginAllowed(origin) {
  return origin === LEAD_FINDER_EXTENSION_ORIGIN
    || config.client.allowedOrigins.includes(origin)
    || (config.isDevelopment && isLoopbackOrigin(origin));
}

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
