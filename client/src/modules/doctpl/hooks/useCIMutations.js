import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { ciService } from '../services/CIService';

export const useUpdateCIConfig = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ciService.updateConfig,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.doctpl.ci.config() }),
  });
};

export const useUploadCIAsset = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ciService.uploadAsset,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.doctpl.ci.assets() }),
  });
};

export const useDeleteCIAsset = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ciService.deleteAsset,
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.doctpl.ci.assets() }),
  });
};
