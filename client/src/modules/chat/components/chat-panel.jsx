'use client';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useChatMessages } from '@/modules/chat/hooks/use-chat-messages';
import { useChatMutations } from '@/modules/chat/hooks/use-chat-mutations';
import { useChatRoom } from '@/modules/chat/hooks/use-chat-rooms';
import { useChatTyping } from '@/modules/chat/hooks/use-chat-typing';
import { ChatHeader } from './chat-header';
import { ChatMessages } from './chat-messages';
import { ChatTypingIndicator } from './chat-typing-indicator';
import { ChatInput } from './chat-input';

export function ChatPanel({ roomId }) {
  const [replyTarget, setReplyTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);

  const user = useAuthStore((s) => s.user);
  const currentUserId = user?._id;

  const { data: messages, isLoading, typingUsers } = useChatMessages(roomId);
  const {
    sendMessage,
    deleteMessage,
    editMessage,
    addReaction,
    removeReaction,
    markRead,
    blockUser,
    unblockUser,
    leaveRoom,
    deleteRoom,
    refreshJoinCode,
  } = useChatMutations(roomId);
  const { data: room } = useChatRoom(roomId);
  const { onKeystroke } = useChatTyping(roomId);

  const isBlocked = room?.blockedBy?.includes(String(currentUserId));

  // Mark read on mount and whenever message count changes
  useEffect(() => {
    if (roomId) markRead.mutate(roomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, messages?.length]);

  async function handleSend({ content, messageType, attachmentUrl, attachmentFileId, replyToId }) {
    try {
      if (editTarget) {
        await editMessage.mutateAsync({ msgId: editTarget._id, content });
        setEditTarget(null);
      } else {
        await sendMessage.mutateAsync({
          messageType,
          content,
          attachmentUrl,
          attachmentFileId,
          replyToId,
        });
        setReplyTarget(null);
      }
    } catch {
      // error is surfaced via sendMessage.error / editMessage.error
    }
  }

  return (
    <div className="flex flex-col h-full">
      <ChatHeader
        room={room}
        currentUserId={currentUserId}
        isBlocked={isBlocked}
        onBlock={() => blockUser.mutate(roomId)}
        onUnblock={() => unblockUser.mutate(roomId)}
        onLeave={(id) => leaveRoom.mutate(id)}
        onDelete={(id) => deleteRoom.mutate(id)}
        onRefreshCode={(id) => refreshJoinCode.mutate(id)}
      />
      <ChatMessages
        messages={messages}
        isLoading={isLoading}
        currentUserId={currentUserId}
        isGroupRoom={room?.roomType === 'GROUP'}
        onReply={setReplyTarget}
        onReact={(messageId, emoji) => addReaction.mutate({ msgId: messageId, emoji })}
        onDelete={(messageId) => deleteMessage.mutate(messageId)}
        onEdit={(message) => setEditTarget(message)}
      />
      <ChatTypingIndicator typingUsers={typingUsers} />
      <ChatInput
        onSend={handleSend}
        isLoading={sendMessage.isPending}
        roomId={roomId}
        replyTarget={replyTarget}
        onClearReply={() => setReplyTarget(null)}
        isBlocked={isBlocked}
        editTarget={editTarget}
        onClearEdit={() => setEditTarget(null)}
      />
    </div>
  );
}
