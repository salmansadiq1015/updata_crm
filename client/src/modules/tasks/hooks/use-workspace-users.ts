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
};

const toApiResponse = <T>(value: unknown): ApiEnvelope<T> => value as ApiEnvelope<T>;

function normalizeUser(raw: unknown): WorkspaceUser {
  const r = raw as Record<string, unknown>;
  return {
    id: String((r._id ?? r.id) ?? ''),
    firstName: String(r.firstName ?? ''),
    lastName:  String(r.lastName ?? ''),
    email:     String(r.email ?? ''),
    avatarUrl: (r.avatarUrl ?? r.avatar ?? null) as string | null,
  };
}

export function useWorkspaceUsers() {
  return useQuery({
    queryKey: ['users', 'directory'],
    queryFn: async () => {
      // /users/directory is available to all authenticated users (no admin permission required).
      const response = toApiResponse<unknown>(
        await apiClient.get(ENDPOINTS.USERS.DIRECTORY),
      );
      const payload = response.data;
      const items = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as any)?.users)
          ? (payload as any).users
          : [];
      return (items as unknown[]).map(normalizeUser).filter((u) => u.id);
    },
    staleTime: 5 * 60_000,
    gcTime:   15 * 60_000,
    retry: 1,
  });
}
