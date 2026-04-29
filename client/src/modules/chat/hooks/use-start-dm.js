'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { queryKeys } from '@/lib/query/keys';
import { chatService } from '../services/chat-service';

export function useStartDm() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: (targetUserId) => chatService.getOrCreateDmRoom(targetUserId),
    onSuccess: (room) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms() });
      router.push(`/field-ops/chat?chatId=${room._id}`);
    },
  });
}
