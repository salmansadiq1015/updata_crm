'use client';

import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { FieldOpsChatMessage } from './field-ops-chat-message';
import { FieldOpsChatDateSeparator } from './field-ops-chat-date-separator';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDate } from '@/lib/formatters';

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

  if (getDayKey(d) === getDayKey(now)) {
    return language === 'de' ? 'Heute' : 'Today';
  }
  if (getDayKey(d) === getDayKey(yesterday)) {
    return language === 'de' ? 'Gestern' : 'Yesterday';
  }
  return formatDate(d);
}

export function FieldOpsChatMessages({ messages = [], isLoading, currentUserId }) {
  const { language } = useLanguage();
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const [showFab, setShowFab] = useState(false);
  const prevLengthRef = useRef(0);

  // Group messages: build an array of { type: 'separator'|'message', ... } items
  const items = useMemo(() => {
    if (!messages.length) return [];
    const result = [];
    let lastDayKey = null;
    let lastSenderId = null;
    let lastTs = null;
    const FIVE_MIN = 5 * 60 * 1000;

    messages.forEach((msg, idx) => {
      const ts = msg.created_at || msg.createdAt;
      const dayKey = getDayKey(ts);
      const senderId = msg.sender_id || msg.senderId;

      if (dayKey !== lastDayKey) {
        result.push({ type: 'separator', key: `sep-${dayKey}`, label: getDayLabel(ts, language) });
        lastDayKey = dayKey;
        lastSenderId = null;
        lastTs = null;
      }

      const sameGroup =
        senderId === lastSenderId &&
        lastTs &&
        ts &&
        Math.abs(new Date(ts) - new Date(lastTs)) < FIVE_MIN;

      const nextMsg = messages[idx + 1];
      const nextSenderId = nextMsg?.sender_id || nextMsg?.senderId;
      const nextTs = nextMsg?.created_at || nextMsg?.createdAt;
      const isLast =
        idx === messages.length - 1 ||
        nextSenderId !== senderId ||
        (nextTs && ts && Math.abs(new Date(nextTs) - new Date(ts)) >= FIVE_MIN);

      result.push({
        type: 'message',
        key: msg._id || `msg-${idx}`,
        message: msg,
        isMine: senderId === currentUserId,
        showSenderName: !sameGroup,
        showTimestamp: isLast,
      });

      lastSenderId = senderId;
      lastTs = ts;
    });

    return result;
  }, [messages, language, currentUserId]);

  // Auto-scroll when new messages arrive, only if already at bottom
  useEffect(() => {
    const newLength = messages.length;
    if (newLength > prevLengthRef.current && !showFab) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevLengthRef.current = newLength;
  }, [messages.length, showFab]);

  // Initial scroll to bottom
  useEffect(() => {
    if (!isLoading && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }
  }, [isLoading]);

  const handleScroll = useCallback((e) => {
    const el = e.currentTarget;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowFab(distFromBottom > 100);
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowFab(false);
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        className="h-full overflow-y-auto scrollbar-thin py-2"
        onScroll={handleScroll}
      >
        {items.map((item) =>
          item.type === 'separator' ? (
            <FieldOpsChatDateSeparator key={item.key} label={item.label} />
          ) : (
            <FieldOpsChatMessage
              key={item.key}
              message={item.message}
              isMine={item.isMine}
              showSenderName={item.showSenderName}
              showTimestamp={item.showTimestamp}
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
            onClick={scrollToBottom}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
