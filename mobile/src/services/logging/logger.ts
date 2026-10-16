// Development logger with redaction. Production builds log warnings/errors only,
// and never payloads: tokens, passwords and lead contact data must not reach logcat.
import { envResult } from '@/config/env';

type LogContext = Record<string, unknown>;

const SENSITIVE_KEY = /token|password|authorization|secret|cookie|email|phone|mobile/i;
const REDACTED = '[redacted]';
const MAX_DEPTH = 4;

export function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value === null || typeof value !== 'object') return value;
  if (depth >= MAX_DEPTH) return '[truncated]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redact(inner, depth + 1),
    ]),
  );
}

const debugEnabled = () => (envResult.ok ? envResult.env.debugLogs : false);

/* eslint-disable no-console -- this module is the single console sink */
export const logger = {
  debug(event: string, context?: LogContext) {
    if (debugEnabled()) console.debug(`[updata] ${event}`, context ? redact(context) : '');
  },
  info(event: string, context?: LogContext) {
    if (debugEnabled()) console.info(`[updata] ${event}`, context ? redact(context) : '');
  },
  warn(event: string, context?: LogContext) {
    console.warn(`[updata] ${event}`, context ? redact(context) : '');
  },
  error(event: string, context?: LogContext) {
    console.error(`[updata] ${event}`, context ? redact(context) : '');
  },
};
/* eslint-enable no-console */
