'use client';

import { useQuery } from '@tanstack/react-query';
import { chatService } from '../services/chat-service';

export function useChatUsers({ enabled = true, search = '' } = {}) {
  return useQuery({
    queryKey: ['chat', 'directory', 'users', 'active', search],
    queryFn: () => chatService.listUsers(search),
    enabled,
    staleTime: 60_000,
  });
}

export function useChatProjects({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['chat', 'directory', 'projects'],
    queryFn: () => chatService.listProjects(),
    enabled,
    staleTime: 60_000,
  });
}
