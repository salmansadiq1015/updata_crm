'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Send, Paperclip, Image, ArrowDown, X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { EmptyState } from '@/modules/mobile/components/empty-state';
import { useChatMessages, useChatMutations } from '@/modules/mobile/hooks/use-chat';
import { MESSAGE_TYPE, SYNC_STATUS } from '@/modules/mobile/constants/mobile-constants';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function ChatPage() {
  const { projectId } = useParams();
  const { t, locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';

  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState(null);
  const messagesEndRef = useRef(null);
  const listRef = useRef(null);
  const fileInputRef = useRef(null);

  const { data: messages, isLoading, isOffline } = useChatMessages(projectId);
  const { sendMessage } = useChatMutations(projectId);

  const allMessages = Array.isArray(messages) ? messages : [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages.length]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttachment(file);
  };

  const handleSend = async () => {
    const text = message.trim();
    if (!text && !attachment) return;
    setMessage('');
    const payload = {
      content: text || (attachment ? attachment.name : ''),
      messageType: attachment ? MESSAGE_TYPE.FILE : MESSAGE_TYPE.TEXT,
      message_type: attachment ? MESSAGE_TYPE.FILE : MESSAGE_TYPE.TEXT,
      is_own: true,
    };
    if (attachment) {
      payload.attachment = attachment;
    }
    setAttachment(null);
    try {
      await sendMessage.mutateAsync(payload);
    } catch {
      toast.error(lang === 'de' ? 'Nachricht konnte nicht gesendet werden' : 'Could not send message');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full min-h-full">
      <MobileHeader
        title={t('mobile.chat.title', 'Projekt-Chat')}
        showBack
        right={
          isOffline && (
            <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded-lg">
              Offline
            </span>
          )
        }
      />

      {/* Messages area */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {isLoading ? (
          <ChatSkeleton />
        ) : allMessages.length === 0 ? (
          <EmptyState
            variant="empty"
            title={lang === 'de' ? 'Noch keine Nachrichten' : 'No messages yet'}
            description={
              lang === 'de'
                ? 'Beginnen Sie eine Unterhaltung mit Ihrem Team.'
                : 'Start a conversation with your team.'
            }
          />
        ) : (
          allMessages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} lang={lang} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose bar */}
      <div className="border-t border-border bg-background">
        {attachment && (
          <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border">
            <Image className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs truncate flex-1">{attachment.name}</span>
            <button onClick={() => setAttachment(null)} className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-muted" aria-label="Remove attachment">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <div className="px-4 py-3 pb-safe">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={lang === 'de' ? 'Nachricht schreiben...' : 'Type a message...'}
                rows={1}
                className={cn(
                  'w-full resize-none rounded-xl border border-border bg-muted/40 px-4 py-2.5 text-sm',
                  'focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20',
                  'max-h-32 min-h-[42px]'
                )}
                style={{ height: 'auto', overflowY: message.split('\n').length > 3 ? 'auto' : 'hidden' }}
              />
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-[42px] w-[42px] flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              aria-label="Attach file"
            >
              <Paperclip className="h-5 w-5" />
            </button>
            <Button
              size="sm"
              className="h-[42px] w-[42px] p-0 rounded-xl shrink-0"
              onClick={handleSend}
              disabled={(!message.trim() && !attachment) || sendMessage.isPending}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    </div>
  );
}

function ChatBubble({ message, lang }) {
  const isOwn = message.is_own || message.isOwn;
  const isPending = message.sync_status === SYNC_STATUS.PENDING_SYNC;
  const sentAt = message.sent_at || message.created_at;

  return (
    <div className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-2.5',
          isOwn
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted rounded-bl-md'
        )}
      >
        {!isOwn && message.sender_name && (
          <p className="text-xs font-semibold mb-0.5 opacity-70">
            {message.sender_name}
          </p>
        )}
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        <div className={cn(
          'flex items-center gap-1 mt-1',
          isOwn ? 'justify-end' : 'justify-start'
        )}>
          {sentAt && (
            <span className={cn('text-[10px]', isOwn ? 'text-primary-foreground/60' : 'text-muted-foreground')}>
              {new Date(sentAt).toLocaleTimeString(lang === 'de' ? 'de-CH' : 'en-GB', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
          {isPending && (
            <span className={cn('text-[10px]', isOwn ? 'text-primary-foreground/50' : 'text-muted-foreground/50')}>
              ●
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex justify-start"><div className="h-16 w-48 bg-muted rounded-2xl animate-pulse" /></div>
      <div className="flex justify-end"><div className="h-12 w-40 bg-primary/20 rounded-2xl animate-pulse" /></div>
      <div className="flex justify-start"><div className="h-20 w-56 bg-muted rounded-2xl animate-pulse" /></div>
      <div className="flex justify-end"><div className="h-12 w-44 bg-primary/20 rounded-2xl animate-pulse" /></div>
    </div>
  );
}
