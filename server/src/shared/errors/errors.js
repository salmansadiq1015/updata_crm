/**
 * Re-export all error classes from a single entry point.
 * Modules import: import { NotFoundError, ValidationError } from '#shared/errors/errors.js';
 */
export {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  ServiceUnavailableError,
} from './AppError.js';

export { default as ERROR_CODES } from './errorCodes.js';
