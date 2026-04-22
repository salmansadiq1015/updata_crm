/**
 * Base entity shape — all MongoDB documents have these fields.
 */
export interface BaseEntity {
  _id: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Generic select option for dropdowns and filters.
 */
export interface SelectOption<T = string> {
  label: string;
  value: T;
}

/**
 * Sort direction for table columns.
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Common query filter params sent to list endpoints.
 */
export interface ListQueryParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: SortDirection;
  [key: string]: unknown;
}
