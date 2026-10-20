import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import { Mic, Square } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';
import { showErrorToast } from '@/utils/toast';

import { communicationApi } from '../api/communicationApi';

const MAX_SECONDS = 120;

type Props = {
  leadId: string;
  /** Called with the transcribed text, which the caller appends to the notes. */
  onText: (text: string) => void;
  disabled?: boolean;
};

/**
 * Speak the call summary instead of typing it. Records only when tapped, after the
 * call (Android does not give apps the microphone during a SIM call), uploads the
 * clip to the CRM for speech-to-text, and inserts the text into the notes for review.
 * The audio itself is never stored.
 */
export function VoiceNoteButton({ leadId, onText, disabled }: Props) {
  const { t, i18n } = useTranslation();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [phase, setPhase] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  const stopAndTranscribe = async () => {
    if (timer.current) clearInterval(timer.current);
    setPhase('transcribing');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('no recording');
      const result = await communicationApi.transcribe(leadId, { uri, mimeType: 'audio/mp4' }, i18n.language);
      if (!result.available) setMessage(t('communication.voice.unavailable'));
      else if (!result.text) setMessage(t('communication.voice.empty'));
      else {
        onText(result.text);
        setMessage(null);
      }
    } catch {
      showErrorToast(t('communication.voice.failed'));
    } finally {
      setPhase('idle');
      setSeconds(0);
    }
  };

  const start = async () => {
    setMessage(null);
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setMessage(t('communication.voice.permission'));
      return;
    }
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= MAX_SECONDS) void stopAndTranscribe();
          return s + 1;
        });
      }, 1000);
    } catch {
      // Typically: the microphone is busy because a call is still active.
      setMessage(t('communication.voice.busy'));
      setPhase('idle');
    }
  };

  return (
    <View className="gap-1">
      {phase === 'recording' ? (
        <AppButton
          size="sm"
          variant="destructive"
          leftIcon={Square}
          title={t('communication.voice.stop', { seconds })}
          onPress={() => void stopAndTranscribe()}
        />
      ) : (
        <AppButton
          size="sm"
          variant="soft"
          leftIcon={Mic}
          loading={phase === 'transcribing'}
          disabled={disabled || phase === 'transcribing'}
          title={
            phase === 'transcribing' ? t('communication.voice.transcribing') : t('communication.voice.record')
          }
          onPress={() => void start()}
        />
      )}
      {message ? (
        <AppText variant="caption" tone="muted">
          {message}
        </AppText>
      ) : null}
    </View>
  );
}
