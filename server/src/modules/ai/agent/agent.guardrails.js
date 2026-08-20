import { getRedisClient } from '../../../config/redis.js';
import { AppError } from '../../../shared/errors/AppError.js';
import ERROR_CODES from '../../../shared/errors/errorCodes.js';

export const MAX_STEPS = 10;
export const MIN_AGENT_INPUT_LENGTH = 2;
// Raise only for load or end-to-end testing (AI_AGENT_RATE_LIMIT); production
// keeps twenty runs per hour and per user.
const RATE_LIMIT = Number(process.env.AI_AGENT_RATE_LIMIT) > 0
  ? Number(process.env.AI_AGENT_RATE_LIMIT)
  : 20;
const RATE_WINDOW_SECONDS = 3600;

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /forget\s+(all\s+)?previous/i,
  /system\s*:\s*you\s+are/i,
  /\[system\]/i,
  /<\s*system\s*>/i,
];

export async function checkRateLimit(userId) {
  const redis = getRedisClient();
  const key = `ai:agent:ratelimit:${userId}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, RATE_WINDOW_SECONDS);
  if (count > RATE_LIMIT) {
    throw new AppError(`Agent rate limit exceeded (${RATE_LIMIT}/h)`, 429, ERROR_CODES.AI_AGENT_RATE_LIMITED);
  }
}

export function sanitizeUserInput(input) {
  let clean = String(input).slice(0, 2000);
  for (const pattern of INJECTION_PATTERNS) {
    clean = clean.replace(pattern, '[REDACTED]');
  }
  return clean;
}

export function enforceMaxSteps(stepCount) {
  if (stepCount >= MAX_STEPS) {
    throw new AppError(`Max agent steps (${MAX_STEPS}) exceeded`, 500, ERROR_CODES.AI_AGENT_MAX_STEPS);
  }
}
