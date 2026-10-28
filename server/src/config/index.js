// Must come first: it fills process.env before anything below reads it.
import './loadEnv.js';
import configSchema from './schema.js';
import { normalizeS3Endpoint } from './normalizeS3Endpoint.js';

/**
 * Hierarchical config loader.
 * Precedence: env vars > .env.local > .env > defaults in schema
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

/**
 * Parse the optional maintenance templates override.
 * Returns null when unset/blank so the built-in defaults are used as-is.
 * Invalid JSON fails fast so misconfiguration is caught on startup.
 */
function parseMaintenanceTemplates(raw) {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('MAINTENANCE_TEMPLATES_JSON must be a JSON object keyed by installation type');
    }
    return parsed;
  } catch (err) {
    console.error(`\n❌ Configuration validation failed:\n  - MAINTENANCE_TEMPLATES_JSON: ${err.message}\n`);
    process.exit(1);
  }
}

const maintenanceTemplates = parseMaintenanceTemplates(envVars.MAINTENANCE_TEMPLATES_JSON);

let s3Endpoint;
try {
  s3Endpoint = normalizeS3Endpoint(envVars.AWS_S3_ENDPOINT);
} catch (err) {
  console.error(`\n❌ Configuration validation failed:\n  - ${err.message}\n`);
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
    serverSelectionTimeoutMS: envVars.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    connectAttempts: envVars.MONGODB_CONNECT_ATTEMPTS,
    connectRetryDelayMS: envVars.MONGODB_CONNECT_RETRY_DELAY_MS,
  },

  tasks: {
    poolAfterWorkingDays: envVars.TASK_POOL_AFTER_WORKING_DAYS,
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
      endpoint: s3Endpoint,
    },
  },

  mail: {
    host: envVars.SMTP_HOST,
    port: envVars.SMTP_PORT,
    service: envVars.SMTP_SERVICE,
    user: envVars.SMTP_MAIL,
    password: envVars.SMTP_PASSWORD,
    fromName: envVars.SMTP_FROM_NAME,
    tlsRejectUnauthorized: envVars.SMTP_TLS_REJECT_UNAUTHORIZED,
  },

  company: {
    name: envVars.COMPANY_NAME,
    street: envVars.COMPANY_STREET,
    buildingNumber: envVars.COMPANY_BUILDING_NUMBER,
    zip: envVars.COMPANY_ZIP,
    city: envVars.COMPANY_CITY,
    country: envVars.COMPANY_COUNTRY,
    phone: envVars.COMPANY_PHONE,
    email: envVars.COMPANY_EMAIL,
    qrIban: envVars.COMPANY_QR_IBAN,
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
    baseUrl: envVars.OPENAI_BASE_URL,
    sttProvider: envVars.STT_PROVIDER,
  },

  ocr: {
    provider: envVars.OCR_PROVIDER,
    httpEndpoint: envVars.OCR_HTTP_ENDPOINT,
    httpApiKey: envVars.OCR_HTTP_API_KEY,
    timeoutMs: envVars.OCR_TIMEOUT_MS,
    lowConfidenceThreshold: envVars.OCR_LOW_CONFIDENCE_THRESHOLD,
  },

  maintenance: {
    lookaheadDays: envVars.MAINTENANCE_LOOKAHEAD_DAYS,
    escalationDays: envVars.MAINTENANCE_ESCALATION_DAYS,
    // Per-type template override (null when unset → built-in defaults are used).
    templates: maintenanceTemplates,
  },

  crm: {
    maxImagesPerEntity: envVars.CRM_MAX_IMAGES_PER_ENTITY,
    maxImageBytes: envVars.CRM_IMAGE_MAX_MB * 1024 * 1024,
  },

  pm: {
    archiveRetentionDays: envVars.PROJECT_ARCHIVE_RETENTION_DAYS,
    documentMaxUploadBytes: envVars.PROJECT_DOCUMENT_MAX_UPLOAD_MB * 1024 * 1024,
    scheduleConfirmationLeadDays: envVars.SCHEDULE_CONFIRMATION_LEAD_DAYS,
    statusNotificationCc: (envVars.PROJECT_STATUS_NOTIFICATION_CC || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },

  // Google Maps Platform. Empty string = not configured (the app still boots).
  // placesApiKey / geocodingApiKey are secrets: server-side only, never logged
  // and never returned in a response. browserKey is public by design (it is
  // shipped to browsers) and must be restricted by HTTP referrer in Google Cloud.
  maps: {
    placesApiKey: envVars.GOOGLE_PLACES_API_KEY,
    browserKey: envVars.GOOGLE_MAPS_BROWSER_KEY,
    // Geocoding reuses the Places key unless a dedicated one is configured.
    geocodingApiKey: envVars.GOOGLE_GEOCODING_API_KEY || envVars.GOOGLE_PLACES_API_KEY,
  },

  // Business Discovery / Lead Generation: per-session cost and load guards.
  discovery: {
    providerMode: envVars.DISCOVERY_PROVIDER_MODE,
    providers: {
      openStreetMapEnabled: envVars.OPENSTREETMAP_ENABLED,
      overpassEnabled: envVars.OVERPASS_ENABLED,
      nominatimEnabled: envVars.NOMINATIM_ENABLED,
      photonEnabled: envVars.PHOTON_ENABLED,
      geoapifyEnabled: envVars.GEOAPIFY_ENABLED,
      mapboxEnabled: envVars.MAPBOX_ENABLED,
      googleFallbackEnabled: envVars.GOOGLE_FALLBACK_ENABLED,
    },
    endpoints: {
      overpassUrl: envVars.OVERPASS_API_URL,
      overpassUrls: (envVars.OVERPASS_API_URLS || '')
        .split(',')
        .map((url) => url.trim())
        .filter(Boolean),
      nominatimUrl: envVars.NOMINATIM_API_URL,
      photonUrl: envVars.PHOTON_API_URL,
    },
    credentials: {
      mapboxAccessToken: envVars.MAPBOX_ACCESS_TOKEN,
      geoapifyApiKey: envVars.GEOAPIFY_API_KEY,
    },
    maxCoverageCells: envVars.DISCOVERY_MAX_CELLS || envVars.DISCOVERY_MAX_COVERAGE_CELLS,
    concurrency: envVars.DISCOVERY_MAX_CONCURRENT_REQUESTS || envVars.DISCOVERY_CONCURRENCY,
    initialResultLimit: envVars.DISCOVERY_INITIAL_RESULT_LIMIT,
    staleTimeoutMs: envVars.DISCOVERY_STALE_TIMEOUT_MS,
    resultTtlDays: envVars.DISCOVERY_RESULT_TTL_DAYS,
    requestTimeoutMs: envVars.DISCOVERY_REQUEST_TIMEOUT_MS,
    retryCount: envVars.DISCOVERY_RETRY_COUNT,
    googleFallbackMaxRequests: envVars.GOOGLE_FALLBACK_MAX_REQUESTS,
    userAgent: envVars.DISCOVERY_USER_AGENT,
  },

  // Website enrichment — responsible-scraping guards for the lead contact-fill
  // pipeline. timeoutMs + maxBytes bound every HTTP fetch; concurrency bounds the
  // bulk fan-out; respectRobots honours robots.txt; userAgent identifies the tool.
  enrichment: {
    timeoutMs: envVars.ENRICHMENT_TIMEOUT_MS,
    maxBytes: envVars.ENRICHMENT_MAX_BYTES,
    concurrency: envVars.ENRICHMENT_CONCURRENCY,
    respectRobots: envVars.ENRICHMENT_RESPECT_ROBOTS,
    userAgent: envVars.ENRICHMENT_USER_AGENT,
  },

  autoMigrate: envVars.AUTO_MIGRATE,
});

export default config;
