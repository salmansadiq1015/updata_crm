'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { splitIntoChunks } from '../utils/tts-chunker';

const SILENCE_TIMEOUT_MS = 1500;
const LOW_CONFIDENCE_THRESHOLD = 0.6;
const LOW_CONFIDENCE_DELAY_MS = 2000;
const EXIT_COMMANDS = new Set(['stop', 'cancel', 'nevermind']);

export function useVoiceInteraction({ onTranscriptFinal, onError, handsFreeModeEnabled = false }) {
  const [voiceState, setVoiceState] = useState('idle');
  const [transcript, setTranscript] = useState({ partial: '', final: '', confidence: null });

  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const ttsQueueRef = useRef([]);
  const isSpeakingRef = useRef(false);
  const handsFreeRef = useRef(handsFreeModeEnabled);
  const onTranscriptRef = useRef(onTranscriptFinal);
  const onErrorRef = useRef(onError);
  const startListeningRef = useRef(null);
  const playNextRef = useRef(null);
  // Tracks live transcript without relying on functional setState inside browser callbacks
  const transcriptRef = useRef({ partial: '', final: '', confidence: null });
  // Set to true when stopListening is called so onend doesn't submit
  const abortedRef = useRef(false);

  useEffect(() => { handsFreeRef.current = handsFreeModeEnabled; }, [handsFreeModeEnabled]);
  useEffect(() => { onTranscriptRef.current = onTranscriptFinal; }, [onTranscriptFinal]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const isSTTSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  const isTTSSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  // ── TTS ───────────────────────────────────────────────────────────────
  const _playNext = useCallback(() => {
    if (!isTTSSupported || ttsQueueRef.current.length === 0) {
      isSpeakingRef.current = false;
      setVoiceState((prev) => (prev === 'responding' ? 'idle' : prev));
      if (handsFreeRef.current && startListeningRef.current) {
        startListeningRef.current();
      }
      return;
    }
    const chunk = ttsQueueRef.current.shift();
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.onend = () => playNextRef.current?.();
    utterance.onerror = () => playNextRef.current?.();
    isSpeakingRef.current = true;
    window.speechSynthesis.speak(utterance);
  }, [isTTSSupported]);

  useEffect(() => { playNextRef.current = _playNext; }, [_playNext]);

  const speak = useCallback(
    (text) => {
      if (!isTTSSupported) return;
      const chunks = splitIntoChunks(text);
      if (!chunks.length) return;
      ttsQueueRef.current.push(...chunks);
      setVoiceState('responding');
      if (!isSpeakingRef.current) _playNext();
    },
    [isTTSSupported, _playNext]
  );

  const stopSpeaking = useCallback(() => {
    if (!isTTSSupported) return;
    ttsQueueRef.current = [];
    window.speechSynthesis.cancel();
    isSpeakingRef.current = false;
    setVoiceState('idle');
  }, [isTTSSupported]);

  // ── STT ───────────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!isSTTSupported) { onErrorRef.current?.('not-supported'); return; }

    abortedRef.current = false;
    transcriptRef.current = { partial: '', final: '', confidence: null };
    setTranscript({ partial: '', final: '', confidence: null });

    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognitionRef.current = recognition;

    const resetSilence = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => recognition.stop(), SILENCE_TIMEOUT_MS);
    };

    recognition.onresult = (e) => {
      resetSilence();
      let interim = '';
      let finalText = '';
      let confidence = null;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
          confidence = result[0].confidence;
        } else {
          interim += result[0].transcript;
        }
      }
      transcriptRef.current = {
        partial: interim,
        final: transcriptRef.current.final + finalText,
        confidence: confidence ?? transcriptRef.current.confidence,
      };
      setTranscript({ ...transcriptRef.current });
    };

    recognition.onerror = (e) => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      setVoiceState('idle');
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      onErrorRef.current?.(e.error);
    };

    recognition.onend = () => {
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      // Manual cancel — do not submit
      if (abortedRef.current) {
        abortedRef.current = false;
        return;
      }

      setVoiceState((prev) => (prev === 'listening' ? 'processing' : prev));

      const { partial, final, confidence } = transcriptRef.current;
      const text = (final + partial).trim();

      // Clear transcript immediately
      transcriptRef.current = { partial: '', final: '', confidence: null };
      setTranscript({ partial: '', final: '', confidence: null });

      if (!text) {
        setVoiceState('idle');
        return;
      }

      const lower = text.toLowerCase();
      if (EXIT_COMMANDS.has(lower)) {
        onErrorRef.current?.('exit-command');
        setVoiceState('idle');
        return;
      }

      const dispatchTranscript = () => {
        onTranscriptRef.current?.(text, confidence);
        // In normal mode, go back to idle — in hands-free, TTS will drive state to 'responding'
        if (!handsFreeRef.current) setVoiceState('idle');
      };

      const isLowConf = confidence !== null && confidence < LOW_CONFIDENCE_THRESHOLD;
      if (isLowConf) {
        setTimeout(dispatchTranscript, LOW_CONFIDENCE_DELAY_MS);
      } else {
        dispatchTranscript();
      }
    };

    recognition.start();
    setVoiceState('listening');
    resetSilence();
  }, [isSTTSupported]);

  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  const stopListening = useCallback(() => {
    abortedRef.current = true;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    transcriptRef.current = { partial: '', final: '', confidence: null };
    setVoiceState('idle');
    setTranscript({ partial: '', final: '', confidence: null });
  }, []);

  // Cleanup on unmount
  useEffect(() => () => {
    recognitionRef.current?.abort();
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
  }, []);

  return {
    voiceState,
    transcript,
    isSTTSupported,
    isTTSSupported,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  };
}
