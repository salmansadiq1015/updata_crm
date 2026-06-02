import ERROR_CODES from './errorCodes.js';

/**
 * Base application error.
 * All custom errors extend this. The error handler maps these to HTTP responses.
 *
 * isOperational = true: expected errors (bad input, not found, auth failure).
 *   Logged at WARN, returned to client with message.
 * isOperational = false: programmer errors (null ref, type error).
 *   Logged at ERROR, client gets generic "Internal Server Error".
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = ERROR_CODES.INTERNAL_ERROR, details = []) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = []) {
    super(message, 400, ERROR_CODES.VALIDATION_ERROR, details);
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required', code = ERROR_CODES.INVALID_TOKEN) {
    super(message, 401, code);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, ERROR_CODES.INSUFFICIENT_PERMISSIONS);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', identifier = '') {
    const msg = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(msg, 404, ERROR_CODES.NOT_FOUND);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists', data = null) {
    super(message, 409, ERROR_CODES.CONFLICT);
    if (data !== null) this.data = data;
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfter = 60) {
    super('Too many requests, please try again later', 429, ERROR_CODES.RATE_LIMIT_EXCEEDED);
    this.retryAfter = retryAfter;
  }
}

export class ExternalServiceError extends AppError {
  constructor(service, message = 'External service unavailable', code = ERROR_CODES.EXTERNAL_SERVICE_ERROR) {
    super(`${service}: ${message}`, 502, code);
    this.service = service;
    this.isOperational = true;
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503, ERROR_CODES.SERVICE_UNAVAILABLE);
  }
}

export default {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  ServiceUnavailableError,
};
