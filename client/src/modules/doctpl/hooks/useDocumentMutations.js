import { useMutation, useQueryClient } from '@tanstack/react-query';
import { documentService } from '../services/DocumentService';

export const useGenerateDocument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: documentService.generate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doctpl', 'documents'] }),
  });
};

export const useDeleteDocument = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: documentService.delete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doctpl', 'documents'] }),
  });
};

export const useDownloadDocument = () => useMutation({
  mutationFn: (id) => documentService.download(id),
});
