import winston from 'winston';
import crypto from 'crypto';
import config from '../../config/index.js';

/**
 * Structured JSON logger with PII masking.
 *
 * Design decisions:
 * - Winston over pino: wider ecosystem, built-in transports, sufficient performance
 *   for our scale (pino is faster but we're not logging >10K/sec).
 * - JSON format in production for ELK/CloudWatch ingestion.
 * - Colorized console in development for readability.
 * - PII fields (email, phone, name) are hashed before logging.
 * - Every log entry carries: timestamp, level, message, service name.
 */

const PII_FIELDS = ['email', 'phone', 'firstName', 'lastName', 'name', 'password', 'token', 'authorization'];

function hashPii(value) {
  if (!value || typeof value !== 'string') return value;
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex').slice(0, 12)}`;
}

function maskPiiInObject(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const masked = Array.isArray(obj) ? [...obj] : { ...obj };
  for (const key of Object.keys(masked)) {
    if (PII_FIELDS.includes(key.toLowerCase())) {
      masked[key] = hashPii(String(masked[key]));
    } else if (typeof masked[key] === 'object' && masked[key] !== null) {
      masked[key] = maskPiiInObject(masked[key]);
    }
  }
  return masked;
}

const piiMaskFormat = winston.format((info) => {
  if (info.meta) info.meta = maskPiiInObject(info.meta);
  if (info.userId && typeof info.userId === 'string' && !info.userId.startsWith('sha256:')) {
    info.userId = hashPii(info.userId);
  }
  return info;
});

const baseFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
  winston.format.errors({ stack: true }),
  piiMaskFormat(),
);

// Production: structured JSON for log aggregators
const productionFormat = winston.format.combine(
  baseFormat,
  winston.format.json(),
);

// Development: colorized, human-readable
const developmentFormat = winston.format.combine(
  baseFormat,
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, module, action, requestId, duration, ...rest }) => {
    let line = `${timestamp} ${level}: ${message}`;
    if (module) line += ` [${module}]`;
    if (action) line += ` (${action})`;
    if (requestId) line += ` req=${requestId}`;
    if (duration !== undefined) line += ` ${duration}ms`;
    const extra = Object.keys(rest).filter((k) => !['splat', 'timestamp'].includes(k));
    if (extra.length > 0) {
      const obj = {};
      extra.forEach((k) => { obj[k] = rest[k]; });
      line += ` ${JSON.stringify(obj)}`;
    }
    return line;
  }),
);

const logger = winston.createLogger({
  level: config.isDevelopment ? 'debug' : config.logging.level,
  defaultMeta: {
    service: 'mb-boiler-api',
    environment: config.env,
  },
  format: config.isProduction ? productionFormat : developmentFormat,
  transports: [
    new winston.transports.Console(),
  ],
  // Catch unhandled exceptions/rejections
  exceptionHandlers: [
    new winston.transports.Console(),
  ],
  rejectionHandlers: [
    new winston.transports.Console(),
  ],
  exitOnError: false,
});

// Add file transport in production for error-level backup
if (config.isProduction) {
  logger.add(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    }),
  );
}

export default logger;
