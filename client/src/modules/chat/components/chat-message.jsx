'use client';

import { useState } from 'react';
import NextImage from 'next/image';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Reply, Smile, Trash2, Pencil, MoreHorizontal, Check, CheckCheck, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { ChatReactionBar } from './chat-reaction-bar';
import { ChatEmojiPicker } from './chat-emoji-picker';

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const SENDER_COLORS = ['#ef5350','#ab47bc','#42a5f5','#26a69a','#66bb6a','#ffa726','#ec407a'];
function senderColor(name) {
  if (!name) return SENDER_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return SENDER_COLORS[h % SENDER_COLORS.length];
}

export function ChatMessage({ message, isMine, showSenderName, showTimestamp, currentUserId, isGroupRoom, onReply, onReact, onDelete, onEdit }) {
  const { t } = useLanguage();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const senderName = message.senderName || message.sender_name || '?';
  const ts = message.sentAt || message.created_at || message.createdAt;
  const isDeleted = message.isDeleted || message.is_deleted;
  const hasReply = message.replyToId && message.replyToSnippet;
  const isRead = message.readBy?.some(r => String(r.userId?._id || r.userId || r) !== String(currentUserId));

  const renderContent = () => {
    if (isDeleted) {
      return <span className="italic opacity-50 text-sm">{t('chat.deletedMessage', 'This message was deleted')}</span>;
    }
    switch (message.messageType) {
      case 'PHOTO':
        return (
          <>
            <NextImage
              src={message.attachmentUrl}
              alt="Photo"
              width={240} height={180}
              className="rounded-lg cursor-pointer object-cover"
              onClick={() => setLightboxOpen(true)}
              unoptimized
            />
            <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
              <DialogContent className="max-w-3xl p-1 bg-black/95">
                <NextImage src={message.attachmentUrl} alt="Photo" width={900} height={600} className="w-full rounded object-contain" unoptimized />
              </DialogContent>
            </Dialog>
          </>
        );
      case 'AUDIO':
        return (
          <div className="flex flex-col gap-1">
            <audio controls src={message.attachmentUrl} className="h-10 max-w-[220px]" />
          </div>
        );
      case 'VIDEO':
        return <video controls src={message.attachmentUrl} className="max-w-[240px] rounded-lg" />;
      case 'DOCUMENT':
        return (
          <a
            href={message.attachmentUrl}
            download
            className="flex items-center gap-2 p-2 rounded-lg bg-black/20 hover:bg-black/30 transition-colors text-sm"
          >
            <FileText className="h-5 w-5 shrink-0" />
            <span className="truncate max-w-[160px]">{message.attachmentFileName || t('common.document', 'Document')}</span>
          </a>
        );
      default:
        return <span className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</span>;
    }
  };

  return (
    <div
      className={cn('group flex gap-2 px-4 py-0.5', isMine ? 'flex-row-reverse' : 'flex-row')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { if (!menuOpen) setHovered(false); }}
    >
      {/* Other's avatar (only for first message in group) */}
      {!isMine && (
        <div className="w-8 shrink-0 flex items-end">
          {showSenderName && (
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-[10px] font-semibold text-white" style={{ backgroundColor: senderColor(senderName) }}>
                {senderName.split(' ').slice(0,2).map(w=>w[0]?.toUpperCase()??'').join('')}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      )}

      <div className={cn('flex flex-col max-w-[70%]', isMine ? 'items-end' : 'items-start')}>
        {/* Sender name for groups */}
        {!isMine && isGroupRoom && showSenderName && (
          <span className="text-[11px] font-semibold mb-0.5 px-1" style={{ color: senderColor(senderName) }}>
            {senderName}
          </span>
        )}

        {/* Bubble */}
        <div
          className={cn(
            'relative px-3 py-1.5 rounded-2xl shadow-sm',
            isMine
              ? 'bg-[#005c4b] text-white rounded-tr-sm'
              : 'bg-card dark:bg-[#202c33] text-foreground rounded-tl-sm border border-border/20'
          )}
        >
          {/* Reply quote */}
          {hasReply && (
            <div className={cn('border-l-[3px] pl-2 mb-1.5 py-0.5 rounded-r text-xs opacity-80', isMine ? 'border-white/50 bg-white/10' : 'border-primary bg-muted/40')}>
              <p className="font-semibold text-[10px]">{message.replyToSenderName || t('chat.reply', 'Reply')}</p>
              <p className="truncate">{message.replyToSnippet}</p>
            </div>
          )}

          {renderContent()}

          {/* Time + read tick */}
          {showTimestamp && (
            <div className="flex items-center gap-1 mt-0.5 justify-end">
              {message.editedAt && <span className="text-[10px] opacity-60">{t('chat.edited', 'edited')}</span>}
              <span className="text-[10px] opacity-70">{formatTime(ts)}</span>
              {isMine && (
                isRead
                  ? <CheckCheck className="h-3 w-3 text-blue-400" />
                  : <Check className="h-3 w-3 opacity-60" />
              )}
            </div>
          )}
        </div>

        {/* Reactions */}
        {message.reactions?.length > 0 && (
          <div className="mt-0.5">
            <ChatReactionBar
              reactions={message.reactions}
              currentUserId={currentUserId}
              onToggle={emoji => onReact?.(message._id, emoji)}
            />
          </div>
        )}
      </div>

      {/* Context menu (hover) — keep mounted while menu is open so the portal stays alive */}
      {(hovered || menuOpen) && !isDeleted && (
        <div className={cn('flex items-center self-center gap-0.5', isMine ? 'mr-1' : 'ml-1')}>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full bg-background/80 shadow-sm" onClick={() => onReply?.(message)}>
            <Reply className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu open={menuOpen} onOpenChange={(open) => { setMenuOpen(open); if (!open) setHovered(false); }}>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full bg-background/80 shadow-sm">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isMine ? 'end' : 'start'} className="w-36">
              <DropdownMenuItem onClick={() => { setMenuOpen(false); setPickerOpen(true); }}>
                <Smile className="h-3.5 w-3.5 mr-2" /> {t('chat.react', 'React')}
              </DropdownMenuItem>
              {isMine && message.messageType === 'TEXT' && (
                <DropdownMenuItem onClick={() => { setMenuOpen(false); onEdit?.(message); }}>
                  <Pencil className="h-3.5 w-3.5 mr-2" /> {t('common.edit', 'Edit')}
                </DropdownMenuItem>
              )}
              {isMine && (
                <DropdownMenuItem onClick={() => { setMenuOpen(false); onDelete?.(message._id); }} className="text-destructive focus:text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> {t('common.delete', 'Delete')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {pickerOpen && (
        <ChatEmojiPicker
          onSelect={emoji => { onReact?.(message._id, emoji); setPickerOpen(false); }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
