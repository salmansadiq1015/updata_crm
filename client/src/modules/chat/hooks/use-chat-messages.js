'use client';
import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { queryKeys } from '@/lib/query/keys';
import { chatService } from '../services/chat-service';
import { onSocketConnect } from '@/lib/socket/client';
import { useAuth } from '@/shared/hooks/use-auth';

export function useChatMessages(roomId) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [typingUsers, setTypingUsers] = useState([]);

  const query = useQuery({
    queryKey: queryKeys.chat.messages(roomId),
    queryFn: () => chatService.listMessages(roomId, { limit: 50 }),
    enabled: !!roomId,
    staleTime: 0,
  });

  // Stable ref for userId to avoid re-registering on every render
  const userId = user?._id;

  useEffect(() => {
    if (!roomId) return;

    let cleanupListeners = null;

    // onSocketConnect fires immediately if already connected, or waits for
    // the socket to connect (handles the SocketProvider/child effect race).
    // It also fires on every subsequent reconnect, re-joining the room.
    const unsubscribe = onSocketConnect((socket) => {
      // Remove stale listeners from a previous connection cycle
      if (cleanupListeners) cleanupListeners();

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

      const onTyping = ({ userId: typingId, userName }) => {
        if (typingId === userId) return;
        setTypingUsers((prev) => {
          if (prev.some((u) => u.userId === typingId)) return prev;
          return [...prev, { userId: typingId, userName }];
        });
      };

      const onStopTyping = ({ userId: stoppedId }) => {
        setTypingUsers((prev) => prev.filter((u) => u.userId !== stoppedId));
      };

      const onRead = ({ userId: readerId, readAt }) => {
        queryClient.setQueryData(queryKeys.chat.messages(roomId), (old = []) =>
          old.map((message) => {
            const senderId = String(message.senderId?._id || message.senderId || message.sender_id || '');
            if (!readerId || senderId === String(readerId)) return message;
            const existing = message.readBy ?? [];
            if (existing.some((entry) => String(entry.userId?._id || entry.userId || entry) === String(readerId))) {
              return message;
            }
            return {
              ...message,
              readBy: [...existing, { userId: readerId, readAt }],
            };
          })
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms() });
      };

      const onRoomUpdated = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms() });
      };

      const onRoomDeleted = ({ roomId: deletedId }) => {
        if (deletedId === roomId) {
          queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms() });
          router.push('/field-ops/chat');
        }
      };

      socket.on('chat:new_message', onNewMessage);
      socket.on('chat:reaction_updated', onReactionUpdated);
      socket.on('chat:message_deleted', onMessageDeleted);
      socket.on('chat:message_edited', onMessageEdited);
      socket.on('chat:typing', onTyping);
      socket.on('chat:stop typing', onStopTyping);
      socket.on('chat:read', onRead);
      socket.on('chat:room_updated', onRoomUpdated);
      socket.on('chat:room_deleted', onRoomDeleted);

      cleanupListeners = () => {
        socket.off('chat:new_message', onNewMessage);
        socket.off('chat:reaction_updated', onReactionUpdated);
        socket.off('chat:message_deleted', onMessageDeleted);
        socket.off('chat:message_edited', onMessageEdited);
        socket.off('chat:typing', onTyping);
        socket.off('chat:stop typing', onStopTyping);
        socket.off('chat:read', onRead);
        socket.off('chat:room_updated', onRoomUpdated);
        socket.off('chat:room_deleted', onRoomDeleted);
      };
    });

    return () => {
      unsubscribe();
      if (cleanupListeners) cleanupListeners();
    };
  // router is a stable reference from useRouter — excluded intentionally
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, queryClient, userId]);

  return { ...query, typingUsers };
}
