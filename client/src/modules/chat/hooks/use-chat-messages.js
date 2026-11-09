'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { queryKeys } from '@/lib/query/keys';
import { chatService } from '../services/chat-service';
import { getSocket, onSocketConnect } from '@/lib/socket/client';
import { useAuth } from '@/shared/hooks/use-auth';

export function mergeChatMessages(older = [], newer = []) {
  const byId = new Map([...older, ...newer].map(message => [String(message._id), message]));
  return [...byId.values()].sort((a, b) => new Date(a.sentAt || a.createdAt) - new Date(b.sentAt || b.createdAt) || String(a._id).localeCompare(String(b._id)));
}

export function useChatMessages(roomId) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [typingState, setTypingState] = useState({ roomId: null, users: [] });
  const [exhausted, setExhausted] = useState(null);
  const key = queryKeys.chat.messages(roomId);
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const latest = await chatService.listMessages(roomId, { limit: 50 }, { signal });
      const previous = queryClient.getQueryData(key) || [];
      // Keep loaded history while refreshing the latest page after reconnect/polling.
      const first = latest[0];
      const older = first ? previous.filter(message => new Date(message.sentAt) < new Date(first.sentAt) || (message.sentAt === first.sentAt && String(message._id) < String(first._id))) : [];
      return mergeChatMessages(older, latest);
    },
    enabled: !!roomId,
    staleTime: 15_000,
    // Sockets deliver live changes; keep a slower safety refresh while connected.
    refetchInterval: () => getSocket()?.connected ? 60_000 : 15_000,
  });
  const older = useMutation({
    mutationFn: async () => {
      const first = queryClient.getQueryData(key)?.[0];
      if (!first) return [];
      return chatService.listMessages(roomId, { limit: 50, before: first.sentAt || first.createdAt, beforeId: first._id });
    },
    onSuccess: page => {
      if (page.length < 50) setExhausted(roomId);
      queryClient.setQueryData(key, (current = []) => mergeChatMessages(page, current));
    },
  });
  const userId = user?._id;
  useEffect(() => {
    if (!roomId) return;
    let cleanup;
    const unsubscribe = onSocketConnect(socket => {
      cleanup?.();
      socket.emit('join room', { roomId });
      // Joining during the initial fetch must not cancel and restart that request.
      if (queryClient.getQueryState(queryKeys.chat.messages(roomId))?.fetchStatus !== 'fetching') {
        queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages(roomId) });
      }
      const belongs = event => String(event.roomId || event.message?.roomId || '') === String(roomId);
      const refreshRooms = () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.chat.rooms() });
      };
      const onRoomUpdated = event => {
        refreshRooms();
        // Message/read events do not change the membership or room context.
        // Only refresh details for metadata changes to this conversation.
        if (belongs(event) && !event.lastMessageAt) {
          queryClient.invalidateQueries({ queryKey: queryKeys.chat.room(roomId) });
        }
      };
      const onNew = event => {
        if (!belongs(event)) return;
        queryClient.setQueryData(queryKeys.chat.messages(roomId), (current = []) => mergeChatMessages(current, [event.message]));
        refreshRooms();
      };
      const update = (event, patch) => {
        if (event.roomId && !belongs(event)) return;
        queryClient.setQueryData(queryKeys.chat.messages(roomId), (current = []) => current.map(message => String(message._id) === String(event.messageId) ? { ...message, ...patch } : message));
      };
      const onReaction = event => update(event, { reactions: event.reactions });
      const onDeleted = event => update(event, { isDeleted: true });
      const onEdited = event => update(event, { content: event.content, editedAt: event.editedAt });
      const onTyping = event => {
        if (!belongs(event) || String(event.userId) === String(userId)) return;
        setTypingState(previous => ({ roomId, users: [...(previous.roomId === roomId ? previous.users : []).filter(item => item.userId !== event.userId), { userId: event.userId, userName: event.userName, at: Date.now() }] }));
      };
      const onStop = event => { if (belongs(event)) setTypingState(previous => ({ ...previous, users: previous.users.filter(item => item.userId !== event.userId) })); };
      const onRead = event => {
        if (!belongs(event)) return;
        queryClient.setQueryData(queryKeys.chat.messages(roomId), (current = []) => current.map(message => {
          if (String(message.senderId?._id || message.senderId) === String(event.userId) || (message.readBy || []).some(entry => String(entry.userId?._id || entry.userId) === String(event.userId))) return message;
          return { ...message, readBy: [...(message.readBy || []), { userId: event.userId, readAt: event.readAt }] };
        }));
        refreshRooms();
      };
      const onRoomDeleted = event => { if (belongs(event)) { refreshRooms(); router.push('/field-ops/chat'); } };
      const listeners = { 'chat:new_message': onNew, 'chat:message_updated': onNew, 'chat:reaction_updated': onReaction, 'chat:message_deleted': onDeleted, 'chat:message_edited': onEdited, 'chat:typing': onTyping, 'chat:stop typing': onStop, 'chat:read': onRead, 'chat:room_updated': onRoomUpdated, 'chat:room_deleted': onRoomDeleted };
      Object.entries(listeners).forEach(([event, handler]) => socket.on(event, handler));
      const timer = setInterval(() => setTypingState(previous => ({ ...previous, users: previous.users.filter(item => Date.now() - item.at < 8000) })), 2000);
      cleanup = () => { clearInterval(timer); Object.entries(listeners).forEach(([event, handler]) => socket.off(event, handler)); socket.emit('leave room', { roomId }); };
    });
    return () => { unsubscribe(); cleanup?.(); };
  }, [roomId, queryClient, userId, router]);
  return { ...query, typingUsers: typingState.roomId === roomId ? typingState.users : [], fetchOlder: older.mutateAsync, isFetchingOlder: older.isPending, olderError: older.error, hasOlder: query.data?.length >= 50 && exhausted !== roomId };
}
