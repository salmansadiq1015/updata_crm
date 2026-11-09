'use client';

import { useCallback } from 'react';
import { useAiStore } from '../store/ai-store';
import { useMessageCopy } from './use-message-copy';
import { useVoiceInteraction } from './use-voice-interaction';
import { showError } from '@/lib/toast';
import { useLanguage } from '@/lib/i18n/language-context';

export function useInteractionLayer({ onDispatch }) {
  const { t, locale } = useLanguage();
  const ttsLang = { de: 'de-CH', en: 'en-US', fr: 'fr-CH', ar: 'ar' }[locale] || '';
  const { voiceMode, autoPlay, setVoiceMode, setAutoPlay } = useAiStore();
  const handsFreeModeEnabled = voiceMode === 'hands-free';

  const copy = useMessageCopy();

  const voice = useVoiceInteraction({
    handsFreeModeEnabled,
    ttsLang,
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
    if (next === 'manual') {
      voice.stopListening();
      voice.stopSpeaking();
    } else {
      // Hands-free means listening now, not after the next spoken answer.
      voice.stopSpeaking();
      voice.startListening();
    }
  }, [handsFreeModeEnabled, setVoiceMode, voice]);

  // A run that settles without anything to say (or a failed one) must hand
  // the microphone back in hands-free mode instead of hanging in 'processing'.
  const resumeHandsFree = useCallback(() => {
    if (!handsFreeModeEnabled) return;
    if (voice.voiceState === 'listening' || voice.voiceState === 'responding') return;
    voice.startListening();
  }, [handsFreeModeEnabled, voice]);

  const toggleAutoPlay = useCallback(() => setAutoPlay(!autoPlay), [autoPlay, setAutoPlay]);

  return {
    copy,
    voice: {
      ...voice,
      startListening,
      toggleHandsFree,
      resumeHandsFree,
      toggleAutoPlay,
      autoPlay,
      handsFreeModeEnabled,
    },
  };
}
