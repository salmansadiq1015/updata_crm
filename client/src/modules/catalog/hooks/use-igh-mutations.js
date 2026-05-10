import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { ighService } from '../services/igh-service';

export function useIghMutations() {
  const qc = useQueryClient();

  const saveConfig = useMutation({
    mutationFn: ighService.saveConfig,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.catalog.ighConfig() }),
  });

  const previewImport = useMutation({
    mutationFn: ighService.previewImport,
  });

  const importFull = useMutation({
    mutationFn: ighService.importFull,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.catalog.ighImportHistory() }),
  });

  const importDelta = useMutation({
    mutationFn: ighService.importDelta,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.catalog.ighImportHistory() }),
  });

  return { saveConfig, previewImport, importFull, importDelta };
}
