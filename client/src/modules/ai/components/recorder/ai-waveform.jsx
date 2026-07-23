'use client';

import { useEffect, useRef } from 'react';

export function AiWaveform({ getWaveformData, stopWaveform, isActive }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (isActive && canvasRef.current) {
      getWaveformData(canvasRef.current);
    } else {
      stopWaveform();
    }
    return () => stopWaveform();
  }, [isActive, getWaveformData, stopWaveform]);

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-slate-950/45 p-3 shadow-inner shadow-black/30">
      <canvas
        ref={canvasRef}
        width={320}
        height={64}
        className="h-16 w-full rounded-xl bg-gradient-to-r from-brand-400/5 via-brand-400/10 to-brand-400/5"
        aria-hidden="true"
      />
    </div>
  );
}
