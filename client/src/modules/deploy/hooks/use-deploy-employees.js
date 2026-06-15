'use client';

import { useUserDirectory } from '@/modules/users/hooks/use-user-directory';

export function useDeployEmployees(options = {}) {
  return useUserDirectory(options);
}
