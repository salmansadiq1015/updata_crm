'use client';

import { Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AiWaveform } from '../recorder/ai-waveform';
import { AiRecordingTimer } from '../recorder/ai-recording-timer';
import { useLanguage } from '@/lib/i18n/language-context';

export function AiPanelRecording({ recorder, onStop }) {
  const { t } = useLanguage();
  const { elapsed, isWarning, getWaveformData, stopWaveform } = recorder;

  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-6 px-5 py-8">
      <div className="w-full rounded-2xl border border-red-300/15 bg-red-500/[0.06] p-4 shadow-[0_18px_70px_rgba(239,68,68,0.14)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-red-400 shadow-[0_0_18px_rgba(248,113,113,0.75)] animate-pulse" />
            <span className="text-sm font-semibold text-white">{t('ai.panel.recording', 'Recording')}</span>
          </div>
          <AiRecordingTimer elapsed={elapsed} isWarning={isWarning} />
        </div>
      </div>

      <AiWaveform
        getWaveformData={getWaveformData}
        stopWaveform={stopWaveform}
        isActive
      />

      {isWarning && (
        <p className="rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-center text-xs text-amber-100">
          {t('ai.panel.recordingLimit', 'Die Aufnahme stoppt automatisch nach 15 Minuten.')}
        </p>
      )}

      <Button
        size="lg"
        variant="destructive"
        className="h-16 w-16 rounded-full border border-red-300/20 bg-gradient-to-br from-red-500 to-rose-600 p-0 shadow-[0_20px_60px_rgba(244,63,94,0.24)]"
        onClick={onStop}
        aria-label={t('ai.panel.stopRecording', 'Aufnahme stoppen')}
      >
        <Square className="h-5 w-5 fill-current" />
      </Button>
    </div>
  );
}
