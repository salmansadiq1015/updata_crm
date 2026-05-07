import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { templateService } from '../services/TemplateService';

export const useCreateTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: templateService.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doctpl', 'templates'] }),
  });
};

export const useUpdateTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...d }) => templateService.update(id, d),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.doctpl.templates.detail(v.id) });
      qc.invalidateQueries({ queryKey: ['doctpl', 'templates', 'list'] });
    },
  });
};

export const useRevertTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }) => templateService.revert(id, version),
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: queryKeys.doctpl.templates.detail(v.id) }),
  });
};

export const usePreviewTemplate = () => useMutation({
  mutationFn: ({ id, sampleData, language }) => templateService.preview(id, { sampleData, language }),
});
