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
      qc.invalidateQueries({ queryKey: queryKeys.doctpl.templates.versions(v.id) });
      qc.invalidateQueries({ queryKey: ['doctpl', 'templates', 'compare', v.id] });
      qc.invalidateQueries({ queryKey: ['doctpl', 'templates', 'list'] });
    },
  });
};

export const useDuplicateTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => templateService.duplicate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['doctpl', 'templates', 'list'] }),
  });
};

export const useDeleteTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => templateService.remove(id),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.doctpl.templates.detail(v.id) });
      qc.invalidateQueries({ queryKey: ['doctpl', 'templates', 'list'] });
    },
  });
};

export const useRevertTemplate = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, expectedVersion }) => templateService.revert(id, version, expectedVersion ? { expectedVersion } : undefined),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.doctpl.templates.detail(v.id) });
      qc.invalidateQueries({ queryKey: queryKeys.doctpl.templates.versions(v.id) });
      qc.invalidateQueries({ queryKey: ['doctpl', 'templates', 'compare', v.id] });
      qc.invalidateQueries({ queryKey: ['doctpl', 'templates', 'list'] });
    },
  });
};

export const usePreviewTemplate = () => useMutation({
  mutationFn: ({ id, sampleData, language, draftTemplate }) => templateService.preview(id, { sampleData, language, draftTemplate }),
});

export const usePreviewTemplateVersion = () => useMutation({
  mutationFn: ({ id, version, sampleData, language }) => templateService.previewVersion(id, version, { sampleData, language }),
});
