'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  MAX_RECORDING_SECONDS,
  RECORDING_WARNING_SECONDS,
  RECORDING_STATES,
  OFFLINE_QUEUE_MAX,
} from '../constants/ai-constants';
import { aiSessionService } from '../services/ai-session-service';

const CHUNK_INTERVAL_MS = 250;
const DB_NAME = 'ai-audio-queue';
const DB_STORE = 'recordings';
const RECORDER_STOP_TIMEOUT_MS = 1500;
const AUDIO_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

// ---------- IndexedDB helpers ----------

async function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(DB_STORE, { autoIncrement: true });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function queueAudio(blob, sessionId) {
  const db    = await openDb();
  const tx    = db.transaction(DB_STORE, 'readwrite');
  const store = tx.objectStore(DB_STORE);

  // Enforce max queue depth
  const countReq = store.count();
  await new Promise((res) => { countReq.onsuccess = res; });
  if (countReq.result >= OFFLINE_QUEUE_MAX) {
    // Delete the oldest entry
    const cursor = store.openCursor();
    await new Promise((res) => {
      cursor.onsuccess = (e) => { e.target.result?.delete(); res(); };
    });
  }

  store.add({ blob, sessionId, at: Date.now() });
}

async function drainQueue(onUpload) {
  const db    = await openDb();
  const tx    = db.transaction(DB_STORE, 'readwrite');
  const store = tx.objectStore(DB_STORE);
  const all   = await new Promise((res) => {
    const req = store.getAll();
    req.onsuccess = (e) => res(e.target.result);
  });
  const keys = await new Promise((res) => {
    const req = store.getAllKeys();
    req.onsuccess = (e) => res(e.target.result);
  });

  for (let i = 0; i < all.length; i++) {
    try {
      const { blob, sessionId } = all[i];
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');
      await onUpload(sessionId, formData);
      const delTx = db.transaction(DB_STORE, 'readwrite');
      delTx.objectStore(DB_STORE).delete(keys[i]);
    } catch {
      // Leave failed entry for next retry
    }
  }
}

// ---------- Hook ----------

export function useAudioRecorder({ onUploadComplete, onError } = {}) {
  const isSupported =
    typeof window !== 'undefined' &&
    !!globalThis.navigator?.mediaDevices?.getUserMedia &&
    typeof window.MediaRecorder !== 'undefined';

  const mediaRecorderRef   = useRef(null);
  const chunksRef          = useRef([]);
  const streamRef          = useRef(null);
  const audioContextRef    = useRef(null);
  const analyserRef        = useRef(null);
  const animFrameRef       = useRef(null);
  const timerRef           = useRef(null);
  const sessionIdRef       = useRef(null);
  const stopRecordingRef   = useRef(null);
  const isStoppingRef      = useRef(false);

  const [recordingState, setRecordingState] = useState(RECORDING_STATES.IDLE);
  const [elapsed, setElapsed]               = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError]                   = useState(null);
  const [isWarning, setIsWarning]           = useState(false);

  // Drain offline queue when coming back online
  useEffect(() => {
    const handler = () => {
      drainQueue((sessionId, formData) =>
        aiSessionService.uploadAudio(sessionId, formData)
      ).catch(() => {});
    };
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, []);

  const getWaveformData = useCallback((canvas) => {
    if (!analyserRef.current || !canvas) return;
    const ctx    = canvas.getContext('2d');
    if (!ctx) return;
    const width  = canvas.width;
    const height = canvas.height;
    const buffer = new Uint8Array(analyserRef.current.frequencyBinCount);
    const strokeStyle =
      getComputedStyle(canvas).getPropertyValue('--primary').trim() ||
      '#9F7AEA';

    const draw = () => {
      analyserRef.current?.getByteTimeDomainData(buffer);
      ctx.clearRect(0, 0, width, height);
      ctx.beginPath();
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth   = 2;
      const sliceWidth = width / buffer.length;
      let x = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = buffer[i] / 128.0;
        const y = (v * height) / 2;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();
      animFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
  }, []);

  const stopWaveform = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = null;
  }, []);

  const cleanupMedia = useCallback(async () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    analyserRef.current = null;

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== 'closed') {
      await audioContext.close().catch(() => {});
    }
  }, []);

  const getPreferredMimeType = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') return '';
    return AUDIO_MIME_TYPES.find((type) => window.MediaRecorder.isTypeSupported(type)) || '';
  }, []);

  const startRecording = useCallback(async (sessionId) => {
    if (!isSupported) {
      setError('MIC_NOT_SUPPORTED');
      onError?.('MIC_NOT_SUPPORTED');
      throw new Error('MIC_NOT_SUPPORTED');
    }

    try {
      const stream = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current    = stream;
      sessionIdRef.current = sessionId;
      chunksRef.current    = [];

      // Waveform analyser
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioContextCtor) {
        const audioCtx = new AudioContextCtor();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioContextRef.current = audioCtx;
        analyserRef.current = analyser;
      }

      const mimeType = getPreferredMimeType();
      const recorder = mimeType
        ? new window.MediaRecorder(stream, { mimeType })
        : new window.MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) chunksRef.current.push(e.data);
      };

      recorder.start(CHUNK_INTERVAL_MS);
      setRecordingState(RECORDING_STATES.RECORDING);
      setElapsed(0);
      setError(null);
      setIsWarning(false);

      // Timer
      let seconds = 0;
      timerRef.current = setInterval(() => {
        seconds += 1;
        setElapsed(seconds);
        if (seconds >= RECORDING_WARNING_SECONDS) setIsWarning(true);
        if (seconds >= MAX_RECORDING_SECONDS) stopRecordingRef.current?.();
      }, 1000);
    } catch (err) {
      const code = err.name === 'NotAllowedError' ? 'MIC_DENIED' : 'MIC_ERROR';
      clearInterval(timerRef.current);
      stopWaveform();
      await cleanupMedia();
      mediaRecorderRef.current = null;
      setRecordingState(RECORDING_STATES.IDLE);
      setError(code);
      onError?.(code);
      throw err;
    }
  }, [cleanupMedia, getPreferredMimeType, isSupported, onError, stopWaveform]);

  const stopRecording = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    clearInterval(timerRef.current);
    stopWaveform();

    const recorder = mediaRecorderRef.current;
    try {
      if (!recorder || recorder.state === 'inactive') {
        await cleanupMedia();
        setRecordingState(RECORDING_STATES.IDLE);
        return { skipped: true };
      }

      const stopped = new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          recorder.removeEventListener('stop', finish);
          resolve();
        };
        recorder.addEventListener('stop', finish, { once: true });
        window.setTimeout(finish, RECORDER_STOP_TIMEOUT_MS);
      });

      recorder.requestData?.();
      recorder.stop();
      await stopped;
      await cleanupMedia();

      const mimeType = recorder.mimeType || 'audio/webm';
      const blob     = new Blob(chunksRef.current, { type: mimeType });
      if (blob.size === 0) {
        throw new Error('EMPTY_AUDIO');
      }

      setRecordingState(RECORDING_STATES.UPLOADING);
      setUploadProgress(0);

      const sessionId = sessionIdRef.current;
      if (!sessionId) {
        throw new Error('MISSING_SESSION');
      }

      if (!globalThis.navigator.onLine) {
        await queueAudio(blob, sessionId);
        setRecordingState(RECORDING_STATES.IDLE);
        return { queued: true };
      }

      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');

      const result = await aiSessionService.uploadAudio(sessionId, formData, setUploadProgress);
      setRecordingState(RECORDING_STATES.IDLE);
      onUploadComplete?.(result);
      return result;
    } catch (err) {
      // Queue for retry on reconnect
      const sessionId = sessionIdRef.current;
      const blob = chunksRef.current.length
        ? new Blob(chunksRef.current, { type: recorder?.mimeType || 'audio/webm' })
        : null;
      if (blob?.size && sessionId) {
        await queueAudio(blob, sessionId).catch(() => {});
      }
      await cleanupMedia();
      setRecordingState(RECORDING_STATES.IDLE);
      const code = err.message === 'EMPTY_AUDIO' ? 'EMPTY_AUDIO' : 'UPLOAD_FAILED';
      setError(code);
      onError?.(code);
      throw err;
    } finally {
      isStoppingRef.current = false;
    }
  }, [cleanupMedia, stopWaveform, onUploadComplete, onError]);

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  }, [stopRecording]);

  const reset = useCallback(() => {
    clearInterval(timerRef.current);
    stopWaveform();
    cleanupMedia();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    sessionIdRef.current = null;
    isStoppingRef.current = false;
    setRecordingState(RECORDING_STATES.IDLE);
    setElapsed(0);
    setUploadProgress(0);
    setError(null);
    setIsWarning(false);
  }, [cleanupMedia, stopWaveform]);

  return {
    isSupported,
    recordingState,
    elapsed,
    uploadProgress,
    error,
    isWarning,
    startRecording,
    stopRecording,
    getWaveformData,
    stopWaveform,
    reset,
  };
}
