import ERROR_CODES from '../errors/errorCodes.js';

/**
 * 404 handler for unmatched routes.
 * Returns JSON for API routes, plain text for everything else.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      statusCode: 404,
      code: ERROR_CODES.NOT_FOUND,
      message: `Route ${req.method} ${req.originalUrl} not found`,
      details: [],
    },
    meta: {
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    },
  });
}

export default notFoundHandler;
