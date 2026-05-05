'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AiChatMessageActions } from './ai-chat-message-actions';
import { AiChatRetryIndicator } from './ai-chat-retry-indicator';

export function AiChatMessage({
  variant = 'assistant',
  timestamp,
  children,
  // interaction props
  messageId,
  content,
  isStreaming,
  retryState,
  copyState,
  onCopy,
  ttsProps,
}) {
  const isUser = variant === 'user';
  const [hovered, setHovered] = useState(false);

  const showActions = !isUser && messageId && !isStreaming && hovered;

  // Derive individual TTS props from ttsProps object
  const ttsActive = ttsProps?.voiceState === 'responding';
  const onPlay = ttsProps ? () => ttsProps.speak(content) : undefined;
  const onStop = ttsProps?.stopSpeaking;
  const showTts = !!ttsProps?.speak;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className={cn('flex gap-3 w-full group', isUser ? 'justify-end' : 'justify-start')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!isUser && (
        <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-1">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
      )}

      <div className={cn('flex flex-col gap-1.5 min-w-0', isUser ? 'items-end' : 'items-start')}>
        <div className="relative">
          <div
            className={cn(
              'px-4 py-3 text-sm leading-relaxed',
              isUser
                ? 'bg-primary-gradient text-white rounded-2xl rounded-tr-sm max-w-[75%]'
                : 'bg-card border rounded-2xl rounded-tl-sm max-w-[85%]',
              retryState?.isRetrying && 'opacity-60 ring-2 ring-primary/40 animate-pulse'
            )}
          >
            {children}
          </div>

          {showActions && (
            <AiChatMessageActions
              messageId={messageId}
              content={content}
              copyState={copyState}
              onCopy={onCopy}
              onPlay={onPlay}
              onStop={onStop}
              ttsActive={ttsActive}
              showTts={showTts}
            />
          )}
        </div>

        {retryState && (retryState.isRetrying || retryState.nextRetryAt || retryState.exhausted) && (
          <AiChatRetryIndicator retryState={retryState} />
        )}

        {timestamp && (
          <span className="text-xs text-muted-foreground px-1">{timestamp}</span>
        )}
      </div>
    </motion.div>
  );
}
