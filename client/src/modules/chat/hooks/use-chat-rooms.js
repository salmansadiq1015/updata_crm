'use client';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { chatService } from '../services/chat-service';

export function useChatRooms() {
  return useQuery({
    queryKey: queryKeys.chat.rooms(),
    queryFn: chatService.listRooms,
    staleTime: 30_000,
  });
}

export function useChatRoom(roomId) {
  return useQuery({
    queryKey: queryKeys.chat.room(roomId),
    queryFn: () => chatService.getRoom(roomId),
    enabled: !!roomId,
    staleTime: 60_000,
  });
}
