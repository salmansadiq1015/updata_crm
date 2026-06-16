import { useMutation, useQueryClient } from '@tanstack/react-query';
import { quotationTemplateService } from '../services/quotation-template-service';

export function useQuotationTemplateMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['qop', 'quotation-templates'] });

  const createTemplate = useMutation({ mutationFn: quotationTemplateService.create, onSuccess: invalidate });
  const updateTemplate = useMutation({
    mutationFn: ({ id, data }) => quotationTemplateService.update(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['qop', 'quotation-templates', 'detail', id] });
      invalidate();
    },
  });
  const deleteTemplate = useMutation({
    mutationFn: quotationTemplateService.remove,
    onSuccess: invalidate,
  });
  const recordUsage = useMutation({
    mutationFn: quotationTemplateService.recordUsage,
  });

  return { createTemplate, updateTemplate, deleteTemplate, recordUsage };
}
