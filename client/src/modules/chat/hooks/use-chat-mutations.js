'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { queryKeys } from '@/lib/query/keys';
import { chatService } from '../services/chat-service';

export function useChatMutations(roomId) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const invalidateMessages = () => queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(roomId) });
  const invalidateRooms = () => queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms() });

  const sendMessage = useMutation({
    mutationFn: (data) => chatService.sendMessage(roomId, data),
    onSuccess: (newMessage) => {
      // Immediately add the sent message to the cache — don't wait for socket echo
      queryClient.setQueryData(queryKeys.chat.messages(roomId), (old = []) => {
        if (old.some((m) => m._id === newMessage._id)) return old;
        return [...old, newMessage];
      });
      invalidateRooms();
    },
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

  const createGroupRoom = useMutation({
    mutationFn: (payload) => chatService.createGroupRoom(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms() }),
  });

  const joinByCode = useMutation({
    mutationFn: (joinCode) => chatService.joinByCode(joinCode),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms() }),
  });

  const leaveRoom = useMutation({
    mutationFn: (roomId) => chatService.leaveRoom(roomId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms() });
      router.push('/field-ops/chat');
    },
  });

  const deleteRoom = useMutation({
    mutationFn: (id) => chatService.deleteRoom(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms() });
      router.push('/field-ops/chat');
    },
  });

  const refreshJoinCode = useMutation({
    mutationFn: (roomId) => chatService.refreshJoinCode(roomId),
  });

  return { sendMessage, deleteMessage, editMessage, addReaction, removeReaction, markRead, blockUser, unblockUser, createGroupRoom, joinByCode, leaveRoom, deleteRoom, refreshJoinCode };
}
