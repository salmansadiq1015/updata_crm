'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { chatService } from '../services/chat-service';

export function useChatMutations(roomId) {
  const queryClient = useQueryClient();
  const invalidateMessages = () => queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(roomId) });
  const invalidateRooms = () => queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms() });

  const sendMessage = useMutation({
    mutationFn: (data) => chatService.sendMessage(roomId, data),
    onSuccess: () => { invalidateRooms(); },
  });

  const deleteMessage = useMutation({
    mutationFn: (msgId) => chatService.deleteMessage(roomId, msgId),
    onSuccess: invalidateMessages,
  });

  const editMessage = useMutation({
    mutationFn: ({ msgId, content }) => chatService.editMessage(roomId, msgId, content),
    onSuccess: invalidateMessages,
  });

  const addReaction = useMutation({
    mutationFn: ({ msgId, emoji }) => chatService.addReaction(roomId, msgId, emoji),
  });

  const removeReaction = useMutation({
    mutationFn: ({ msgId, emoji }) => chatService.removeReaction(roomId, msgId, emoji),
  });

  const markRead = useMutation({
    mutationFn: () => chatService.markRead(roomId),
    onSuccess: invalidateRooms,
  });

  const blockUser = useMutation({
    mutationFn: () => chatService.blockUser(roomId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.chat.room(roomId) }),
  });

  const unblockUser = useMutation({
    mutationFn: () => chatService.unblockUser(roomId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.chat.room(roomId) }),
  });

  return { sendMessage, deleteMessage, editMessage, addReaction, removeReaction, markRead, blockUser, unblockUser };
}
