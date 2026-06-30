'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { chatService } from '../services/chat-service';

export function useChatSearch({ query, roomId, messageType, enabled = true }) {
  const trimmedQuery = query.trim();
  const params = {
    q: trimmedQuery,
    ...(roomId ? { roomId } : {}),
    ...(messageType && messageType !== 'ALL' ? { messageType } : {}),
    limit: 25,
  };

  return useQuery({
    queryKey: queryKeys.chat.search(params),
    queryFn: () => chatService.searchMessages(params),
    enabled: enabled && trimmedQuery.length >= 2,
    staleTime: 15_000,
  });
}
