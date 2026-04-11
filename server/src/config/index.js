import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import configSchema from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from server root (two levels up from src/config/)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Hierarchical config loader.
 * Precedence: env vars > .env file > defaults in schema
 *
 * Fails fast on startup if required keys are missing or invalid.
 * Returns a frozen, immutable config object.
 */
const { error, value: envVars } = configSchema.validate(process.env, {
  abortEarly: false,
  stripUnknown: false,
  allowUnknown: true,
});

if (error) {
  const missing = error.details.map((d) => `  - ${d.message}`).join('\n');
  console.error(`\n❌ Configuration validation failed:\n${missing}\n`);
  process.exit(1);
}

const config = Object.freeze({
  env: envVars.NODE_ENV,
  isProduction: envVars.NODE_ENV === 'production',
  isDevelopment: envVars.NODE_ENV === 'development',

  server: {
    port: envVars.PORT,
    host: envVars.HOST,
  },

  db: {
    uri: envVars.MONGODB_URI,
  },

  redis: {
    url: envVars.REDIS_URL,
    password: envVars.REDIS_PASSWORD,
    db: envVars.REDIS_DB,
    keyPrefix: envVars.REDIS_KEY_PREFIX,
  },

  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpiry: envVars.JWT_ACCESS_EXPIRY,
    refreshExpiry: envVars.JWT_REFRESH_EXPIRY,
    accessTtl: envVars.JWT_ACCESS_TTL,
    refreshTtl: envVars.JWT_REFRESH_TTL,
    issuer: envVars.JWT_ISSUER,
  },

  session: {
    secret: envVars.SESSION_SECRET,
  },

  auth: {
    lockoutThreshold: envVars.AUTH_LOCKOUT_THRESHOLD,
    lockoutWindowSeconds: envVars.AUTH_LOCKOUT_WINDOW_SECONDS,
    lockoutDurationSeconds: envVars.AUTH_LOCKOUT_DURATION_SECONDS,
    sessionMaxPerUser: envVars.SESSION_MAX_PER_USER,
    activationTokenExpiryHours: envVars.ACTIVATION_TOKEN_EXPIRY_HOURS,
  },

  audit: {
    retentionDays: envVars.AUDIT_RETENTION_DAYS,
  },

  admin: {
    email: envVars.ADMIN_EMAIL,
    password: envVars.ADMIN_PASSWORD,
    firstName: envVars.ADMIN_FIRST_NAME,
    lastName: envVars.ADMIN_LAST_NAME,
  },

  client: {
    uri: envVars.CLIENT_URI,
    allowedOrigins: envVars.ALLOWED_ORIGINS
      ? envVars.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : [envVars.CLIENT_URI],
  },

  storage: {
    backend: envVars.STORAGE_BACKEND,
    maxFileSize: envVars.STORAGE_MAX_FILE_SIZE,
    presignExpiry: envVars.STORAGE_PRESIGN_EXPIRY,
    aws: {
      accessKeyId: envVars.AWS_ACCESS_KEY_ID,
      secretAccessKey: envVars.AWS_SECRET_ACCESS_KEY,
      bucket: envVars.AWS_S3_BUCKET_NAME,
      region: envVars.AWS_REGION,
      endpoint: envVars.AWS_S3_ENDPOINT || undefined,
    },
  },

  mail: {
    host: envVars.SMTP_HOST,
    port: envVars.SMTP_PORT,
    service: envVars.SMTP_SERVICE,
    user: envVars.SMTP_MAIL,
    password: envVars.SMTP_PASSWORD,
  },

  rateLimit: {
    global: envVars.RATE_LIMIT_GLOBAL,
    windowMs: envVars.RATE_LIMIT_WINDOW_MS,
    auth: envVars.RATE_LIMIT_AUTH,
    upload: envVars.RATE_LIMIT_UPLOAD,
  },

  logging: {
    level: envVars.LOG_LEVEL,
    sentryDsn: envVars.SENTRY_DSN,
  },

  queue: {
    prefix: envVars.BULLMQ_PREFIX,
  },

  ai: {
    apiKey: envVars.OPENAI_API_KEY,
    model: envVars.OPENAI_MODEL,
    maxTokens: envVars.OPENAI_MAX_TOKENS,
  },

  autoMigrate: envVars.AUTO_MIGRATE,
});

export default config;
