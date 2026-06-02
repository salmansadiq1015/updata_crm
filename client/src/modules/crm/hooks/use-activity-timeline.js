'use client';

import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { activityService } from '@/modules/crm/services/activity-service';

const DEFAULT_LIMIT = 25;

/**
 * Infinite-query hook for the unified site / installation activity timeline.
 *
 * Keyed by entityType + entityId + filters so changing a filter spins up a
 * fresh paginated cursor. `getNextPageParam` reads the server's
 * `pagination.hasNext` / `pagination.nextCursor` contract.
 *
 * @param {Object} args
 * @param {'site'|'installation'} args.entityType
 * @param {string} args.entityId
 * @param {{ type?: string, dateFrom?: string, dateTo?: string, order?: 'asc'|'desc' }} [args.filters]
 * @param {number} [args.limit]
 */
export function useActivityTimeline({ entityType, entityId, filters = {}, limit = DEFAULT_LIMIT }) {
  const { type, dateFrom, dateTo, order = 'desc' } = filters;

  const query = useInfiniteQuery({
    queryKey: queryKeys.crm.activity.timeline(entityType, entityId, { type, dateFrom, dateTo, order, limit }),
    queryFn: ({ pageParam = null }) => {
      const params = { limit, order };
      if (pageParam) params.cursor = pageParam;
      if (type && type !== 'all') params.type = type;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      return activityService.getActivity(entityType, entityId, params);
    },
    initialPageParam: null,
    getNextPageParam: (lastPage) => (
      lastPage?.pagination?.hasNext ? lastPage?.pagination?.nextCursor : null
    ),
    enabled: !!entityId,
  });

  const items = query.data?.pages.flatMap((p) => p.data ?? []) ?? [];

  const exportMutation = useMutation({
    mutationFn: ({ format } = {}) => activityService.exportActivity({
      entityType,
      entityId,
      format,
      filters: { type, dateFrom, dateTo },
    }),
  });

  return { ...query, items, exportMutation };
}
