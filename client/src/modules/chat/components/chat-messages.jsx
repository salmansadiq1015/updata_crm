'use client';

import { useRef, useLayoutEffect, useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, MessageSquare } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { ChatMessage } from './chat-message';

const FIVE_MIN = 5 * 60 * 1000;

function getDayKey(ts) {
  if (!ts) return 'unknown';
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function getDayLabel(ts, locale, t) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (getDayKey(d) === getDayKey(now)) return t('chat.workspace.today', 'Today');
  if (getDayKey(d) === getDayKey(yesterday)) return t('chat.workspace.yesterday', 'Yesterday');
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

export function ChatMessages({ messages = [], isLoading, currentUserId, isGroupRoom, onReply, onReact, onDelete, onEdit, hasOlder, onLoadOlder, isFetchingOlder, olderError }) {
  const { locale, t } = useLanguage();
  const bottomRef = useRef(null);
  const viewportRef = useRef(null);
  const previousLast = useRef(null);
  const prependHeight = useRef(null);
  const [showFab, setShowFab] = useState(false);

  const items = useMemo(() => {
    if (!messages.length) return [];
    const result = [];
    let lastDayKey = null;
    let lastSenderId = null;
    let lastTs = null;

    messages.forEach((msg, idx) => {
      const ts = msg.sentAt || msg.created_at || msg.createdAt;
      const senderId = String(msg.senderId?._id || msg.senderId || msg.sender_id);
      const dayKey = getDayKey(ts);

      if (dayKey !== lastDayKey) {
        result.push({ type: 'sep', key: `sep-${dayKey}-${idx}`, label: getDayLabel(ts, locale, t) });
        lastDayKey = dayKey;
        lastSenderId = null;
        lastTs = null;
      }

      const sameGroup = senderId === lastSenderId && lastTs && ts && Math.abs(new Date(ts) - new Date(lastTs)) < FIVE_MIN;

      const nextMsg = messages[idx + 1];
      const nextSenderId = String(nextMsg?.senderId?._id || nextMsg?.senderId || nextMsg?.sender_id);
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
  }, [messages, locale, t, currentUserId]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (prependHeight.current !== null) {
      viewport.scrollTop += viewport.scrollHeight - prependHeight.current;
      prependHeight.current = null;
    } else if (!previousLast.current || (!showFab && previousLast.current !== messages.at(-1)?._id)) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
    previousLast.current = messages.at(-1)?._id;
  }, [messages, showFab]);
  async function loadOlder() {
    prependHeight.current = viewportRef.current?.scrollHeight ?? null;
    try { await onLoadOlder(); } catch { prependHeight.current = null; }
  }

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
    <div className="chat-message-list relative min-h-0 flex-1 overflow-hidden bg-muted/10">
      <div
        ref={viewportRef}
        className="h-full overflow-y-auto py-2 scrollbar-thin scrollbar-thumb-border"
        onScroll={handleScroll}
      >
        {hasOlder && <div className="py-3 text-center"><Button variant="outline" size="sm" disabled={isFetchingOlder} onClick={loadOlder}>{t('chat.workspace.loadOlder', 'Load earlier messages')}</Button>{olderError && <p role="alert" className="mt-2 text-xs text-destructive">{t('chat.workspace.loadFailed', 'Unable to load messages. Try again.')}</p>}</div>}
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
            aria-label={t("chat.workspace.jumpLatest", "Latest messages")}
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
