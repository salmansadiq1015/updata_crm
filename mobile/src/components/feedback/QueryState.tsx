import type { ReactNode } from 'react';

import { AppErrorState } from '@/components/ui/AppErrorState';

type QueryLike = {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isRefetching: boolean;
  refetch: () => unknown;
};

export type QueryStateProps = {
  query: QueryLike;
  /** Skeleton shaped like the content. */
  loading: ReactNode;
  /** Rendered when the request succeeded with nothing to show. */
  empty?: ReactNode;
  isEmpty?: boolean;
  children: ReactNode;
};

/**
 * The standard loading → error → empty → content switch for API-backed screens.
 * A failed background refetch keeps showing cached data rather than an error.
 */
export function QueryState({ query, loading, empty, isEmpty, children }: QueryStateProps) {
  if (query.isPending) return <>{loading}</>;
  if (query.isError) {
    return (
      <AppErrorState error={query.error} retrying={query.isRefetching} onRetry={() => void query.refetch()} />
    );
  }
  if (isEmpty && empty) return <>{empty}</>;
  return <>{children}</>;
}
