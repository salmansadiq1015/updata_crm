'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, MessageSquare, FileText, Image as ImageIcon, Music, Video, ArrowUpRight } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { CHAT_MESSAGE_TYPES } from '../constants/chat-config';
import { useChatSearch } from '../hooks/use-chat-search';
import { getRoomDisplayName, getRoomKindLabel } from '../utils/chat-room-utils';

const TYPE_ICONS = {
  TEXT: MessageSquare,
  PHOTO: ImageIcon,
  DOCUMENT: FileText,
  AUDIO: Music,
  VIDEO: Video,
};

function formatResultDate(value, locale) {
  if (!value) return '';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getMessageTypeLabel(messageType, t) {
  const type = CHAT_MESSAGE_TYPES.find((item) => item.value === messageType);
  return type ? t(type.labelKey, type.fallback) : t('chat.message', 'Message');
}

function getResultSnippet(message, t) {
  if (message.content) return message.content;
  if (message.attachmentFileId?.originalName) return message.attachmentFileId.originalName;
  return getMessageTypeLabel(message.messageType, t);
}

export function ChatSearchDialog({ open, onOpenChange, activeRoomId, rooms = [], currentUserId }) {
  const { locale, t } = useLanguage();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('ALL');
  const [messageType, setMessageType] = useState('ALL');

  const scopedRoomId = scope === 'CURRENT' ? activeRoomId : null;
  const { data: results = [], isFetching, isError, error } = useChatSearch({
    query,
    roomId: scopedRoomId,
    messageType,
    enabled: open,
  });

  const roomById = useMemo(() => {
    const map = new Map();
    rooms.forEach((room) => map.set(String(room._id), room));
    return map;
  }, [rooms]);

  const canSearchCurrent = Boolean(activeRoomId);
  const showPrompt = query.trim().length < 2;

  function openResult(message) {
    const roomId = String(message.roomId?._id || message.roomId || '');
    if (!roomId) return;
    router.push(`/field-ops/chat?chatId=${roomId}`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border/70 px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-primary" />
            {t('chat.advancedSearch', 'Search conversations')}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('chat.advancedSearchDesc', 'Search messages and files across chat history.')}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4 p-5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('chat.searchMessagesFiles', 'Search messages, files, and history...')}
              className="h-11 rounded-2xl border-border/70 bg-muted/40 pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={scope === 'ALL' ? 'default' : 'secondary'}
              size="sm"
              className="h-8 rounded-full"
              onClick={() => setScope('ALL')}
            >
              {t('chat.scopeAll', 'All chats')}
            </Button>
            <Button
              type="button"
              variant={scope === 'CURRENT' ? 'default' : 'secondary'}
              size="sm"
              className="h-8 rounded-full"
              onClick={() => canSearchCurrent && setScope('CURRENT')}
              disabled={!canSearchCurrent}
            >
              {t('chat.scopeCurrent', 'Current chat')}
            </Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button
              type="button"
              variant={messageType === 'ALL' ? 'default' : 'secondary'}
              size="sm"
              className="h-8 rounded-full"
              onClick={() => setMessageType('ALL')}
            >
              {t('common.all', 'All')}
            </Button>
            {CHAT_MESSAGE_TYPES.map((type) => (
              <Button
                key={type.value}
                type="button"
                variant={messageType === type.value ? 'default' : 'secondary'}
                size="sm"
                className="h-8 rounded-full"
                onClick={() => setMessageType(type.value)}
              >
                {t(type.labelKey, type.fallback)}
              </Button>
            ))}
          </div>

          <div className="min-h-72 overflow-hidden rounded-2xl border border-border/70 bg-muted/20">
            {showPrompt ? (
              <div className="flex h-72 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <Search className="h-8 w-8 opacity-60" />
                <p className="text-sm">{t('chat.searchMinChars', 'Enter at least 2 characters.')}</p>
              </div>
            ) : isFetching ? (
              <div className="flex h-72 flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm">{t('common.searching', 'Searching...')}</p>
              </div>
            ) : isError ? (
              <div className="flex h-72 flex-col items-center justify-center gap-3 px-6 text-center text-destructive">
                <p className="text-sm font-medium">{error?.message || t('chat.searchFailed', 'Search failed.')}</p>
              </div>
            ) : results.length === 0 ? (
              <div className="flex h-72 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <MessageSquare className="h-8 w-8 opacity-60" />
                <p className="text-sm">{t('chat.noSearchResults', 'No matching messages found.')}</p>
              </div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto p-2">
                {results.map((message) => {
                  const room = roomById.get(String(message.roomId?._id || message.roomId));
                  const Icon = TYPE_ICONS[message.messageType] || MessageSquare;
                  const sender = message.senderId?.firstName
                    ? `${message.senderId.firstName} ${message.senderId.lastName ?? ''}`.trim()
                    : message.senderName;

                  return (
                    <button
                      key={message._id}
                      type="button"
                      onClick={() => openResult(message)}
                      className={cn(
                        'group flex w-full items-start gap-3 rounded-2xl px-3 py-3 text-left transition-colors',
                        'hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                      )}
                    >
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold">
                            {room ? getRoomDisplayName(room, currentUserId, t) : t('chat.conversation', 'Conversation')}
                          </span>
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            {room ? getRoomKindLabel(room, t) : getMessageTypeLabel(message.messageType, t)}
                          </Badge>
                        </span>
                        <span className="mt-1 block line-clamp-2 text-sm text-muted-foreground">
                          {getResultSnippet(message, t)}
                        </span>
                        <span className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                          {sender && <span className="truncate">{sender}</span>}
                          <span>{formatResultDate(message.sentAt || message.createdAt, locale)}</span>
                        </span>
                      </span>
                      <ArrowUpRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
