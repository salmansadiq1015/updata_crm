'use client';

import { useQuery } from '@tanstack/react-query';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { taskApi } from '../services/task-api';

export function useTaskContextSearch(query: string) {
  const debouncedQuery = useDebounce(query, 250);
  return useQuery({
    queryKey: ['tasks', 'context-search', debouncedQuery],
    queryFn: async () => {
      if (debouncedQuery.trim().length < 2) return [];
      const [projects, orders] = await Promise.all([
        taskApi.searchProjects(debouncedQuery),
        taskApi.searchOrders(debouncedQuery),
      ]);
      return [...projects, ...orders];
    },
    enabled: debouncedQuery.trim().length >= 2,
    staleTime: 30_000,
  });
}
