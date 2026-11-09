'use client';

import { AudioLines } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { useLiveVoiceStore } from './live-voice-store';

/**
 * Starts a live voice conversation (the orb). `threadId` makes what is done
 * by voice land in that chat thread.
 *
 * variant "icon": compact round button for the chat composer.
 * variant "pill": labelled call-to-action (welcome screen, header).
 */
export function LiveVoiceButton({ threadId = null, variant = 'icon', className }) {
  const { t } = useLanguage();
  const open = useLiveVoiceStore((s) => s.open);
  const isOpen = useLiveVoiceStore((s) => s.isOpen);
  const setMinimized = useLiveVoiceStore((s) => s.setMinimized);
  const label = t('live.start', 'Talk to Updata (live voice)');

  const onClick = () => {
    if (isOpen) { setMinimized(false); return; }
    open({ threadId });
  };

  if (variant === 'pill') {
    return (
      <button
        type="button"
        onClick={onClick}
        data-testid="live-voice-start"
        className={cn(
          'group relative inline-flex items-center gap-2.5 overflow-hidden rounded-full py-2 pl-2 pr-4 text-sm font-semibold text-white',
          'bg-gradient-to-r from-sky-600 via-sky-500 to-cyan-500 shadow-lg shadow-sky-500/25 transition-transform hover:scale-[1.02]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          className,
        )}
      >
        <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-white/20">
          <span className="absolute inset-0 rounded-full bg-white/30 motion-safe:animate-ping [animation-duration:2.4s]" />
          <AudioLines className="relative h-4 w-4" />
        </span>
        {t('live.startShort', 'Talk live')}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      data-testid="live-voice-start"
      className={cn(
        'relative flex h-8 w-8 items-center justify-center rounded-xl text-white',
        'bg-gradient-to-br from-sky-500 to-cyan-500 shadow-sm shadow-sky-500/30 transition-transform hover:scale-105',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300',
        className,
      )}
    >
      <AudioLines className="h-4 w-4" />
    </button>
  );
}
