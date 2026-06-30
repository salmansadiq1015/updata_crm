'use client';

import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, MessageSquare } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';
import { ChatMessage } from './chat-message';

const FIVE_MIN = 5 * 60 * 1000;

function getDayKey(ts) {
  if (!ts) return 'unknown';
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function getDayLabel(ts, language) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (getDayKey(d) === getDayKey(now)) return language === 'de' ? 'Heute' : 'Today';
  if (getDayKey(d) === getDayKey(yesterday)) return language === 'de' ? 'Gestern' : 'Yesterday';
  return formatDate(d);
}

export function ChatMessages({ messages = [], isLoading, currentUserId, isGroupRoom, onReply, onReact, onDelete, onEdit }) {
  const { language, t } = useLanguage();
  const bottomRef = useRef(null);
  const prevLenRef = useRef(0);
  const [showFab, setShowFab] = useState(false);

  const items = useMemo(() => {
    if (!messages.length) return [];
    const result = [];
    let lastDayKey = null;
    let lastSenderId = null;
    let lastTs = null;

    messages.forEach((msg, idx) => {
      const ts = msg.sentAt || msg.created_at || msg.createdAt;
      const senderId = msg.senderId || msg.sender_id;
      const dayKey = getDayKey(ts);

      if (dayKey !== lastDayKey) {
        result.push({ type: 'sep', key: `sep-${dayKey}-${idx}`, label: getDayLabel(ts, language) });
        lastDayKey = dayKey;
        lastSenderId = null;
        lastTs = null;
      }

      const sameGroup = senderId === lastSenderId && lastTs && ts && Math.abs(new Date(ts) - new Date(lastTs)) < FIVE_MIN;

      const nextMsg = messages[idx + 1];
      const nextSenderId = nextMsg?.senderId || nextMsg?.sender_id;
      const nextTs = nextMsg?.sentAt || nextMsg?.created_at || nextMsg?.createdAt;
      const isLast = idx === messages.length - 1 ||
        nextSenderId !== senderId ||
        (nextTs && ts && Math.abs(new Date(nextTs) - new Date(ts)) >= FIVE_MIN);

      result.push({
        type: 'msg',
        key: msg._id || `msg-${idx}`,
        message: msg,
        isMine: String(senderId) === String(currentUserId),
        showSenderName: !sameGroup,
        showTimestamp: isLast,
      });

      lastSenderId = senderId;
      lastTs = ts;
    });
    return result;
  }, [messages, language, currentUserId]);

  useEffect(() => {
    const newLen = messages.length;
    if (newLen > prevLenRef.current && !showFab) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLenRef.current = newLen;
  }, [messages.length, showFab]);

  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [isLoading, messages.length]);

  const handleScroll = useCallback(e => {
    const el = e.currentTarget;
    setShowFab(el.scrollHeight - el.scrollTop - el.clientHeight > 150);
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto bg-muted/10 px-4 py-4 space-y-3">
        {[0,1,2].map(i => (
          <div key={i} className={`flex gap-2 ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}>
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <Skeleton className={`h-14 rounded-2xl ${i % 2 === 0 ? 'w-48 rounded-tl-sm' : 'w-40 rounded-tr-sm'}`} />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-muted/10 px-6">
        <div className="max-w-sm text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/10 text-primary">
            <MessageSquare className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold">{t('chat.noMessagesYet', 'No messages yet')}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t('chat.noMessagesDesc', 'Start the conversation with a message, file, image, or voice note.')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-hidden bg-muted/10">
      <div
        className="h-full overflow-y-auto py-2 scrollbar-thin scrollbar-thumb-border"
        onScroll={handleScroll}
      >
        {items.map(item =>
          item.type === 'sep' ? (
            <div key={item.key} className="flex items-center justify-center py-2">
              <span className="bg-muted/70 text-muted-foreground text-[11px] font-medium px-3 py-0.5 rounded-full">
                {item.label}
              </span>
            </div>
          ) : (
            <ChatMessage
              key={item.key}
              message={item.message}
              isMine={item.isMine}
              showSenderName={item.showSenderName}
              showTimestamp={item.showTimestamp}
              currentUserId={currentUserId}
              isGroupRoom={isGroupRoom}
              onReply={onReply}
              onReact={onReact}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          )
        )}
        <div ref={bottomRef} className="h-1" />
      </div>

      {showFab && (
        <div className="absolute bottom-3 right-4">
          <Button
            size="icon"
            className="h-9 w-9 rounded-full shadow-lg bg-primary hover:bg-primary/90"
            onClick={() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); setShowFab(false); }}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
