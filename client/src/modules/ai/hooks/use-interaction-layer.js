'use client';

import { useCallback } from 'react';
import { useAiStore } from '../store/ai-store';
import { useMessageCopy } from './use-message-copy';
import { useVoiceInteraction } from './use-voice-interaction';
import { showError } from '@/lib/toast';

const VOICE_ERROR_MESSAGES = {
  'not-allowed': 'Microphone access denied — check browser permissions.',
  'network': 'Voice unavailable — type instead.',
};

export function useInteractionLayer({ onDispatch }) {
  const { voiceMode, autoPlay, setVoiceMode, setAutoPlay } = useAiStore();
  const handsFreeModeEnabled = voiceMode === 'hands-free';

  const copy = useMessageCopy();

  const voice = useVoiceInteraction({
    handsFreeModeEnabled,
    onTranscriptFinal: (text) => onDispatch(text),
    onError: (code) => {
      if (code === 'exit-command') { setVoiceMode('manual'); return; }
      const msg = VOICE_ERROR_MESSAGES[code];
      if (msg) showError(msg);
    },
  });

  // Cross-feature: stop TTS before starting STT
  const startListening = useCallback(() => {
    voice.stopSpeaking();
    voice.startListening();
  }, [voice]);

  const toggleHandsFree = useCallback(() => {
    const next = handsFreeModeEnabled ? 'manual' : 'hands-free';
    setVoiceMode(next);
    if (next === 'manual') voice.stopListening();
  }, [handsFreeModeEnabled, setVoiceMode, voice]);

  return {
    copy,
    voice: { ...voice, startListening, toggleHandsFree },
  };
}
