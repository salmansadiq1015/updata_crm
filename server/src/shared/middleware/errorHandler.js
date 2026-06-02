import { AppError } from '../errors/AppError.js';
import ERROR_CODES from '../errors/errorCodes.js';
import logger from '../logger/index.js';

/**
 * Global error handler — the LAST middleware in the pipeline.
 *
 * Maps all errors to the standard envelope. Rules:
 * - Operational errors (AppError subclasses): log at WARN, return specific message.
 * - Mongoose errors: auto-mapped to appropriate 4xx codes.
 * - Programmer errors: log at ERROR with full stack, return generic 500.
 * - Stack traces NEVER in response (any environment).
 */
export function errorHandler(err, req, res, _next) {
  // Default values
  let statusCode = err.statusCode || 500;
  let code = err.code || ERROR_CODES.INTERNAL_ERROR;
  let message = err.message || 'Internal Server Error';
  let details = err.details || [];
  let isOperational = err.isOperational || false;

  // --- Mongoose Validation Error ---
  if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    code = ERROR_CODES.VALIDATION_ERROR;
    message = 'Validation failed';
    details = Object.entries(err.errors).map(([field, e]) => ({
      field,
      message: e.message,
      value: e.value,
    }));
    isOperational = true;
  }

  // --- Mongoose Duplicate Key (11000) ---
  if (err.code === 11000) {
    statusCode = 409;
    code = ERROR_CODES.DUPLICATE_KEY;
    const field = Object.keys(err.keyPattern || {})[0] || 'unknown';
    message = `Duplicate value for field '${field}'`;
    details = [{ field, message }];
    isOperational = true;
  }

  // --- Mongoose Cast Error (bad ObjectId) ---
  if (err.name === 'CastError') {
    statusCode = 400;
    code = ERROR_CODES.INVALID_ID;
    message = `Invalid value '${err.value}' for ${err.path}`;
    isOperational = true;
  }

  // --- JWT Errors ---
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = ERROR_CODES.INVALID_TOKEN;
    message = 'Invalid authentication token';
    isOperational = true;
  }
  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = ERROR_CODES.TOKEN_EXPIRED;
    message = 'Authentication token has expired';
    isOperational = true;
  }

  // --- Multer Errors ---
  if (err.name === 'MulterError') {
    statusCode = 400;
    code = ERROR_CODES.FILE_UPLOAD_FAILED;
    message = `File upload error: ${err.message}`;
    isOperational = true;
  }

  // --- Logging ---
  const logPayload = {
    module: 'errorHandler',
    action: 'handleError',
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode,
    code,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
    },
  };

  if (isOperational || statusCode < 500) {
    logger.warn(message, logPayload);
  } else {
    logger.error(message, logPayload);
  }

  // --- Response ---
  const response = {
    success: false,
    error: {
      statusCode,
      code,
      message: statusCode >= 500 && !isOperational ? 'Internal Server Error' : message,
      details: statusCode >= 500 && !isOperational ? [] : details,
      ...(err.data != null && statusCode < 500 ? { data: err.data } : {}),
    },
    meta: {
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    },
  };

  // Retry-After for rate limit errors
  if (err.retryAfter) {
    res.setHeader('Retry-After', err.retryAfter);
  }

  res.status(statusCode).json(response);
}

export default errorHandler;
