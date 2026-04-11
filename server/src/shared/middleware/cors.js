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

    if (config.isDevelopment) {
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

export const corsMiddleware = cors(corsOptions);
export default corsMiddleware;
