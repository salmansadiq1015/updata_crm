'use client';

import { useCallback, useRef, useState } from 'react';
import { CHAT_AUDIO_MAX_DURATION_SECONDS } from '../constants/chat-config';
import { chatService } from '../services/chat-service';

export const AUDIO_RECORDER_ERRORS = {
  UPLOAD_FAILED: 'CHAT_AUDIO_UPLOAD_FAILED',
  MICROPHONE_DENIED: 'CHAT_AUDIO_MICROPHONE_DENIED',
};

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const durationRef = useRef(0);
  const discardRef = useRef(false);

  const stopRecording = useCallback((discard = false) => {
    discardRef.current = discard;
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setResult(null);
      setDuration(0);
      discardRef.current = false;
      durationRef.current = 0;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (discardRef.current) {
          discardRef.current = false;
          chunksRef.current = [];
          return;
        }

        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType.includes('webm') ? 'webm' : 'ogg';
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mimeType });
        const formData = new FormData();
        formData.append('file', file);
        formData.append('module', 'chat');

        try {
          const uploaded = await chatService.uploadFile(formData);
          setResult({
            attachmentUrl: uploaded.url || uploaded.attachmentUrl,
            attachmentFileId: uploaded._id || uploaded.id || uploaded.attachmentFileId,
            duration: durationRef.current,
          });
        } catch (uploadError) {
          setError(uploadError?.message || AUDIO_RECORDER_ERRORS.UPLOAD_FAILED);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      timerRef.current = setInterval(() => {
        durationRef.current += 1;
        setDuration(durationRef.current);
        if (durationRef.current >= CHAT_AUDIO_MAX_DURATION_SECONDS) stopRecording();
      }, 1000);
    } catch (recordingError) {
      setError(recordingError?.message || AUDIO_RECORDER_ERRORS.MICROPHONE_DENIED);
    }
  }, [stopRecording]);

  const reset = useCallback(() => {
    setResult(null);
    setDuration(0);
    setError(null);
  }, []);

  const cancelRecording = useCallback(() => {
    stopRecording(true);
    reset();
  }, [reset, stopRecording]);

  return {
    isRecording,
    duration,
    error,
    result,
    startRecording,
    stopRecording,
    cancelRecording,
    reset,
  };
}
