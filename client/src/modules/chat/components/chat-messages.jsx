'use client';

import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';
import { ChatMessage } from './chat-message';
import { ChatDateSeparator } from './chat-date-separator';

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
  yesterday.setDate(yesterday.getDate() - 1);
  if (getDayKey(d) === getDayKey(now)) return language === 'de' ? 'Heute' : 'Today';
  if (getDayKey(d) === getDayKey(yesterday)) return language === 'de' ? 'Gestern' : 'Yesterday';
  return formatDate(d);
}

export function ChatMessages({ messages = [], isLoading, currentUserId, onReply, onReact, onDelete, onEdit }) {
  const { language } = useLanguage();
  const bottomRef = useRef(null);
  const prevLengthRef = useRef(0);
  const [showFab, setShowFab] = useState(false);
  const items = useMemo(() => {
    if (!messages.length) return [];
    const result = [];
    let lastDayKey = null;
    let lastSenderId = null;
    let lastTs = null;

    messages.forEach((msg, idx) => {
      const ts = msg.created_at || msg.createdAt || msg.sentAt;
      const senderId = msg.senderId || msg.sender_id;
      const dayKey = getDayKey(ts);

      if (dayKey !== lastDayKey) {
        result.push({ type: 'separator', key: `sep-${dayKey}-${idx}`, label: getDayLabel(ts, language) });
        lastDayKey = dayKey;
        lastSenderId = null;
        lastTs = null;
      }

      const sameGroup = senderId === lastSenderId && lastTs && ts && Math.abs(new Date(ts) - new Date(lastTs)) < FIVE_MIN;

      const nextMsg = messages[idx + 1];
      const nextSenderId = nextMsg?.senderId || nextMsg?.sender_id;
      const nextTs = nextMsg?.created_at || nextMsg?.createdAt || nextMsg?.sentAt;
      const isLast =
        idx === messages.length - 1 ||
        nextSenderId !== senderId ||
        (nextTs && ts && Math.abs(new Date(nextTs) - new Date(ts)) >= FIVE_MIN);

      result.push({
        type: 'message',
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
    if (newLen > prevLengthRef.current && !showFab) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLengthRef.current = newLen;
  }, [messages.length, showFab]);

  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [isLoading, messages.length]);

  const handleScroll = useCallback((e) => {
    const el = e.currentTarget;
    setShowFab(el.scrollHeight - el.scrollTop - el.clientHeight > 100);
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div className="h-full overflow-y-auto scrollbar-thin py-2" onScroll={handleScroll}>
        {items.map((item) =>
          item.type === 'separator' ? (
            <ChatDateSeparator key={item.key} label={item.label} />
          ) : (
            <ChatMessage
              key={item.key}
              message={item.message}
              isMine={item.isMine}
              showSenderName={item.showSenderName}
              showTimestamp={item.showTimestamp}
              currentUserId={currentUserId}
              onReply={onReply}
              onReact={onReact}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          )
        )}
        <div ref={bottomRef} />
      </div>
      {showFab && (
        <div className="absolute bottom-3 right-3">
          <Button
            size="icon"
            variant="secondary"
            className="h-8 w-8 rounded-full shadow-md"
            onClick={() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); setShowFab(false); }}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
