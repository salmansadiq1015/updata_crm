import crypto from 'node:crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from '../../config/redis.js';
import config from '../../config/index.js';
import logger from '../logger/index.js';
import ERROR_CODES from '../errors/errorCodes.js';

/**
 * Redis-based rate limiting with sliding window.
 *
 * Why Redis-based (not in-memory):
 * - Must be consistent across horizontally scaled API instances.
 * - If instance A allows 99 requests and instance B allows 99,
 *   the user effectively gets 198 — double the limit.
 *
 * Fallback: if Redis is down, rate limiter passes through (fail-open).
 * This is intentional — we'd rather serve requests than reject everything
 * when Redis has a transient failure.
 */

function createLimiter({ windowMs, max, message, keyGenerator, ...extra } = {}) {
  const limiterConfig = {
    ...extra,
    windowMs: windowMs || config.rateLimit.windowMs,
    max: max || config.rateLimit.global,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        statusCode: 429,
        code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
        message: message || 'Too many requests, please try again later',
        details: [],
      },
    },
    keyGenerator: keyGenerator || ((req, res) => {
      // Authenticated users: rate limit by userId (more fair)
      // Anonymous: rate limit by IP (using ipKeyGenerator for IPv6 safety)
      return req.user?._id ? `user:${req.user._id}` : `ip:${ipKeyGenerator(req, res)}`;
    }),
  };

  // Use Redis store if available
  try {
    const redisClient = getRedisClient(logger);
    limiterConfig.store = new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
      prefix: `${config.redis.keyPrefix}rl:`,
    });
  } catch {
    logger.warn('Rate limiter falling back to in-memory store (Redis unavailable)', {
      module: 'rateLimiter',
      action: 'fallback',
    });
  }

  return rateLimit(limiterConfig);
}

// Pre-built limiters for common scenarios
export const globalLimiter = createLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.global,
});

export const authLimiter = createLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.auth,
  message: 'Too many authentication attempts, please try again later',
  keyGenerator: (req, res) => `auth:${ipKeyGenerator(req, res)}`,
});

export const uploadLimiter = createLimiter({
  windowMs: config.rateLimit.windowMs,
  // Separate key namespace so upload counter doesn't share with global limiter
  keyGenerator: (req, res) =>
    req.user?._id ? `upload:user:${req.user._id}` : `upload:ip:${ipKeyGenerator(req, res)}`,
  // In development uploads are frequent during testing; production uses the configured limit
  max: config.isDevelopment ? 10_000 : config.rateLimit.upload,
  message: 'Too many file uploads, please try again later',
});

// Lead website-enrichment limiter. Enrichment makes outbound HTTP requests to
// third-party sites, so it is throttled per authenticated user in its own key
// namespace. Generous in development where it is exercised by tests.
export const enrichLimiter = createLimiter({
  windowMs: config.rateLimit.windowMs,
  keyGenerator: (req, res) =>
    (req.user?._id ? `enrich:user:${req.user._id}` : `enrich:ip:${ipKeyGenerator(req, res)}`),
  max: config.isDevelopment ? 10_000 : 30,
  message: 'Too many enrichment requests, please try again later',
});

// Lead geocoding hits a third-party geocoder (keyless Nominatim/OSM by default,
// whose usage policy asks for light, well-behaved traffic). Results are cached,
// and the UI geocodes sequentially, but we still throttle per user so a "geocode
// all" over a large pipeline stays a good citizen. Generous in development.
export const geocodeLimiter = createLimiter({
  windowMs: config.rateLimit.windowMs,
  keyGenerator: (req, res) =>
    (req.user?._id ? `geocode:user:${req.user._id}` : `geocode:ip:${ipKeyGenerator(req, res)}`),
  max: config.isDevelopment ? 10_000 : 120,
  message: 'Too many geocoding requests, please try again later',
});

/**
 * AI calling: the voice-agent worker calls the tool API from ONE IP for many
 * concurrent calls, so a per-IP budget would 429 live conversations. Budget per
 * call instead (a real call needs a few dozen tool calls; 120/min is a runaway
 * guard). Requests are also bearer-token authenticated per call.
 */
export const agentToolLimiter = createLimiter({
  windowMs: 60_000,
  max: 120,
  message: 'Too many agent tool calls for this call',
  keyGenerator: (req, res) => {
    const callId = /^\/([^/]{1,120})\//.exec(req.path)?.[1];
    return callId ? `ai-agent:${callId}` : `ai-agent-ip:${ipKeyGenerator(req, res)}`;
  },
});

/** Signed provider webhooks: bursty at call end, so a larger per-IP budget. */
export const providerWebhookLimiter = createLimiter({
  windowMs: 60_000,
  max: 1200,
  message: 'Too many webhook requests',
  keyGenerator: (req, res) => `webhook:${ipKeyGenerator(req, res)}`,
});

/**
 * Paired-phone gateway (ESP32 bridge on a laptop): heartbeats every few seconds and audio stats
 * during calls, keyed by the gateway's bearer token (hashed) so many laptops behind one NAT
 * don't share a budget. Pairing itself is per IP and strict (codes are guessable only by brute force).
 */
export const gatewayLimiter = createLimiter({
  windowMs: 60_000,
  max: 300,
  message: 'Too many gateway requests',
  keyGenerator: (req, res) => {
    const auth = req.get('authorization') || '';
    if (!auth.startsWith('Bearer ')) return `gateway-ip:${ipKeyGenerator(req, res)}`;
    return `gateway:${crypto.createHash('sha256').update(auth.slice(7)).digest('hex').slice(0, 32)}`;
  },
});

export const gatewayPairLimiter = createLimiter({
  windowMs: 15 * 60_000,
  max: 10,
  message: 'Too many pairing attempts, please try again later',
  keyGenerator: (req, res) => `gateway-pair:${ipKeyGenerator(req, res)}`,
});

export { createLimiter };
export default {
  globalLimiter, authLimiter, uploadLimiter, enrichLimiter, geocodeLimiter, createLimiter,
};

/**
 * SMS link assistant (public customer page). Per-IP budget for page/API traffic,
 * a per-link budget for chat messages, and a strict budget for unknown links that
 * only counts failures (brute-force guessing of 128-bit tokens is already futile;
 * this keeps scanners cheap to reject).
 */
export const linkPageLimiter = createLimiter({
  windowMs: 60_000,
  max: config.isDevelopment ? 10_000 : 120,
  keyGenerator: (req, res) => `link:ip:${ipKeyGenerator(req, res)}`,
});

export const linkMessageLimiter = createLimiter({
  windowMs: 60_000,
  max: config.isDevelopment ? 10_000 : 30,
  keyGenerator: (req, res) => `link:msg:${String(req.params.token || '').slice(0, 22)}:${ipKeyGenerator(req, res)}`,
  message: 'Please slow down a little',
});

export const linkMissLimiter = createLimiter({
  windowMs: 10 * 60_000,
  max: config.isDevelopment ? 10_000 : 20,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (req, res) => res.statusCode !== 404,
  keyGenerator: (req, res) => `link:miss:${ipKeyGenerator(req, res)}`,
});
