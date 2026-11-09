'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useMutation } from '@tanstack/react-query';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { chatService } from '../services/chat-service';
import { LeadChatDialog } from './lead-chat-dialog';
import { ChatLeadMessages } from './chat-lead-messages';
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
  const { t, locale, isRTL } = useLanguage();
  const { hasPermission } = usePermissions();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [leadsOpen, setLeadsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [mode, setMode] = useState('team');
  const [sendError, setSendError] = useState(false);
  const summary = useMutation({ mutationFn: () => chatService.summarizeRoom(roomId, locale?.split('-')[0] || 'en') });
  const [replyTarget, setReplyTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const inputRef = useRef(null);

  const user = useAuthStore((s) => s.user);
  const currentUserId = user?._id;

  const { data: messages, isLoading, typingUsers, isError, refetch, fetchOlder, hasOlder, isFetchingOlder, olderError } = useChatMessages(roomId);
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
  const { data: room, isError: roomError, refetch: refetchRoom } = useChatRoom(roomId);
  const { data: rooms = [] } = useChatRooms({ enabled: searchOpen });

  const isBlocked = room?.blockedBy?.includes(String(currentUserId));

  // Mark read on mount and whenever message count changes
  useEffect(() => {
    if (room && !roomError && document.visibilityState === 'visible') markRead.mutate(roomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, room?._id, roomError, messages?.length]);

  async function handleSend({ content, messageType, attachmentUrl, attachmentFileId, replyToId, mentions, clientMessageId }) {
    setSendError(false);
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
          clientMessageId,
        });
        setReplyTarget(null);
      }
      return true;
    } catch (error) {
      setSendError(true);
      showError(error);
      return false;
    }
  }

  const canWrite = hasPermission('chat:write') && !!room && !roomError;
  const canManage = canWrite && (String(room?.createdBy?._id || room?.createdBy) === String(currentUserId) || room?.admins?.some(admin => String(admin?._id || admin) === String(currentUserId)));
  const canDrop = canWrite && !isBlocked && mode === 'team';

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

  if (roomError) return <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"><p role="alert">{t('chat.workspace.loadFailed', 'Unable to load this conversation.')}</p><Button onClick={() => refetchRoom()}>{t('common.retry', 'Retry')}</Button></div>;
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
          canWrite={canWrite}
          currentUserId={currentUserId}
          isBlocked={isBlocked}
          onBlock={() => blockUser.mutate(roomId)}
          onUnblock={() => unblockUser.mutate(roomId)}
          onLeave={(id) => leaveRoom.mutate(id)}
          onDelete={(id) => deleteRoom.mutate(id)}
          onRefreshCode={(id) => refreshJoinCode.mutate(id)}
          onDetails={() => setDetailsOpen(true)}
          onSummary={hasPermission('ai:sessions') ? () => { setSummaryOpen(true); summary.mutate(); } : undefined}
          onSearch={() => setSearchOpen(true)}
        />
        {!!room?.leadIds?.length && <div className="flex gap-1 border-b border-border/60 px-4 py-2" role="tablist" aria-label={t('chat.workspace.workspace', 'Communication workspace')}>{[['team', 'Team chat'], ['external', 'Lead messages']].map(([value, fallback]) => <Button key={value} role="tab" aria-selected={mode === value} variant={mode === value ? 'secondary' : 'ghost'} size="sm" onClick={() => setMode(value)}>{t(`chat.workspace.${value === 'team' ? 'teamChat' : 'leadMessages'}`, fallback)}</Button>)}</div>}
        {mode === 'external' && room?.leadIds?.length ? <ChatLeadMessages key={room.leadIds.map(lead => lead._id).join(',')} room={room} /> : <>
        {isError && <div role="alert" className="p-3 text-center text-sm text-destructive">{t('chat.workspace.loadFailed', 'Could not load messages.')} <Button variant="ghost" size="sm" onClick={() => refetch()}>{t('common.retry', 'Retry')}</Button></div>}
        <ChatMessages
          messages={messages}
          isLoading={isLoading}
          currentUserId={currentUserId}
          hasOlder={hasOlder}
          onLoadOlder={fetchOlder}
          isFetchingOlder={isFetchingOlder}
          olderError={olderError}
          isGroupRoom={room?.roomType !== 'DM'}
          onReply={canWrite ? setReplyTarget : undefined}
          onReact={canWrite ? (messageId, emoji) => addReaction.mutate({ msgId: messageId, emoji }) : undefined}
          onDelete={canWrite ? (messageId) => deleteMessage.mutate(messageId) : undefined}
          onEdit={canWrite ? setEditTarget : undefined}
        />
        <ChatTypingIndicator typingUsers={typingUsers} />
        {sendError && <p role="alert" className="px-4 py-2 text-sm text-destructive">{t('chat.workspace.sendFailed', 'Message could not be sent. Your draft is saved; try again.')}</p>}
        <ChatInput key={`${roomId}:${currentUserId}`}
          ref={inputRef}
          onSend={handleSend}
          isLoading={sendMessage.isPending || editMessage.isPending}
          roomId={roomId}
          room={room}
          canWrite={canWrite}
          currentUserId={currentUserId}
          replyTarget={replyTarget}
          onClearReply={() => setReplyTarget(null)}
          isBlocked={isBlocked || !canWrite}
          editTarget={editTarget}
          onClearEdit={() => setEditTarget(null)}
        />
        </>}

        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-30 m-2 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-primary/60 bg-primary/10 backdrop-blur-sm">
            <Upload className="h-9 w-9 text-primary" />
            <p className="text-sm font-medium text-primary">
              {t('chat.dropToUpload', 'Datei hier ablegen zum Senden')}
            </p>
          </div>
        )}
      </div>
      <Sheet open={detailsOpen} onOpenChange={setDetailsOpen}><SheetContent side={isRTL ? "left" : "right"} className="w-full overflow-y-auto p-5 sm:max-w-md"><SheetHeader><SheetTitle>{t('chat.workspace.details', 'Conversation details')}</SheetTitle></SheetHeader><ChatContextPanel room={room} currentUserId={currentUserId} onManageLeads={canManage && hasPermission('lead:read') ? () => { setDetailsOpen(false); setLeadsOpen(true); } : undefined} /></SheetContent></Sheet>
      {leadsOpen && <LeadChatDialog key={`${roomId}:${room?.__v}`} open onOpenChange={setLeadsOpen} room={room} />}
      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}><DialogContent><DialogHeader><DialogTitle>{t('chat.askAiSummary', 'Conversation summary')}</DialogTitle><DialogDescription>{t('chat.workspace.summaryDescription', 'AI-generated from the latest 50 messages. Review before using.')}</DialogDescription></DialogHeader>{summary.isPending ? <p role="status">{t('common.loading', 'Loading…')}</p> : summary.isError ? <div role="alert"><p>{t('chat.workspace.loadFailed', 'Unable to generate summary.')}</p><Button onClick={() => summary.mutate()}>{t('common.retry', 'Retry')}</Button></div> : <p className="max-h-[60dvh] overflow-y-auto whitespace-pre-wrap text-sm leading-7">{summary.data?.summary}</p>}</DialogContent></Dialog>
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
