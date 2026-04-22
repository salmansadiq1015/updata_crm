/**
 * Standard API response envelope from the backend.
 * The Axios interceptor unwraps this, so services receive the inner shape.
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  pagination?: PaginationMeta | null;
  meta: {
    requestId: string;
    timestamp: string;
    duration?: number;
  };
}

export interface PaginationMeta {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

/**
 * Normalized API error shape returned by the Axios error interceptor.
 */
export interface ApiError {
  statusCode: number;
  code?: string;
  message: string;
  details: Array<{ field?: string; message: string }>;
  requestId: string | null;
}
