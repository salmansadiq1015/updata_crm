'use client';
import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { showError } from '@/lib/toast';
import { useChatMessages } from '@/modules/chat/hooks/use-chat-messages';
import { useChatMutations } from '@/modules/chat/hooks/use-chat-mutations';
import { useChatRoom, useChatRooms } from '@/modules/chat/hooks/use-chat-rooms';
import { ChatHeader } from './chat-header';
import { ChatContextPanel } from './chat-context-panel';
import { ChatSearchDialog } from './chat-search-dialog';
import { ChatMessages } from './chat-messages';
import { ChatTypingIndicator } from './chat-typing-indicator';
import { ChatInput } from './chat-input';

export function ChatPanel({ roomId }) {
  const [replyTarget, setReplyTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const user = useAuthStore((s) => s.user);
  const currentUserId = user?._id;

  const { data: messages, isLoading, typingUsers } = useChatMessages(roomId);
  const {
    sendMessage,
    deleteMessage,
    editMessage,
    addReaction,
    markRead,
    blockUser,
    unblockUser,
    leaveRoom,
    deleteRoom,
    refreshJoinCode,
  } = useChatMutations(roomId);
  const { data: room } = useChatRoom(roomId);
  const { data: rooms = [] } = useChatRooms();

  const isBlocked = room?.blockedBy?.includes(String(currentUserId));

  // Mark read on mount and whenever message count changes
  useEffect(() => {
    if (roomId) markRead.mutate(roomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, messages?.length]);

  async function handleSend({ content, messageType, attachmentUrl, attachmentFileId, replyToId, mentions }) {
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
          mentions,
        });
        setReplyTarget(null);
      }
    } catch (error) {
      showError(error);
    }
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <ChatHeader
          room={room}
          currentUserId={currentUserId}
          isBlocked={isBlocked}
          onBlock={() => blockUser.mutate(roomId)}
          onUnblock={() => unblockUser.mutate(roomId)}
          onLeave={(id) => leaveRoom.mutate(id)}
          onDelete={(id) => deleteRoom.mutate(id)}
          onRefreshCode={(id) => refreshJoinCode.mutate(id)}
          onSearch={() => setSearchOpen(true)}
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
          isLoading={sendMessage.isPending || editMessage.isPending}
          roomId={roomId}
          room={room}
          currentUserId={currentUserId}
          replyTarget={replyTarget}
          onClearReply={() => setReplyTarget(null)}
          isBlocked={isBlocked}
          editTarget={editTarget}
          onClearEdit={() => setEditTarget(null)}
        />
      </div>
      <ChatContextPanel room={room} currentUserId={currentUserId} />
      <ChatSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        activeRoomId={roomId}
        rooms={rooms}
        currentUserId={currentUserId}
      />
    </div>
  );
}
