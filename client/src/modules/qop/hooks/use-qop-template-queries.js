import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { quotationTemplateService } from '../services/quotation-template-service';

export function useQuotationTemplates(params = {}) {
  return useQuery({
    queryKey: queryKeys.qop.quotationTemplates(params),
    queryFn: () => quotationTemplateService.list(params),
    select: (r) => (Array.isArray(r.data) ? r.data : []),
    staleTime: 2 * 60 * 1000,
  });
}

export function useQuotationTemplateDetail(id) {
  return useQuery({
    queryKey: queryKeys.qop.quotationTemplateDetail(id),
    queryFn: () => quotationTemplateService.getById(id),
    enabled: !!id,
    select: (r) => r.data,
  });
}

export function useQuotationTemplateCategories() {
  return useQuery({
    queryKey: queryKeys.qop.quotationTemplateCategories(),
    queryFn: quotationTemplateService.listCategories,
    select: (r) => (Array.isArray(r.data) ? r.data : []),
    staleTime: 5 * 60 * 1000,
  });
}

export function useRecurringItems(params = {}) {
  return useQuery({
    queryKey: queryKeys.qop.recurringItems(params),
    queryFn: () => quotationTemplateService.recurringItems(params),
    select: (r) => (Array.isArray(r.data) ? r.data : []),
    staleTime: 5 * 60 * 1000,
  });
}
