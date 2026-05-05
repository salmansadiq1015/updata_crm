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
    <canvas
      ref={canvasRef}
      width={320}
      height={48}
      className="w-full h-12 rounded"
      aria-hidden="true"
    />
  );
}
