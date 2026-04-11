/**
 * Attaches res.success() and res.fail() helpers for consistent API responses.
 *
 * Every response follows the envelope:
 *   { success: boolean, data?, error?, pagination?, meta: { requestId, timestamp, duration } }
 *
 * This replaces the existing responseMiddleware.js — same interface, enhanced with meta.
 */
export function responseEnvelope(req, res, next) {
  req._startTime = Date.now();

  res.success = function ({ data = null, message = 'Success', statusCode = 200, pagination = undefined } = {}) {
    const body = {
      success: true,
      message,
      data,
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
        duration: Date.now() - req._startTime,
      },
    };
    if (pagination) body.pagination = pagination;
    return res.status(statusCode).json(body);
  };

  res.fail = function ({ statusCode = 400, code = '', message = 'Request failed', details = [] } = {}) {
    return res.status(statusCode).json({
      success: false,
      error: {
        statusCode,
        code,
        message,
        details,
      },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString(),
      },
    });
  };

  next();
}

export default responseEnvelope;
