'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { userService } from '@/modules/users/services/user-service';

const DEFAULT_USER_DIRECTORY_LIMIT = 80;

export function useUserDirectory(options = {}) {
  const {
    search = '',
    limit = DEFAULT_USER_DIRECTORY_LIMIT,
    enabled = true,
    ...queryOptions
  } = options;
  const trimmedSearch = search.trim();
  const params = {
    limit,
    ...(trimmedSearch ? { search: trimmedSearch } : {}),
  };

  return useQuery({
    queryKey: queryKeys.users.directory(params),
    queryFn: () => userService.getDirectory(params),
    staleTime: 300_000,
    enabled,
    ...queryOptions,
  });
}
