'use client';

import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';

export function AiVoiceStatusBar({
  voiceState,
  isHandsFree,
  autoPlay,
  onToggleHandsFree,
  onToggleAutoPlay,
  isSTTSupported,
  isTTSSupported,
}) {
  const { t } = useLanguage();
  if (!isSTTSupported) return null;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-7 gap-1.5 text-xs',
          isHandsFree
            ? 'text-primary bg-primary/10 hover:bg-primary/20'
            : 'text-muted-foreground hover:text-foreground',
        )}
        onClick={onToggleHandsFree}
        title={isHandsFree ? t('ai.voice.exitHandsFree') : t('ai.voice.enableHandsFree')}
      >
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full shrink-0',
            isHandsFree && voiceState === 'listening'
              ? 'bg-primary animate-pulse'
              : 'bg-current opacity-50',
          )}
        />
        {t('ai.voice.handsFree')}
        {isHandsFree ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
      </Button>

      {isTTSSupported && (
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-7 w-7', autoPlay ? 'text-primary' : 'text-muted-foreground')}
          onClick={onToggleAutoPlay}
          title={autoPlay ? t('ai.voice.disableAutoPlay') : t('ai.voice.enableAutoPlay')}
        >
          {autoPlay ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
        </Button>
      )}
    </div>
  );
}
