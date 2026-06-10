'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { userService } from '@/modules/users/services/user-service';

const EMPLOYEE_LIST_PARAMS = { limit: 200 };

function unwrapUsersResponse(res) {
  const items = res?.data?.data || res?.data || [];
  return Array.isArray(items) ? items : [];
}

export function useDeployEmployees(options = {}) {
  return useQuery({
    queryKey: queryKeys.users.list(EMPLOYEE_LIST_PARAMS),
    queryFn: () => userService.getUsers(EMPLOYEE_LIST_PARAMS),
    staleTime: 300_000,
    select: unwrapUsersResponse,
    ...options,
  });
}
