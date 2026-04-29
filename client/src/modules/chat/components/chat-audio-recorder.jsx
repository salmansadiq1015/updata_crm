'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Square, X } from 'lucide-react';
import { useAudioRecorder } from '../hooks/use-audio-recorder';

function formatDuration(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function ChatAudioRecorder({ onComplete, onCancel }) {
  const { isRecording, duration, error, result, startRecording, stopRecording, reset } = useAudioRecorder();

  useEffect(() => {
    startRecording();
  }, [startRecording]);

  useEffect(() => {
    if (result) {
      onComplete(result);
      reset();
    }
  }, [result, onComplete, reset]);

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-muted/50 rounded-lg">
      {/* Animated bars */}
      <div className="flex gap-0.5 items-center h-6">
        {[0.4, 0.7, 1, 0.7, 0.4, 0.6, 0.9, 0.5].map((h, i) => (
          <span
            key={i}
            className="w-1 rounded-full bg-destructive animate-pulse"
            style={{ height: `${h * 24}px`, animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>

      {/* Timer */}
      <span className="text-sm font-mono text-destructive font-semibold min-w-[3rem]">
        {formatDuration(duration)}
      </span>

      <span className="text-xs text-muted-foreground flex-1">Recording…</span>

      {error && <span className="text-xs text-destructive">{error}</span>}

      {/* Stop */}
      <Button
        size="sm"
        variant="destructive"
        className="h-7 px-2 gap-1"
        onClick={stopRecording}
        disabled={!isRecording}
      >
        <Square className="h-3 w-3" /> Send
      </Button>

      {/* Cancel */}
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { stopRecording(); reset(); onCancel(); }}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
