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
    onSuccess: (res, v) => {
      // Seed the detail cache with the saved template right away so the editor
      // reflects the change immediately. Without this the query briefly returns
      // stale data while refetching, which reset the rich-text editor back to
      // the previous value and looked like the entered text was lost.
      if (res?.data) qc.setQueryData(queryKeys.doctpl.templates.detail(v.id), res);
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

const useApprovalMutation = (action) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...payload }) => action(id, payload),
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.doctpl.templates.detail(v.id) });
      qc.invalidateQueries({ queryKey: ['doctpl', 'templates', 'list'] });
    },
  });
};

export const useRequestTemplateApproval = () => useApprovalMutation(
  (id, { note } = {}) => templateService.requestApproval(id, note ? { note } : {}),
);

export const useApproveTemplate = () => useApprovalMutation(
  (id, { note } = {}) => templateService.approve(id, note ? { note } : {}),
);

export const useRejectTemplate = () => useApprovalMutation(
  (id, { reason } = {}) => templateService.reject(id, { reason }),
);

export const usePreviewTemplate = () => useMutation({
  mutationFn: ({ id, sampleData, language, draftTemplate }) => templateService.preview(id, { sampleData, language, draftTemplate }),
});

export const usePreviewTemplateVersion = () => useMutation({
  mutationFn: ({ id, version, sampleData, language }) => templateService.previewVersion(id, version, { sampleData, language }),
});
