'use client';

import { useMutation } from '@tanstack/react-query';
import { installationService } from '../services/installation-service';

export function useNameplateOcr() {
  return useMutation({
    mutationFn: ({ file, installationId = null }) => installationService.extractNameplate(file, installationId),
    retry: false,
  });
}
