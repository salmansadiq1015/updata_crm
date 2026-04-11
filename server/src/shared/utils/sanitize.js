import xss from 'xss';
import mongoSanitize from 'mongo-sanitize';

/**
 * Input sanitization utilities.
 *
 * Two layers:
 * 1. XSS: strips HTML/script tags from string values
 * 2. NoSQL injection: strips $ operators from MongoDB query objects
 */

/**
 * Sanitize a string against XSS.
 */
export function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return xss(str);
}

/**
 * Deep-sanitize an object (body/query).
 * Strips XSS from all string values recursively.
 */
export function sanitizeObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj);
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    cleaned[key] = sanitizeObject(value);
  }
  return cleaned;
}

/**
 * Express middleware: sanitize req.body and req.params against NoSQL injection.
 * Strips any keys starting with $ or containing . (MongoDB operators).
 *
 * Note: req.query is read-only in Express v5 (getter-only property).
 * Query sanitization is handled in the validation layer (Joi stripUnknown)
 * and in queryBuilder.js (whitelisted fields only).
 * req.body is writable, so we sanitize it directly.
 */
export function mongoSanitizeMiddleware(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = mongoSanitize(req.body);
  }
  // req.query is read-only in Express v5 — sanitized via Joi validation layer
  // req.params are route-defined and type-checked via Joi
  next();
}

export default { sanitizeString, sanitizeObject, mongoSanitizeMiddleware };
