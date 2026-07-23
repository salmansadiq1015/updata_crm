'use client';
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { getSocket } from '@/lib/socket/client';
import { chatService } from '../services/chat-service';

export function useChatRooms({ enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.chat.rooms(),
    queryFn: chatService.listRooms,
    staleTime: 30_000,
    enabled,
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

export function useProjectChatRoom(projectId, { enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.chat.projectRoom(projectId),
    queryFn: () => chatService.getOrCreateProjectRoom(projectId),
    enabled: !!projectId && enabled,
    retry: false,
    staleTime: 60_000,
  });
}

export function useProjectChatUnread(projectId, { enabled = true } = {}) {
  const queryClient = useQueryClient();
  const { data: rooms } = useChatRooms({ enabled });

  useEffect(() => {
    if (!enabled) return;
    const socket = getSocket();
    if (!socket) return;
    const handler = () => queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms() });
    socket.on('chat:room_updated', handler);
    return () => socket.off('chat:room_updated', handler);
  }, [enabled, queryClient]);

  return useMemo(() => {
    const room = (rooms ?? []).find(
      (r) => r.roomType === 'PROJECT' && String(r.projectId?._id ?? r.projectId) === String(projectId)
    );
    return { unreadCount: room?.unreadCount ?? 0, roomId: room?._id ?? null };
  }, [rooms, projectId]);
}
