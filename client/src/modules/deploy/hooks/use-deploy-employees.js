'use client';

import { useUserDirectory } from '@/modules/users/hooks/use-user-directory';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { deployEmployeeService } from '../services/employee-service';

export function useDeployEmployees(options = {}) {
  const {
    search = '',
    limit = 80,
    enabled = true,
    startDatetime,
    endDatetime,
    requiredSkills,
    recommendedSkills,
    requiredCertifications,
    recommendedCertifications,
    includeEmployeeIds,
    ...queryOptions
  } = options;

  const trimmedSearch = search.trim();
  const params = {
    // Server caps `limit` at 100 (employee.validation.js) — a higher value 400s
    // and silently empties the list. Clamp so no caller can trip that.
    limit: Math.min(limit, 100),
    ...(trimmedSearch ? { search: trimmedSearch } : {}),
    ...(startDatetime && endDatetime ? { startDatetime, endDatetime } : {}),
    ...(requiredSkills ? { requiredSkills } : {}),
    ...(recommendedSkills ? { recommendedSkills } : {}),
    ...(requiredCertifications ? { requiredCertifications } : {}),
    ...(recommendedCertifications ? { recommendedCertifications } : {}),
    ...(includeEmployeeIds ? { includeEmployeeIds } : {}),
  };

  return useQuery({
    queryKey: queryKeys.deploy.employees(params),
    queryFn: () => deployEmployeeService.listEmployees(params),
    staleTime: 30_000,
    enabled,
    placeholderData: (previous) => previous,
    ...queryOptions,
  });
}

export function useFallbackDeployEmployees(options = {}) {
  return useUserDirectory(options);
}
