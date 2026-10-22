import { requireOptionalNativeModule } from 'expo';
import * as Speech from 'expo-speech';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PermissionsAndroid, View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { Screen } from '@/components/layout/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { logger } from '@/services/logging/logger';

import type { UpdataTelephonyNativeModule } from '../../../../modules/updata-telephony/src/UpdataTelephony.types';

type Probe = Pick<UpdataTelephonyNativeModule, 'probeCallAudio' | 'setCallSpeaker' | 'probeToneLoop'>;
const probe = requireOptionalNativeModule<Probe>('UpdataTelephony');

/**
 * Diagnostics for the SIM AI-calling question: while a real SIM call is active, measure what
 * this device lets the app hear (each audio source, and whether Android silences it), whether
 * it can switch the call to the loudspeaker, and whether its own playback reaches the mic.
 * Only level statistics are produced; no audio is stored or uploaded.
 */
export function CallAudioCheckScreen() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<{ step: string; result: unknown }[]>([]);

  const run = async (step: string, fn: () => Promise<unknown>) => {
    setBusy(step);
    try {
      const result = await fn();
      // Collected from the dev console during device validation.
      logger.info('call-audio-check', { step, result: JSON.stringify(result) });
      setLog((l) => [{ step, result }, ...l]);
    } catch (e) {
      const result = { error: e instanceof Error ? e.message : String(e) };
      logger.info('call-audio-check', { step, result: JSON.stringify(result) });
      setLog((l) => [{ step, result }, ...l]);
    } finally {
      setBusy(null);
    }
  };

  const ensureMic = async () => {
    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) throw new Error('microphone permission denied');
  };

  if (!probe) {
    return (
      <Screen mode="scroll" edges={['bottom']} contentClassName="gap-4 px-4 pb-8 pt-3">
        <AppAlert tone="info" message={t('communication.callCheck.unavailable')} />
      </Screen>
    );
  }

  const actions: { key: string; label: string; fn: () => Promise<unknown> }[] = [
    {
      key: 'capture',
      label: t('communication.callCheck.capture'),
      fn: async () => {
        await ensureMic();
        return probe.probeCallAudio([], 2000);
      },
    },
    { key: 'speakerOn', label: t('communication.callCheck.speakerOn'), fn: () => probe.setCallSpeaker(true) },
    {
      key: 'speakerOff',
      label: t('communication.callCheck.speakerOff'),
      fn: () => probe.setCallSpeaker(false),
    },
    {
      key: 'toneVoice',
      label: t('communication.callCheck.toneVoice'),
      fn: async () => {
        await ensureMic();
        return probe.probeToneLoop('voice', 2000);
      },
    },
    {
      key: 'toneMedia',
      label: t('communication.callCheck.toneMedia'),
      fn: async () => {
        await ensureMic();
        return probe.probeToneLoop('media', 2000);
      },
    },
    {
      key: 'speak',
      label: t('communication.callCheck.speak'),
      fn: () =>
        new Promise((resolve) =>
          Speech.speak('This is the Updata assistant test voice. If you can hear me, please say yes.', {
            language: 'en',
            onDone: () => resolve({ spoke: true }),
            onError: (e) => resolve({ spoke: false, error: String(e) }),
          }),
        ),
    },
  ];

  return (
    <Screen mode="scroll" edges={['bottom']} contentClassName="gap-4 px-4 pb-8 pt-3">
      <AppText tone="muted">{t('communication.callCheck.intro')}</AppText>
      <View className="flex-row flex-wrap gap-2">
        {actions.map((a) => (
          <AppButton
            key={a.key}
            size="sm"
            variant="outline"
            title={a.label}
            loading={busy === a.key}
            disabled={busy !== null}
            onPress={() => void run(a.key, a.fn)}
          />
        ))}
      </View>
      {log.map((entry, i) => (
        <AppCard key={`${entry.step}-${log.length - i}`} className="gap-1">
          <AppText variant="label">{entry.step}</AppText>
          <AppText variant="caption" selectable>
            {JSON.stringify(entry.result, null, 1)}
          </AppText>
        </AppCard>
      ))}
    </Screen>
  );
}
