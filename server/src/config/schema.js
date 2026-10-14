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

  // Tasks: after how many working days past its due date an unfinished task is
  // copied into the shared pool so colleagues can help (client: 5–7 days).
  TASK_POOL_AFTER_WORKING_DAYS: Joi.number().integer().min(1).max(30).default(5),

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
  JWT_ISSUER: Joi.string().default('updata-api'),
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
  STORAGE_MAX_FILE_SIZE: Joi.number().default(100 * 1024 * 1024), // 100MB
  STORAGE_PRESIGN_EXPIRY: Joi.number().default(900), // 15 minutes

  // Email
  SMTP_HOST: Joi.string().default('smtp.gmail.com'),
  SMTP_PORT: Joi.number().default(587),
  SMTP_SERVICE: Joi.string().default('gmail'),
  SMTP_MAIL: Joi.string().email().allow('').default(''),
  SMTP_PASSWORD: Joi.string().allow('').default(''),
  SMTP_FROM_NAME: Joi.string().trim().max(255).default('Updata.ai'),
  SMTP_TLS_REJECT_UNAUTHORIZED: Joi.boolean().truthy('true').falsy('false').default(true),

  // Lead multi-channel messaging. Secrets stay server-side and are never
  // returned by provider-health/settings APIs.
  MESSAGE_DESTINATION_HASH_SECRET: Joi.string().min(16).allow('').default(''),
  MESSAGE_UNSUBSCRIBE_SECRET: Joi.string().min(16).allow('').default(''),
  MESSAGING_PUBLIC_API_URL: Joi.string().uri().allow('').default(''),
  MESSAGING_CONCURRENCY: Joi.number().integer().min(1).max(25).default(3),
  MESSAGING_RECOVERY_STALE_MINUTES: Joi.number().integer().min(2).max(1440).default(10),
  MESSAGING_RECOVERY_BATCH_SIZE: Joi.number().integer().min(1).max(5000).default(500),
  MESSAGING_RECONCILIATION_MIN_AGE_MINUTES: Joi.number().integer().min(1).max(1440).default(5),
  MESSAGING_RECONCILIATION_MAX_AGE_DAYS: Joi.number().integer().min(1).max(90).default(7),
  MESSAGING_RECONCILIATION_BATCH_SIZE: Joi.number().integer().min(1).max(1000).default(200),
  META_WHATSAPP_BUSINESS_ACCOUNT_ID: Joi.string().allow('').default(''),
  META_WHATSAPP_PHONE_NUMBER_ID: Joi.string().allow('').default(''),
  META_WHATSAPP_ACCESS_TOKEN: Joi.string().allow('').default(''),
  META_WHATSAPP_WEBHOOK_VERIFY_TOKEN: Joi.string().allow('').default(''),
  META_APP_SECRET: Joi.string().allow('').default(''),
  META_GRAPH_API_VERSION: Joi.string().pattern(/^v\d+\.\d+$/).allow('').default(''),
  META_WHATSAPP_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(15000),
  TEXTBEE_API_KEY: Joi.string().allow('').default(''),
  TEXTBEE_DEVICE_ID: Joi.string().allow('').default(''),
  TEXTBEE_API_URL: Joi.string().uri().default('https://api.textbee.dev'),
  TEXTBEE_WEBHOOK_SECRET: Joi.string().min(20).allow('').default(''),
  TEXTBEE_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(15000),
  TWILIO_ACCOUNT_SID: Joi.string().allow('').default(''),
  TWILIO_AUTH_TOKEN: Joi.string().allow('').default(''),
  TWILIO_FROM_NUMBER: Joi.string().allow('').default(''),
  TWILIO_MESSAGING_SERVICE_SID: Joi.string().allow('').default(''),
  TWILIO_STATUS_CALLBACK_URL: Joi.string().uri().allow('').default(''),
  TWILIO_WHATSAPP_FROM: Joi.string().allow('').default(''),
  TWILIO_WHATSAPP_MESSAGING_SERVICE_SID: Joi.string().allow('').default(''),
  TWILIO_WHATSAPP_STATUS_CALLBACK_URL: Joi.string().uri().allow('').default(''),
  TWILIO_WEBHOOK_PUBLIC_URL: Joi.string().uri().allow('').default(''),
  TWILIO_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(15000),

  // Company / invoice document defaults
  COMPANY_NAME: Joi.string().default('Updata'),
  COMPANY_STREET: Joi.string().default('Buchenstrasse'),
  COMPANY_BUILDING_NUMBER: Joi.string().allow('').default('57B'),
  COMPANY_ZIP: Joi.string().default('4142'),
  COMPANY_CITY: Joi.string().default('Münchenstein'),
  COMPANY_COUNTRY: Joi.string().default('CH'),
  COMPANY_PHONE: Joi.string().allow('').default(''),
  COMPANY_EMAIL: Joi.string().email().allow('').default(''),
  COMPANY_QR_IBAN: Joi.string().default('CH4431999123000889012'),

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
  // Alternative OpenAI-compatible endpoint (Azure OpenAI, Swiss gateway…),
  // set once the data-residency decision is made.
  OPENAI_BASE_URL: Joi.string().uri().allow('').default(''),
  STT_PROVIDER: Joi.string().valid('whisper', 'google', 'azure').default('whisper'),

  // Accounting OCR
  OCR_PROVIDER: Joi.string().valid('disabled', 'http', 'text').default('disabled'),
  OCR_HTTP_ENDPOINT: Joi.string().uri().allow('').default(''),
  OCR_HTTP_API_KEY: Joi.string().allow('').default(''),
  OCR_TIMEOUT_MS: Joi.number().integer().min(1000).default(30000),
  OCR_LOW_CONFIDENCE_THRESHOLD: Joi.number().min(0).max(1).default(0.8),

  // Maintenance
  MAINTENANCE_LOOKAHEAD_DAYS: Joi.number().integer().min(1).default(30),
  MAINTENANCE_ESCALATION_DAYS: Joi.number().integer().min(1).default(30),
  // Optional JSON override of default maintenance templates, keyed by installation type.
  // e.g. {"boiler":[{"maintenanceType":"annual_service","frequencyMonths":12}]}
  MAINTENANCE_TEMPLATES_JSON: Joi.string().allow('').default(''),

  // CRM images (CRM-010)
  CRM_MAX_IMAGES_PER_ENTITY: Joi.number().integer().min(1).default(50),
  CRM_IMAGE_MAX_MB: Joi.number().min(0.1).default(2),

  // Project Management
  PROJECT_ARCHIVE_RETENTION_DAYS: Joi.number().integer().min(1).default(90),
  PROJECT_DOCUMENT_MAX_UPLOAD_MB: Joi.number().integer().min(1).default(50),
  SCHEDULE_CONFIRMATION_LEAD_DAYS: Joi.number().integer().min(0).default(5),
  // Comma-separated extra recipients CC'd on every project status-change email.
  PROJECT_STATUS_NOTIFICATION_CC: Joi.string().allow('').default(''),

  // Business Discovery / Lead Generation providers.
  // Default to open-source data paths. Google remains available only when the
  // provider mode/fallback flags explicitly select it.
  DISCOVERY_PROVIDER_MODE: Joi.string()
    .valid('OPEN_SOURCE_ONLY', 'OPEN_SOURCE_PRIMARY_WITH_COMMERCIAL_FALLBACK', 'PRIMARY_WITH_FALLBACK', 'COMMERCIAL_PRIMARY', 'GOOGLE_ONLY')
    .default('OPEN_SOURCE_ONLY'),
  OPENSTREETMAP_ENABLED: Joi.boolean().default(true),
  OVERPASS_ENABLED: Joi.boolean().default(true),
  NOMINATIM_ENABLED: Joi.boolean().default(true),
  PHOTON_ENABLED: Joi.boolean().default(false),
  GEOAPIFY_ENABLED: Joi.boolean().default(false),
  MAPBOX_ENABLED: Joi.boolean().default(false),
  GOOGLE_FALLBACK_ENABLED: Joi.boolean().default(false),
  OVERPASS_API_URL: Joi.string().uri().allow('').default('https://overpass-api.de/api/interpreter'),
  OVERPASS_API_URLS: Joi.string().allow('').default(''),
  NOMINATIM_API_URL: Joi.string().uri().allow('').default('https://nominatim.openstreetmap.org'),
  PHOTON_API_URL: Joi.string().uri().allow('').default(''),
  MAPBOX_ACCESS_TOKEN: Joi.string().trim().allow('').default(''),
  GEOAPIFY_API_KEY: Joi.string().trim().allow('').default(''),
  DISCOVERY_MAX_CELLS: Joi.number().integer().min(1).max(5000).optional(),
  DISCOVERY_MAX_CONCURRENT_REQUESTS: Joi.number().integer().min(1).max(10).optional(),
  DISCOVERY_REQUEST_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(30000),
  DISCOVERY_RETRY_COUNT: Joi.number().integer().min(0).max(10).default(3),
  GOOGLE_FALLBACK_MAX_REQUESTS: Joi.number().integer().min(0).max(1000).default(0),
  DISCOVERY_USER_AGENT: Joi.string().trim().default('UpdataCRM-Discovery/1.0 (+https://updata.local)'),

  // Google Maps Platform.
  // Server key (secret, IP/API-restricted): Places API (New) + Geocoding API.
  GOOGLE_PLACES_API_KEY: Joi.string().trim().allow('').default(''),
  // Browser key (public, HTTP-referrer-restricted): Maps JavaScript API only.
  GOOGLE_MAPS_BROWSER_KEY: Joi.string().trim().allow('').default(''),
  // Optional dedicated Geocoding key — falls back to GOOGLE_PLACES_API_KEY when empty.
  GOOGLE_GEOCODING_API_KEY: Joi.string().trim().allow('').default(''),
  DISCOVERY_MAX_COVERAGE_CELLS: Joi.number().integer().min(1).max(5000).default(100),
  DISCOVERY_CONCURRENCY: Joi.number().integer().min(1).max(10).default(3),
  // Safety ceiling on how many unique businesses a single sweep will surface.
  // The adaptive sweep subdivides saturated cells, so this is not an "arbitrary
  // 300"; it only bounds memory/runtime. Default is high enough to be effectively
  // exhaustive for normal areas; "Load more" extends it by another increment.
  DISCOVERY_INITIAL_RESULT_LIMIT: Joi.number().integer().min(1).max(50000).default(5000),
  DISCOVERY_STALE_TIMEOUT_MS: Joi.number().integer().min(60000).max(3600000).default(600000),
  // Retention of discovery sessions and their results (TTL on expiresAt).
  DISCOVERY_RESULT_TTL_DAYS: Joi.number().integer().min(1).max(365).default(60),

  // Website enrichment — responsible scraper that fills MISSING lead contact
  // fields (email / phone / socials) from a lead's own website over plain HTTP.
  ENRICHMENT_TIMEOUT_MS: Joi.number().integer().min(1000).max(60000).default(8000),
  ENRICHMENT_MAX_BYTES: Joi.number().integer().min(10000).default(1_500_000),
  ENRICHMENT_CONCURRENCY: Joi.number().integer().min(1).max(10).default(3),
  ENRICHMENT_RESPECT_ROBOTS: Joi.boolean().default(true),
  ENRICHMENT_USER_AGENT: Joi.string().trim().default('UpdataCRM-Enrichment/1.0'),

  // AI voice calling (OpenAI Realtime + LiveKit Agents + SIP). All secrets are
  // server-only. The feature degrades to an honest "not configured" state when
  // these are blank — it never fabricates a PSTN call.
  PUBLIC_API_BASE_URL: Joi.string().uri().allow('').default(''), // reachable by the agent worker
  AI_CALLING_WORKER_CONCURRENCY: Joi.number().integer().min(1).max(25).default(5),
  AI_CALLING_AGENT_SECRET: Joi.string().allow('').default(''),   // signs per-call agent tokens
  AI_CALLING_PHONE_HASH_SECRET: Joi.string().allow('').default(''),
  AI_CALLING_REQUIRE_CONSENT: Joi.boolean().default(true),
  AI_CALLING_TWILIO_FALLBACK_ENABLED: Joi.boolean().default(false),
  AI_CALLING_TWILIO_FALLBACK_COUNTRIES: Joi.string().allow('').default(''),
  OPENAI_REALTIME_MODEL: Joi.string().default('gpt-realtime'),
  OPENAI_REALTIME_VOICE: Joi.string().default('alloy'),
  LIVEKIT_URL: Joi.string().allow('').default(''),               // wss://xxx.livekit.cloud
  LIVEKIT_API_KEY: Joi.string().allow('').default(''),
  LIVEKIT_API_SECRET: Joi.string().allow('').default(''),
  LIVEKIT_SIP_OUTBOUND_TRUNK_ID: Joi.string().allow('').default(''),
  LIVEKIT_SIP_CALLER_ID: Joi.string().allow('').default(''),
  LIVEKIT_TWILIO_SIP_OUTBOUND_TRUNK_ID: Joi.string().allow('').default(''),
  TWILIO_VOICE_FROM_NUMBER: Joi.string().allow('').default(''),
  // Bring-your-own SIP carrier (carrier-agnostic, non-Twilio: Telnyx, Plivo,
  // Vonage, Peoplefone, Sipcall, …). When set and no trunk id is given, the
  // LiveKit outbound trunk is auto-provisioned from these.
  SIP_OUTBOUND_ADDRESS: Joi.string().allow('').default(''),      // e.g. sip.telnyx.com
  SIP_OUTBOUND_NUMBER: Joi.string().allow('').default(''),       // your DID / caller-ID (E.164)
  SIP_OUTBOUND_USERNAME: Joi.string().allow('').default(''),
  SIP_OUTBOUND_PASSWORD: Joi.string().allow('').default(''),
  SIP_OUTBOUND_TRANSPORT: Joi.string().valid('auto', 'udp', 'tcp', 'tls').default('auto'),
  SIP_OUTBOUND_TRUNK_NAME: Joi.string().default('crm-outbound'),
  LIVEKIT_AGENT_NAME: Joi.string().default('crm-voice-agent'),
  LIVEKIT_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(15000),

  // Misc
  AUTO_MIGRATE: Joi.boolean().default(false),
}).unknown(true); // allow extra env vars we don't manage

export default configSchema;
