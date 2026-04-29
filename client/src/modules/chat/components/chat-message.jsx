'use client';

import { useState } from 'react';
import NextImage from 'next/image';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Reply, Smile, Trash2, Pencil, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { ChatReactionBar } from './chat-reaction-bar';
import { ChatEmojiPicker } from './chat-emoji-picker';
import { ChatReplyPreview } from './chat-reply-preview';

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChatMessage({ message, isMine, showSenderName, showTimestamp, currentUserId, onReply, onReact, onDelete, onEdit }) {
  const { t } = useLanguage();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const senderName = message.senderName || message.sender_name || '?';
  const ts = message.created_at || message.createdAt || message.sentAt;
  const isDeleted = message.isDeleted || message.is_deleted;
  const hasReplyQuote = message.replyToId && message.replyToSnippet;
  const isRead = message.readBy?.some((r) => String(r.userId || r) !== String(currentUserId));

  const initials = senderName.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

  const renderContent = () => {
    if (isDeleted) {
      return <span className="italic opacity-50 text-sm">{t('fieldOps.chat.deleted', 'This message was deleted')}</span>;
    }
    switch (message.messageType) {
      case 'PHOTO':
        return (
          <>
            <NextImage
              src={message.attachmentUrl}
              alt="Photo"
              width={240}
              height={180}
              className="rounded-lg cursor-pointer object-cover"
              onClick={() => setLightboxOpen(true)}
              unoptimized
            />
            <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
              <DialogContent className="max-w-3xl p-2 bg-black/90">
                <NextImage src={message.attachmentUrl} alt="Photo" width={900} height={600} className="w-full rounded object-contain" unoptimized />
              </DialogContent>
            </Dialog>
          </>
        );
      case 'AUDIO':
        return <audio controls src={message.attachmentUrl} className="max-w-[240px]" />;
      case 'VIDEO':
        return <video controls src={message.attachmentUrl} className="max-w-[240px] rounded-lg" />;
      case 'DOCUMENT':
        return (
          <a
            href={message.attachmentUrl}
            target="_blank"
            rel="noreferrer"
            className={cn('flex items-center gap-2 text-sm underline', isMine ? 'text-primary-foreground/90' : 'text-foreground')}
          >
            📄 {message.content || 'Document'}
          </a>
        );
      default:
        return <span className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</span>;
    }
  };

  return (
    <div className={cn('group flex items-end gap-2 px-3 py-0.5', isMine ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar / spacer for non-mine messages */}
      {!isMine ? (
        showSenderName ? (
          <Avatar className="h-7 w-7 shrink-0 mb-1">
            <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
          </Avatar>
        ) : <div className="w-7 shrink-0" />
      ) : null}

      <div className={cn('max-w-[70%] flex flex-col', isMine ? 'items-end' : 'items-start')}>
        {/* Sender name */}
        {showSenderName && !isMine && (
          <span className="text-[11px] font-semibold text-muted-foreground px-1 mb-0.5">{senderName}</span>
        )}

        {/* Reply quote */}
        {hasReplyQuote && (
          <div className={cn('mb-1 rounded-md overflow-hidden max-w-full', isMine ? 'self-end' : 'self-start')}>
            <ChatReplyPreview message={message} className="text-[11px] opacity-80 rounded-none border-l-primary/50" />
          </div>
        )}

        {/* Bubble */}
        <div
          className={cn(
            'relative rounded-2xl px-3 py-2',
            isMine
              ? 'bg-primary text-primary-foreground rounded-br-sm'
              : 'bg-muted text-foreground rounded-bl-sm'
          )}
        >
          {renderContent()}

          {/* Timestamp + read tick */}
          {showTimestamp && ts && (
            <div className={cn('flex items-center gap-1 mt-1 justify-end', isMine ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
              <span className="text-[10px]">{formatTime(ts)}</span>
              {isMine && (
                <span className="text-[10px]">{isRead ? '✓✓' : '✓'}</span>
              )}
              {message.editedAt && (
                <span className="text-[10px] italic">(edited)</span>
              )}
            </div>
          )}
        </div>

        {/* Reactions */}
        <ChatReactionBar
          reactions={message.reactions || []}
          currentUserId={currentUserId}
          onToggle={(emoji) => onReact?.(message, emoji)}
        />
      </div>

      {/* Context menu — visible on group hover */}
      {!isDeleted && (
        <div className={cn('opacity-0 group-hover:opacity-100 transition-opacity self-center', isMine ? 'mr-1' : 'ml-1')}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isMine ? 'end' : 'start'} side="top">
              <DropdownMenuItem onClick={() => onReply?.(message)}>
                <Reply className="h-3.5 w-3.5 mr-2" /> Reply
              </DropdownMenuItem>
              <ChatEmojiPicker onSelect={(emoji) => onReact?.(message, emoji)}>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <Smile className="h-3.5 w-3.5 mr-2" /> React
                </DropdownMenuItem>
              </ChatEmojiPicker>
              {isMine && message.messageType === 'TEXT' && (
                <DropdownMenuItem onClick={() => onEdit?.(message)}>
                  <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                </DropdownMenuItem>
              )}
              {isMine && (
                <DropdownMenuItem onClick={() => onDelete?.(message)} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}
