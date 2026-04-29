'use client';
import { useState, useRef, useCallback } from 'react';
import { chatService } from '../services/chat-service';

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { attachmentUrl, attachmentFileId, duration }
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const MAX_DURATION = 120;

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setResult(null);
      setDuration(0);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/ogg';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = mimeType.includes('webm') ? 'webm' : 'ogg';
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: mimeType });
        const formData = new FormData();
        formData.append('file', file);
        try {
          const uploaded = await chatService.uploadFile(formData);
          setResult({ attachmentUrl: uploaded.attachmentUrl || uploaded.url, attachmentFileId: uploaded._id || uploaded.attachmentFileId, duration });
        } catch (uploadErr) {
          setError('Upload failed');
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      let secs = 0;
      timerRef.current = setInterval(() => {
        secs += 1;
        setDuration(secs);
        if (secs >= MAX_DURATION) stopRecording();
      }, 1000);
    } catch (err) {
      setError('Microphone access denied');
    }
  }, []);

  const stopRecording = useCallback(() => {
    clearInterval(timerRef.current);
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }
    setIsRecording(false);
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setDuration(0);
    setError(null);
  }, []);

  return { isRecording, duration, error, result, startRecording, stopRecording, reset };
}
