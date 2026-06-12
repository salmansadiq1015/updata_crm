'use client';

import { useCallback } from 'react';
import { useAiStore } from '../store/ai-store';
import { useMessageCopy } from './use-message-copy';
import { useVoiceInteraction } from './use-voice-interaction';
import { showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useInteractionLayer({ onDispatch }) {
  const { t } = useLanguage();
  const { voiceMode, autoPlay, setVoiceMode, setAutoPlay } = useAiStore();
  const handsFreeModeEnabled = voiceMode === 'hands-free';

  const copy = useMessageCopy();

  const voice = useVoiceInteraction({
    handsFreeModeEnabled,
    onTranscriptFinal: (text) => onDispatch(text),
    onError: (code) => {
      if (code === 'exit-command') {
        setVoiceMode('manual');
        return;
      }
      if (code === 'not-allowed') showError(t('ai.error.micDeniedSettings'));
      if (code === 'network') showError(t('ai.error.voiceUnavailable'));
    },
  });

  const startListening = useCallback(() => {
    voice.stopSpeaking();
    voice.startListening();
  }, [voice]);

  const toggleHandsFree = useCallback(() => {
    const next = handsFreeModeEnabled ? 'manual' : 'hands-free';
    setVoiceMode(next);
    if (next === 'manual') voice.stopListening();
  }, [handsFreeModeEnabled, setVoiceMode, voice]);

  const toggleAutoPlay = useCallback(() => setAutoPlay(!autoPlay), [autoPlay, setAutoPlay]);

  return {
    copy,
    voice: {
      ...voice,
      startListening,
      toggleHandsFree,
      toggleAutoPlay,
      autoPlay,
      handsFreeModeEnabled,
    },
  };
}
