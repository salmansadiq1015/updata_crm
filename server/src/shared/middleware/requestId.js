import { v4 as uuidv4 } from 'uuid';

/**
 * Attaches a unique request ID to every request.
 * If the client sends X-Request-Id, we honour it (for distributed tracing).
 * Otherwise, we generate a UUID v4.
 *
 * The ID is set on:
 * - req.requestId (for internal use)
 * - res X-Request-Id header (for client correlation)
 */
export function requestIdMiddleware(req, res, next) {
  const requestId = req.headers['x-request-id'] || uuidv4();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

export default requestIdMiddleware;
