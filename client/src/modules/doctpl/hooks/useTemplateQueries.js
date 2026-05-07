import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { templateService } from '../services/TemplateService';

export const useTemplates = (f = {}) => useQuery({
  queryKey: queryKeys.doctpl.templates.list(f),
  queryFn: () => templateService.list(f),
  select: (r) => ({ items: r?.data ?? [], pagination: r?.pagination }),
});

export const useTemplateDetail = (id) => useQuery({
  queryKey: queryKeys.doctpl.templates.detail(id),
  queryFn: () => templateService.getById(id),
  enabled: !!id,
  select: (r) => r?.data,
});

export const useTemplateVersions = (id) => useQuery({
  queryKey: queryKeys.doctpl.templates.versions(id),
  queryFn: () => templateService.listVersions(id),
  enabled: !!id,
  select: (r) => ({ items: r?.data ?? [], total: r?.total ?? 0 }),
});
