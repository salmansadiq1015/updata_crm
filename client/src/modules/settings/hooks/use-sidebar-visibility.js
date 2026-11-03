'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { useAuth } from '@/shared/hooks/use-auth';

const queryKey = ['company-sidebar'];

export function filterSidebarMenus(items, hiddenMenus = []) {
  const hidden = new Set(hiddenMenus);
  return items.flatMap((item) => {
    if (item.href !== '/admin/settings' && hidden.has(item.key || item.href)) return [];
    if (!item.children) return [item];
    const children = filterSidebarMenus(item.children, hiddenMenus);
    return children.length ? [{ ...item, children }] : [];
  });
}

export function useSidebarVisibility() {
  const { user } = useAuth();
  return useQuery({
    queryKey,
    queryFn: async () => (await apiClient.get('/system/sidebar')).data,
    enabled: !!user,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useSaveSidebarVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (hiddenMenus) => (await apiClient.put('/system/sidebar', { hiddenMenus })).data,
    onSuccess: (data) => queryClient.setQueryData(queryKey, data),
  });
}
