'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { chatService } from '../services/chat-service';
import { db } from '../db/mobile-db';
import { useOfflineQuery } from './use-offline-query';
import { useOfflineMutation } from './use-offline-mutation';
import { MESSAGE_TYPE, SYNC_STATUS, SYNC_ENTITY_TYPE } from '../constants/mobile-constants';
import { getExistingSocket } from '../lib/websocket-client';
import { generateId } from '@/lib/utils/ids';

function isFileLike(value) {
  return typeof File !== 'undefined' && value instanceof File;
}

function normalizeMessage(raw) {
  if (!raw) return raw;
  return {
    ...raw,
    id: raw.id || raw._id,
    project_id: raw.project_id || raw.projectId,
    order_id: raw.order_id || raw.orderId,
    sender_id: raw.sender_id || raw.senderId,
    sender_name: raw.sender_name || raw.senderName,
    message_type: raw.message_type || raw.messageType || MESSAGE_TYPE.TEXT,
    attachment_url: raw.attachment_url || raw.attachmentUrl,
    attachment_file_id: raw.attachment_file_id || raw.attachmentFileId,
    sent_at: raw.sent_at || raw.sentAt || raw.createdAt,
  };
}

async function buildOutgoingPayload(projectId, data) {
  const messageType = data.messageType || data.message_type || (data.attachment ? MESSAGE_TYPE.DOCUMENT : MESSAGE_TYPE.TEXT);
  const payload = {
    content: data.content || '',
    messageType,
    mentions: Array.isArray(data.mentions) ? data.mentions : [],
    orderId: data.orderId || data.order_id || null,
  };

  if (data.attachmentUrl || data.attachment_url) {
    payload.attachmentUrl = data.attachmentUrl || data.attachment_url;
  }
  if (data.attachmentFileId || data.attachment_file_id) {
    payload.attachmentFileId = data.attachmentFileId || data.attachment_file_id;
  }

  if (isFileLike(data.attachment)) {
    const uploaded = await chatService.uploadAttachment(projectId, data.attachment, messageType);
    payload.attachmentUrl = uploaded.attachmentUrl;
    payload.attachmentFileId = uploaded.attachmentFileId;
    if (!payload.content) payload.content = data.attachment.name;
  }

  return payload;
}

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
        await db.chatMessages.put({ ...normalizeMessage(msg), last_synced_at: new Date().toISOString() });
      }
    },
    enabled: !!projectId,
    staleTime: 0,
    select: (res) => {
      const messages = Array.isArray(res) ? res : res?.data || [];
      return messages.map(normalizeMessage);
    },
  });

  useEffect(() => {
    if (!projectId) return;

    const socket = getExistingSocket();
    if (!socket) return;

    socket.emit('join chat', { projectId });

    const onNewMessage = (message) => {
      const normalized = normalizeMessage(message?.message || message);
      queryClient.setQueryData(
        queryKeys.mobile.chat.byProject(projectId),
        (old) => {
          const existing = Array.isArray(old) ? old : [];
          const alreadyExists = existing.some((m) => (m.id || m._id) === normalized.id);
          return alreadyExists ? existing : [...existing, normalized];
        }
      );
      db.chatMessages.put({ ...normalized, last_synced_at: new Date().toISOString() });
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
    socket.on('chat:new_message', onNewMessage);
    socket.on('typing', onTyping);
    socket.on('stop typing', onStopTyping);

    return () => {
      socket.off('NewMessageAdded', onNewMessage);
      socket.off('chat:new_message', onNewMessage);
      socket.off('typing', onTyping);
      socket.off('stop typing', onStopTyping);
    };
  }, [projectId, queryClient]);

  return { ...query, typingUsers };
}

export function useChatMembers(projectId) {
  return useQuery({
    queryKey: ['mobile', 'chat', 'members', projectId],
    queryFn: () => chatService.getMembers(projectId),
    enabled: !!projectId,
    staleTime: 60_000,
  });
}

export function useChatMutations(projectId) {
  const queryClient = useQueryClient();
  const keys = [queryKeys.mobile.chat.byProject(projectId)];

  const sendMessage = useOfflineMutation({
    mutationFn: async (data) => chatService.sendMessage(projectId, await buildOutgoingPayload(projectId, data)),
    entityType: SYNC_ENTITY_TYPE.CHAT_MESSAGE,
    invalidateKeys: keys,
    onOfflineWrite: async (data) => {
      const id = generateId();
      const messageType = data.messageType || data.message_type || (data.attachment ? MESSAGE_TYPE.DOCUMENT : MESSAGE_TYPE.TEXT);
      const queuedPayload = {
        content: data.content || (data.attachment?.name ?? ''),
        messageType,
        mentions: Array.isArray(data.mentions) ? data.mentions : [],
        orderId: data.orderId || data.order_id || null,
      };
      const message = {
        id,
        project_id: projectId,
        ...queuedPayload,
        message_type: messageType,
        is_own: true,
        attachment_local_path: isFileLike(data.attachment) ? URL.createObjectURL(data.attachment) : null,
        local_file_blob: isFileLike(data.attachment) ? data.attachment : null,
        local_file_name: data.attachment?.name || null,
        sent_at: new Date().toISOString(),
        sync_status: SYNC_STATUS.PENDING_SYNC,
      };
      await db.chatMessages.add(message);
      return {
        entityId: id,
        operation: 'CREATE',
        payload: { project_id: projectId, data: queuedPayload },
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
