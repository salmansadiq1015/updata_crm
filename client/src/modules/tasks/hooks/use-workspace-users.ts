'use client';

import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';

export type WorkspaceUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
};

type ApiEnvelope<T> = {
  data?: T;
  meta?: Record<string, unknown>;
  pagination?: unknown;
};

const toApiResponse = <T>(value: unknown): ApiEnvelope<T> => value as ApiEnvelope<T>;

function normalizeUser(raw: unknown): WorkspaceUser {
  const r = raw as Record<string, unknown>;
  return {
    id: ((r._id ?? r.id) as string) ?? '',
    firstName: (r.firstName as string) ?? '',
    lastName: (r.lastName as string) ?? '',
    email: (r.email as string) ?? '',
    avatarUrl: (r.avatarUrl ?? r.avatar ?? null) as string | null,
  };
}

export function useWorkspaceUsers() {
  return useQuery({
    queryKey: ['users', 'workspace', 'active'],
    queryFn: async () => {
      const response = toApiResponse<unknown>(
        await apiClient.get(ENDPOINTS.USERS.LIST, {
          params: { status: 'active', limit: 200 },
        }),
      );
      // The interceptor unwraps the envelope — response.data holds the payload.
      // Payload may be an array directly, or { users: [...] }, or { data: [...] }.
      const payload = response.data;
      const items = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as any)?.users)
          ? (payload as any).users
          : Array.isArray((payload as any)?.data)
            ? (payload as any).data
            : [];
      return (items as unknown[]).map(normalizeUser);
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });
}
