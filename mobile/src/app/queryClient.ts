import { QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/services/api/apiErrors';

const MAX_QUERY_RETRIES = 2;

/** Reads are retried only for transient failures; 4xx answers are final. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < MAX_QUERY_RETRIES && error instanceof ApiError && error.isRetryable;
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetryQuery,
        retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
      },
      mutations: {
        // Never auto-retry writes: a retried POST could create a duplicate call,
        // message or CRM activity. The user retries explicitly.
        retry: false,
      },
    },
  });
}

export const queryClient = createQueryClient();
