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
      className={cn('flex w-full gap-3 group', isUser ? 'justify-end' : 'justify-start')}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {!isUser && (
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 shadow-sm shadow-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
      )}

      <div
        className={cn(
          'flex min-w-0 flex-col gap-1.5',
          isUser
            ? 'ml-auto max-w-[82%] items-end md:max-w-[34rem]'
            : 'mr-auto max-w-[88%] items-start md:max-w-[42rem]',
        )}
      >
        <div className="relative max-w-full">
          <div
            className={cn(
              'w-fit max-w-full break-words px-4 py-3 text-sm leading-6 shadow-sm',
              isUser
                ? 'rounded-2xl rounded-br-md bg-primary-gradient text-primary-foreground shadow-primary/20'
                : 'rounded-2xl rounded-bl-md border border-border/80 bg-card/90 text-card-foreground shadow-black/5 dark:bg-card/75',
              retryState?.isRetrying && 'opacity-60 ring-2 ring-primary/40 animate-pulse'
            )}
          >
            {children}
          </div>

          {/* Floating action bar appears at bottom-right of bubble on hover, no layout shift. */}
          {showActions && (
            <div className="absolute -bottom-3 right-2 z-10 flex items-center rounded-lg border bg-background px-0.5 py-0.5 shadow-lg shadow-black/10">
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
            </div>
          )}
        </div>

        {retryState && (retryState.isRetrying || retryState.nextRetryAt || retryState.exhausted) && (
          <AiChatRetryIndicator retryState={retryState} />
        )}

        {timestamp && (
          <span className="px-1 text-[11px] font-medium text-muted-foreground/80">{timestamp}</span>
        )}
      </div>
    </motion.div>
  );
}
