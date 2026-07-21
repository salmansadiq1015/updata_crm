'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Upload } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { useChatMessages } from '@/modules/chat/hooks/use-chat-messages';
import { useChatMutations } from '@/modules/chat/hooks/use-chat-mutations';
import { useChatRoom, useChatRooms } from '@/modules/chat/hooks/use-chat-rooms';
import { ChatHeader } from './chat-header';
import { ChatContextPanel } from './chat-context-panel';
import { ChatSearchDialog } from './chat-search-dialog';
import { ChatMessages } from './chat-messages';
import { ChatTypingIndicator } from './chat-typing-indicator';
import { ChatInput } from './chat-input';

const dragHasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');

export function ChatPanel({ roomId }) {
  const { t } = useLanguage();
  const [replyTarget, setReplyTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const inputRef = useRef(null);

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

  const canDrop = !!roomId && !isBlocked;

  const handleDragEnter = useCallback((e) => {
    if (!canDrop || !dragHasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }, [canDrop]);

  const handleDragOver = useCallback((e) => {
    if (canDrop && dragHasFiles(e)) e.preventDefault();
  }, [canDrop]);

  const handleDragLeave = useCallback((e) => {
    if (!canDrop || !dragHasFiles(e)) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setIsDragging(false);
    }
  }, [canDrop]);

  const handleDrop = useCallback((e) => {
    if (!canDrop || !dragHasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) inputRef.current?.addFile(file);
  }, [canDrop]);

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div
        className="relative flex min-w-0 flex-1 flex-col"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
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
          ref={inputRef}
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

        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-30 m-2 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/60 bg-primary/10 backdrop-blur-sm">
            <Upload className="h-9 w-9 text-primary" />
            <p className="text-sm font-medium text-primary">
              {t('chat.dropToUpload', 'Datei hier ablegen zum Senden')}
            </p>
          </div>
        )}
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
