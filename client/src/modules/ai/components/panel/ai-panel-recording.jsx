'use client';

import { Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AiWaveform } from '../recorder/ai-waveform';
import { AiRecordingTimer } from '../recorder/ai-recording-timer';

export function AiPanelRecording({ recorder, onStop }) {
  const { elapsed, isWarning, getWaveformData, stopWaveform } = recorder;

  return (
    <div className="flex flex-col items-center gap-5 px-2 py-4">
      <div className="flex items-center gap-3">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
        <span className="text-sm font-medium">Recording</span>
        <AiRecordingTimer elapsed={elapsed} isWarning={isWarning} />
      </div>

      <AiWaveform
        getWaveformData={getWaveformData}
        stopWaveform={stopWaveform}
        isActive
      />

      {isWarning && (
        <p className="text-xs text-destructive text-center">
          Recording stops automatically at 15 minutes
        </p>
      )}

      <Button
        size="lg"
        variant="destructive"
        className="rounded-full h-14 w-14 p-0"
        onClick={onStop}
        aria-label="Stop recording"
      >
        <Square className="h-5 w-5 fill-current" />
      </Button>
    </div>
  );
}
