'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { chatService } from '../services/chat-service';
import { db, enqueueSync } from '../db/mobile-db';
import { useOfflineQuery } from './use-offline-query';
import { useOfflineMutation } from './use-offline-mutation';
import { SYNC_STATUS, SYNC_ENTITY_TYPE } from '../constants/mobile-constants';
import { getExistingSocket } from '../lib/websocket-client';

export function useChatMessages(projectId) {
  const queryClient = useQueryClient();
  const [typingUsers, setTypingUsers] = useState([]);

  const query = useOfflineQuery({
    queryKey: queryKeys.mobile.chat.byProject(projectId),
    queryFn: () => chatService.getMessages(projectId),
    offlineFn: () =>
      db.chatMessages
        .where('project_id')
        .equals(projectId)
        .sortBy('sent_at'),
    onServerData: async (res) => {
      const messages = Array.isArray(res) ? res : res?.data || [];
      for (const msg of messages) {
        await db.chatMessages.put({ ...msg, last_synced_at: new Date().toISOString() });
      }
    },
    enabled: !!projectId,
    staleTime: 0,
  });

  useEffect(() => {
    if (!projectId) return;

    const socket = getExistingSocket();
    if (!socket) return;

    socket.emit('join chat', { projectId });

    const onNewMessage = (message) => {
      queryClient.setQueryData(
        queryKeys.mobile.chat.byProject(projectId),
        (old) => {
          const existing = Array.isArray(old) ? old : [];
          const alreadyExists = existing.some((m) => m.id === message.id);
          return alreadyExists ? existing : [...existing, message];
        }
      );
      db.chatMessages.put({ ...message, last_synced_at: new Date().toISOString() });
    };

    const onTyping = ({ userId, userName }) => {
      setTypingUsers((prev) =>
        prev.some((u) => u.userId === userId) ? prev : [...prev, { userId, userName }]
      );
    };

    const onStopTyping = ({ userId }) => {
      setTypingUsers((prev) => prev.filter((u) => u.userId !== userId));
    };

    socket.on('NewMessageAdded', onNewMessage);
    socket.on('typing', onTyping);
    socket.on('stop typing', onStopTyping);

    return () => {
      socket.off('NewMessageAdded', onNewMessage);
      socket.off('typing', onTyping);
      socket.off('stop typing', onStopTyping);
    };
  }, [projectId, queryClient]);

  return { ...query, typingUsers };
}

export function useChatMembers(projectId) {
  // Returns project members for @mention suggestions.
  // Extend with a real API call when a /mobile/projects/:id/members endpoint is available.
  return { data: [] };
}

export function useChatMutations(projectId) {
  const queryClient = useQueryClient();
  const keys = [queryKeys.mobile.chat.byProject(projectId)];

  const sendMessage = useOfflineMutation({
    mutationFn: (data) => chatService.sendMessage(projectId, data),
    entityType: SYNC_ENTITY_TYPE.CHAT_MESSAGE,
    invalidateKeys: keys,
    onOfflineWrite: async (data) => {
      const id = crypto.randomUUID();
      const message = {
        id,
        project_id: projectId,
        ...data,
        sent_at: new Date().toISOString(),
        sync_status: SYNC_STATUS.PENDING_SYNC,
      };
      await db.chatMessages.add(message);
      return {
        entityId: id,
        operation: 'CREATE',
        payload: { project_id: projectId, data },
        ...message,
      };
    },
  });

  const markRead = useMutation({
    mutationFn: (messageId) => chatService.markRead(messageId),
    onSuccess: () => {
      keys.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
  });

  return { sendMessage, markRead };
}
