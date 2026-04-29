import Joi from 'joi';

/**
 * Configuration validation schema.
 * Every required key is listed here — if missing, the app fails to start
 * with a clear error listing all missing/invalid keys.
 */
const configSchema = Joi.object({
  // Server
  NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development'),
  PORT: Joi.number().port().default(9097),
  HOST: Joi.string().default('0.0.0.0'),

  // MongoDB
  MONGODB_URI: Joi.string().uri().required(),

  // Redis
  REDIS_URL: Joi.string().default('redis://127.0.0.1:6379'),
  REDIS_PASSWORD: Joi.string().allow('').default(''),
  REDIS_DB: Joi.number().integer().min(0).default(0),
  REDIS_KEY_PREFIX: Joi.string().default('mb:'),

  // JWT / Auth
  JWT_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRY: Joi.string().default('1d'),
  JWT_REFRESH_EXPIRY: Joi.string().default('7d'),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL: Joi.string().default('7d'),
  JWT_ISSUER: Joi.string().default('mb-boiler-api'),
  SESSION_SECRET: Joi.string().min(16).required(),

  // Auth Module
  ADMIN_EMAIL: Joi.string().email().allow('').default(''),
  ADMIN_PASSWORD: Joi.string().allow('').default(''),
  ADMIN_FIRST_NAME: Joi.string().default('System'),
  ADMIN_LAST_NAME: Joi.string().default('Administrator'),
  SESSION_MAX_PER_USER: Joi.number().integer().min(1).default(10),
  AUTH_LOCKOUT_THRESHOLD: Joi.number().integer().min(1).default(5),
  AUTH_LOCKOUT_WINDOW_SECONDS: Joi.number().integer().default(900),
  AUTH_LOCKOUT_DURATION_SECONDS: Joi.number().integer().default(1800),
  AUDIT_RETENTION_DAYS: Joi.number().integer().min(1).default(730),
  ACTIVATION_TOKEN_EXPIRY_HOURS: Joi.number().integer().min(1).default(48),

  // Client
  CLIENT_URI: Joi.string().uri().default('http://localhost:3000'),
  ALLOWED_ORIGINS: Joi.string().default(''),

  // AWS S3
  AWS_ACCESS_KEY_ID: Joi.string().default(''),
  AWS_SECRET_ACCESS_KEY: Joi.string().default(''),
  AWS_S3_BUCKET_NAME: Joi.string().default(''),
  AWS_REGION: Joi.string().default('eu-central-1'),
  AWS_S3_ENDPOINT: Joi.string().allow('').default(''),

  // File Storage
  STORAGE_BACKEND: Joi.string().valid('local', 'minio', 's3').default('s3'),
  STORAGE_MAX_FILE_SIZE: Joi.number().default(50 * 1024 * 1024), // 50MB
  STORAGE_PRESIGN_EXPIRY: Joi.number().default(900), // 15 minutes

  // Email
  SMTP_HOST: Joi.string().default('smtp.gmail.com'),
  SMTP_PORT: Joi.number().default(587),
  SMTP_SERVICE: Joi.string().default('gmail'),
  SMTP_MAIL: Joi.string().email().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),

  // Rate Limiting
  RATE_LIMIT_GLOBAL: Joi.number().default(100),
  RATE_LIMIT_WINDOW_MS: Joi.number().default(60000),
  RATE_LIMIT_AUTH: Joi.number().default(5),
  RATE_LIMIT_UPLOAD: Joi.number().default(10),

  // Observability
  LOG_LEVEL: Joi.string().valid('debug', 'info', 'warn', 'error', 'fatal').default('info'),
  SENTRY_DSN: Joi.string().allow('').default(''),

  // BullMQ
  BULLMQ_PREFIX: Joi.string().default('bull'),

  // OpenAI (optional — for AI module)
  OPENAI_API_KEY: Joi.string().allow('').default(''),
  OPENAI_MODEL: Joi.string().default('gpt-4o'),
  OPENAI_MAX_TOKENS: Joi.number().default(2000),

  // Maintenance
  MAINTENANCE_LOOKAHEAD_DAYS: Joi.number().integer().min(1).default(30),

  // Misc
  AUTO_MIGRATE: Joi.boolean().default(false),
}).unknown(true); // allow extra env vars we don't manage

export default configSchema;
