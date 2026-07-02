'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { healthService } from '@/modules/platform/services/health-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useDebounce } from '@/shared/hooks/use-debounce';
import {
  SETTINGS_HUB_CATEGORIES,
  SETTINGS_HUB_DEFAULT_CATEGORY,
  SETTINGS_HUB_ITEMS,
} from '../constants/settings-hub';
import {
  buildSettingsHubStats,
  filterSettingsHubItems,
  getVisibleSettingsCategories,
  getVisibleSettingsItems,
  groupSettingsItemsByCategory,
} from '../utils/settings-hub-utils';

export function useSettingsHubController() {
  const { t } = useLanguage();
  const { hasPermission } = usePermissions();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(SETTINGS_HUB_DEFAULT_CATEGORY);
  const debouncedSearch = useDebounce(search, 200);

  const healthQuery = useQuery({
    queryKey: ['settings-hub', 'health'],
    queryFn: healthService.getStatus,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const visibleItems = useMemo(
    () => getVisibleSettingsItems(SETTINGS_HUB_ITEMS, hasPermission),
    [hasPermission],
  );
  const visibleCategories = useMemo(
    () => getVisibleSettingsCategories(SETTINGS_HUB_CATEGORIES, visibleItems),
    [visibleItems],
  );
  const filteredItems = useMemo(
    () => filterSettingsHubItems(visibleItems, {
      category,
      search: debouncedSearch,
      translate: t,
    }),
    [category, debouncedSearch, t, visibleItems],
  );
  const stats = useMemo(
    () => buildSettingsHubStats(
      visibleItems,
      visibleCategories,
      healthQuery.data?.status || 'unknown',
    ),
    [healthQuery.data?.status, visibleCategories, visibleItems],
  );
  const groupedItems = useMemo(
    () => groupSettingsItemsByCategory(filteredItems),
    [filteredItems],
  );

  return {
    t,
    filters: {
      search,
      category,
      setSearch,
      setCategory,
      clearSearch: () => setSearch(''),
    },
    data: {
      categories: visibleCategories,
      filteredItems,
      groupedItems,
      stats,
      visibleItems,
    },
    state: {
      isHealthLoading: healthQuery.isLoading,
      isHealthFetching: healthQuery.isFetching,
      hasAccess: visibleItems.length > 0,
      hasResults: filteredItems.length > 0,
    },
    actions: {
      refreshHealth: () => healthQuery.refetch(),
    },
  };
}
