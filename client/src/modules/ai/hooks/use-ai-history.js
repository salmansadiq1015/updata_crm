'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { aiAgentService } from '../services/ai-agent-service';

const DEFAULT_LIMIT = 20;

export function useAiHistory() {
  const [skip, setSkip] = useState(0);
  const limit = DEFAULT_LIMIT;

  const query = useQuery({
    queryKey: queryKeys.ai.agentRuns({ limit, skip }),
    queryFn:  () => aiAgentService.list({ limit, skip }),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const threads = Array.isArray(query.data) ? query.data : (query.data?.items ?? []);
  const hasMore = threads.length === limit;

  return {
    threads,
    isLoading:  query.isLoading,
    isFetching: query.isFetching,
    error:      query.error,
    skip,
    limit,
    hasMore,
    nextPage:   () => setSkip((s) => s + limit),
    prevPage:   () => setSkip((s) => Math.max(0, s - limit)),
    hasPrev:    skip > 0,
  };
}
