'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, PenSquare, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SESSION_TYPES } from '../../constants/ai-constants';
import { useInteractionLayer } from '../../hooks/use-interaction-layer';
import { AiChatWelcome } from './ai-chat-welcome';
import { AiChatThread } from './ai-chat-thread';
import { AiChatInput } from './ai-chat-input';
import { AiVoiceStatusBar } from '../voice/ai-voice-status-bar';

export function AiChatMain({
  selectedThreadId,
  onNewChat,
  onToggleSidebar,
  threads = [],
  threadRuns = [],
  latestRun,
  isLoadingThread,
  dispatch,
  isDispatching,
  pendingInput,
  confirm,
  isConfirming,
  recorder,
  voiceSession,
}) {
  const router = useRouter();

  const { copy, voice } = useInteractionLayer({ onDispatch: dispatch });

  const handleSuggestion = useCallback((text) => dispatch(text), [dispatch]);

  const handleVoiceStart = useCallback(async () => {
    try {
      const session = await voiceSession.createSessionAsync(SESSION_TYPES.COMMAND);
      const sid = session._id || session.id;
      await recorder.startRecording(sid);
    } catch {
      // onError in the mutation handles the toast
    }
  }, [voiceSession, recorder]);

  // Retry: look up the run's original input by correlationId, re-dispatch with same id
  const handleRetry = useCallback((correlationId) => {
    const run = threadRuns.find((r) => r.correlationId === correlationId);
    const input = run?.input ?? '';
    dispatch(typeof input === 'string' ? input : JSON.stringify(input), correlationId);
  }, [threadRuns, dispatch]);

  // Auto-play TTS when AI run completes (hands-free or autoPlay on)
  const prevRunKeyRef = useRef(null);
  useEffect(() => {
    if (!latestRun) return;
    const key = `${latestRun._id}:${latestRun.status}`;
    if (key === prevRunKeyRef.current) return;
    prevRunKeyRef.current = key;

    if (latestRun.status === 'COMPLETED' && (voice.autoPlay || voice.handsFreeModeEnabled)) {
      const output = latestRun.output;
      const text =
        output?.message && typeof output.message === 'string'
          ? output.message
          : output
          ? JSON.stringify(output, null, 2)
          : '';
      if (text) voice.speak(text);
    }
  }, [latestRun, voice]);

  const copyProps = { copyState: copy.copyState, onCopy: copy.copy };
  const ttsProps = {
    speak: voice.speak,
    voiceState: voice.voiceState,
    stopSpeaking: voice.stopSpeaking,
  };

  const hasHistory = threads.length > 0;
  const showThread = !!selectedThreadId || !!pendingInput;

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden min-w-0">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0 bg-background/80 backdrop-blur-sm">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleSidebar} title="Toggle history">
          <Menu className="h-4 w-4" />
        </Button>
        {hasHistory && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={onNewChat}
          >
            <PenSquare className="h-3.5 w-3.5" />
            New Chat
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <AiVoiceStatusBar
            voiceState={voice.voiceState}
            isHandsFree={voice.handsFreeModeEnabled}
            onToggleHandsFree={voice.toggleHandsFree}
            autoPlay={voice.autoPlay}
            onToggleAutoPlay={voice.toggleAutoPlay}
            isSTTSupported={voice.isSTTSupported}
            isTTSSupported={voice.isTTSSupported}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => router.push('/dashboard')}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Dashboard
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {showThread ? (
          <div className="w-full max-w-7xl mx-auto px-4 md:px-8 py-6 flex flex-col gap-6">
            <AiChatThread
              runs={threadRuns}
              latestRunId={latestRun?._id}
              isLoading={isLoadingThread && !pendingInput && !threadRuns.length}
              pendingInput={pendingInput}
              onConfirm={confirm}
              isConfirming={isConfirming}
              onRetry={handleRetry}
              copyProps={copyProps}
              ttsProps={ttsProps}
            />
          </div>
        ) : (
          <div className="flex flex-col h-full min-h-[calc(100vh-8rem)]">
            <AiChatWelcome onSuggestionClick={handleSuggestion} />
          </div>
        )}
      </div>

      <AiChatInput
        onSubmit={dispatch}
        isDispatching={isDispatching}
        recorder={recorder}
        voiceSession={voiceSession}
        onVoiceStart={handleVoiceStart}
        voiceState={voice.voiceState}
        transcript={voice.transcript}
        onStartListening={voice.startListening}
        onStopListening={voice.stopListening}
        isSTTSupported={voice.isSTTSupported}
      />
    </div>
  );
}
