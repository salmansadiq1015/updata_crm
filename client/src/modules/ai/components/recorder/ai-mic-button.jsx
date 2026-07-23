'use client';

import { Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';

export function AiMicButton({ isSupported, onClick, disabled, className }) {
  const { t } = useLanguage();

  return (
    <Button
      onClick={onClick}
      disabled={!isSupported || disabled}
      size="lg"
      className={cn(
        'relative h-24 w-24 rounded-full p-0 text-white',
        'bg-gradient-to-br from-brand-700 via-brand-600 to-brand-red',
        'shadow-[0_0_0_8px_rgba(78,116,219,0.14),0_28px_80px_rgba(208,10,25,0.22)]',
        'ring-1 ring-white/20 transition-all duration-200',
        'before:absolute before:inset-2 before:rounded-full before:border before:border-white/15 before:bg-white/10',
        'after:absolute after:-inset-3 after:rounded-full after:border after:border-brand-300/20',
        isSupported && !disabled && 'hover:scale-[1.03] hover:shadow-[0_0_0_10px_rgba(78,116,219,0.18),0_32px_90px_rgba(208,10,25,0.28)] active:scale-95',
        className
      )}
      aria-label={t('ai.chat.startVoiceRecording', 'Start voice recording')}
    >
      <Mic className="relative z-10 h-7 w-7" />
      {!isSupported && (
        <span className="sr-only">{t('ai.panel.voiceUnsupported', 'Voice not supported on this browser')}</span>
      )}
    </Button>
  );
}
