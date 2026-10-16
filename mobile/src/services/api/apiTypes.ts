// Wire shapes of the Updata API (server/src/shared/middleware/responseEnvelope.js
// and errorHandler.js). Every endpoint answers with one of these envelopes.

export type ApiMeta = {
  requestId?: string;
  timestamp?: string;
};

/** Cursor pagination (`shared/utils/pagination.js`); leads also report `total`. */
export type CursorPagination = {
  hasNext: boolean;
  nextCursor: string | null;
  limit: number;
  total?: number;
};

export type SuccessEnvelope<T> = {
  success: true;
  message?: string;
  data: T;
  meta?: ApiMeta;
  pagination?: CursorPagination;
};

export type ApiFieldError = {
  field: string;
  message: string;
};

export type ErrorEnvelope = {
  success: false;
  error: {
    statusCode: number;
    code: string;
    message: string;
    details?: ApiFieldError[];
  };
  meta?: ApiMeta;
};

export type CursorPage<T> = {
  items: T[];
  pagination: CursorPagination;
};
