'use client';
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { chatService } from '../services/chat-service';
import { getExistingSocket } from '@/modules/mobile/lib/websocket-client';
import { useAuth } from '@/shared/hooks/use-auth';

export function useChatMessages(roomId) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [typingUsers, setTypingUsers] = useState([]);

  const query = useQuery({
    queryKey: queryKeys.chat.messages(roomId),
    queryFn: () => chatService.listMessages(roomId, { limit: 50 }),
    enabled: !!roomId,
    staleTime: 0,
  });

  useEffect(() => {
    if (!roomId) return;
    const socket = getExistingSocket();
    if (!socket) return;

    socket.emit('join room', { roomId });

    const onNewMessage = ({ message }) => {
      queryClient.setQueryData(queryKeys.chat.messages(roomId), (old = []) => {
        if (old.some((m) => m._id === message._id)) return old;
        return [...old, message];
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms() });
    };

    const onReactionUpdated = ({ messageId, reactions }) => {
      queryClient.setQueryData(queryKeys.chat.messages(roomId), (old = []) =>
        old.map((m) => (m._id === messageId ? { ...m, reactions } : m))
      );
    };

    const onMessageDeleted = ({ messageId }) => {
      queryClient.setQueryData(queryKeys.chat.messages(roomId), (old = []) =>
        old.map((m) => (m._id === messageId ? { ...m, isDeleted: true } : m))
      );
    };

    const onMessageEdited = ({ messageId, content, editedAt }) => {
      queryClient.setQueryData(queryKeys.chat.messages(roomId), (old = []) =>
        old.map((m) => (m._id === messageId ? { ...m, content, editedAt } : m))
      );
    };

    const onTyping = ({ userId, userName }) => {
      if (userId === user?._id) return;
      setTypingUsers((prev) => {
        if (prev.some((u) => u.userId === userId)) return prev;
        return [...prev, { userId, userName }];
      });
    };

    const onStopTyping = ({ userId }) => {
      setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
    };

    const onRoomUpdated = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms() });
    };

    socket.on('chat:new_message', onNewMessage);
    socket.on('chat:reaction_updated', onReactionUpdated);
    socket.on('chat:message_deleted', onMessageDeleted);
    socket.on('chat:message_edited', onMessageEdited);
    socket.on('chat:typing', onTyping);
    socket.on('chat:stop typing', onStopTyping);
    socket.on('chat:room_updated', onRoomUpdated);

    return () => {
      socket.off('chat:new_message', onNewMessage);
      socket.off('chat:reaction_updated', onReactionUpdated);
      socket.off('chat:message_deleted', onMessageDeleted);
      socket.off('chat:message_edited', onMessageEdited);
      socket.off('chat:typing', onTyping);
      socket.off('chat:stop typing', onStopTyping);
      socket.off('chat:room_updated', onRoomUpdated);
    };
  }, [roomId, queryClient, user?._id]);

  return { ...query, typingUsers };
}
