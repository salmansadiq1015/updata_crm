'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Microphone dictation for the copilot: records with MediaRecorder (works in Chrome, Edge, Firefox and
 * Safari), exposes a live level meter, and finishes by itself after a pause once the user has spoken.
 * The recording is handed to `onAudio`; nothing is kept in the browser.
 */
export type DictationState = 'idle' | 'requesting' | 'recording' | 'processing';
export type DictationError = 'unsupported' | 'denied' | 'no_device' | 'failed';
export type FinishMode = 'send' | 'insert';

const MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/ogg'];
export const MAX_SECONDS = 120;
const SILENCE_MS = 2200;      // pause after speech → finish automatically
const SPEECH_LEVEL = 0.06;    // RMS above this counts as speech
const BARS = 28;

interface Options {
  onAudio: (audio: Blob, mode: FinishMode) => Promise<void> | void;
  autoStopOnSilence?: boolean;
}

export function useVoiceDictation({ onAudio, autoStopOnSilence = true }: Options) {
  const [state, setState] = useState<DictationState>('idle');
  const [error, setError] = useState<DictationError | null>(null);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; ctx: AudioContext; raf: number; chunks: Blob[]; mode: FinishMode | null; started: number; spoke: boolean; quietSince: number | null } | null>(null);
  const onAudioRef = useRef(onAudio);
  useEffect(() => { onAudioRef.current = onAudio; }, [onAudio]);

  const supported = typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  const teardown = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    cancelAnimationFrame(r.raf);
    r.stream.getTracks().forEach((tr) => tr.stop());
    r.ctx.close().catch(() => {});
    rec.current = null;
    setLevels(Array(BARS).fill(0));
  }, []);

  const finish = useCallback((mode: FinishMode | null) => {
    const r = rec.current;
    if (!r || r.recorder.state === 'inactive') return;
    r.mode = mode;
    r.recorder.stop();
  }, []);

  const start = useCallback(async () => {
    if (rec.current) return;
    setError(null);
    if (!supported) { setError('unsupported'); return; }
    setState('requesting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const name = (e as DOMException)?.name;
      setError(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : name === 'NotFoundError' ? 'no_device' : 'failed');
      setState('idle');
      return;
    }
    const mimeType = MIME_TYPES.find((m) => window.MediaRecorder.isTypeSupported?.(m));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const r = { recorder, stream, ctx, raf: 0, chunks: [] as Blob[], mode: null as FinishMode | null, started: Date.now(), spoke: false, quietSince: null as number | null };
    rec.current = r;
    let lastPaint = 0;
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = Date.now();
      if (rms > SPEECH_LEVEL) { r.spoke = true; r.quietSince = null; } else if (r.spoke && r.quietSince === null) r.quietSince = now;
      if (now - lastPaint > 60) {
        lastPaint = now;
        setLevels((prev) => [...prev.slice(1), Math.min(1, rms * 6)]);
        setSeconds(Math.floor((now - r.started) / 1000));
      }
      if (autoStopOnSilence && r.spoke && r.quietSince !== null && now - r.quietSince > SILENCE_MS) { finish('send'); return; }
      if (now - r.started > MAX_SECONDS * 1000) { finish('send'); return; }
      r.raf = requestAnimationFrame(tick);
    };
    recorder.ondataavailable = (e) => { if (e.data.size) r.chunks.push(e.data); };
    recorder.onstop = async () => {
      const mode = r.mode;
      const blob = new Blob(r.chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
      teardown();
      if (!mode || !blob.size) { setState('idle'); return; }
      setState('processing');
      try { await onAudioRef.current(blob, mode); } finally { setState('idle'); }
    };
    recorder.start(250);
    setSeconds(0);
    setState('recording');
    r.raf = requestAnimationFrame(tick);
  }, [supported, autoStopOnSilence, finish, teardown]);

  const cancel = useCallback(() => finish(null), [finish]);
  useEffect(() => () => { if (rec.current) { rec.current.mode = null; try { rec.current.recorder.stop(); } catch { /* already stopped */ } teardown(); } }, [teardown]);

  return { state, error, levels, seconds, supported, start, finish, cancel, clearError: () => setError(null) };
}
