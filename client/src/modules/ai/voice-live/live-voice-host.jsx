'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/lib/i18n/language-context';
import { useLiveVoiceStore } from './live-voice-store';
import { useLiveVoice } from './use-live-voice';
import { LiveVoiceOverlay } from './live-voice-overlay';

/**
 * Mounted once in the platform layout. Owns the single live conversation so
 * it survives page changes (the assistant can open pages while you talk).
 */
export function LiveVoiceHost() {
  const router = useRouter();
  const { locale } = useLanguage();
  const isOpen = useLiveVoiceStore((s) => s.isOpen);
  const minimized = useLiveVoiceStore((s) => s.minimized);
  const threadId = useLiveVoiceStore((s) => s.threadId);
  const voice = useLiveVoiceStore((s) => s.voice);
  const close = useLiveVoiceStore((s) => s.close);
  const setMinimized = useLiveVoiceStore((s) => s.setMinimized);
  const setVoice = useLiveVoiceStore((s) => s.setVoice);

  const handleOpenPage = useCallback((path) => {
    // Keep talking while the page changes underneath.
    setMinimized(true);
    router.push(path);
  }, [router, setMinimized]);

  const usedAgentRef = useRef(false);
  // Every end — by the person, by the assistant's goodbye, or a lost link —
  // closes the stage, except a failure, which stays open to show the error.
  const handleEnded = useCallback(({ threadId: endedThread, reason }) => {
    const keepError = reason === 'connection_lost' || reason === 'expired';
    if (!keepError) close(usedAgentRef.current ? endedThread : null);
    usedAgentRef.current = false;
  }, [close]);

  const live = useLiveVoice({ onOpenPage: handleOpenPage, onEnded: handleEnded });

  useEffect(() => {
    if (live.actions.some((a) => a.display?.kind === 'agent_run')) usedAgentRef.current = true;
  }, [live.actions]);

  // Open → connect. One attempt per opening; retry is explicit.
  const startedRef = useRef(false);
  const { start, end, status } = live;
  useEffect(() => {
    if (!isOpen) { startedRef.current = false; return; }
    if (startedRef.current) return;
    startedRef.current = true;
    start({ voice, locale, threadId });
  }, [isOpen, start, voice, locale, threadId]);

  const handleClose = useCallback(() => {
    if (['live', 'connecting'].includes(status)) end('user');
    else close(null);
  }, [status, end, close]);


  const handleRetry = useCallback(() => {
    start({ voice, locale, threadId });
  }, [start, voice, locale, threadId]);

  // Leaving the app (tab closed) hangs up cleanly.
  useEffect(() => {
    const onUnload = () => end('unload');
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, [end]);

  if (!isOpen) return null;

  return (
    <LiveVoiceOverlay
      live={live}
      minimized={minimized && status === 'live'}
      onMinimize={() => setMinimized(true)}
      onExpand={() => setMinimized(false)}
      onClose={handleClose}
      onRetry={handleRetry}
      voice={voice}
      onVoiceChange={setVoice}
    />
  );
}
