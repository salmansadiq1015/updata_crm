'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Menu, PenSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { SESSION_TYPES } from '../../constants/ai-constants';
import { useInteractionLayer } from '../../hooks/use-interaction-layer';
import { AiChatWelcome } from './ai-chat-welcome';
import { AiChatThread } from './ai-chat-thread';
import { AiChatInput } from './ai-chat-input';
import { AiVoiceStatusBar } from '../voice/ai-voice-status-bar';
import { LiveVoiceButton } from '../../voice-live/live-voice-button';
import { showSuccess } from '@/lib/toast';

import { speakableOutput } from '../../utils/speakable-output';

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
  pendingRuns = [],
  confirm,
  isConfirming,
  recorder,
  voiceSession,
  onThreadSelected,
}) {
  const { t } = useLanguage();

  const { copy, voice } = useInteractionLayer({ onDispatch: dispatch });

  // A suggestion is a starting point, not a command: it fills the field so the
  // user says what they actually want before sending.
  const [prefill, setPrefill] = useState(null);
  const handleSuggestion = useCallback((text) => setPrefill({ text, at: Date.now() }), []);

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
    const run = [...threadRuns, ...pendingRuns].find((r) => r.correlationId === correlationId);
    const input = run?.input ?? '';
    dispatch(typeof input === 'string' ? input : JSON.stringify(input), correlationId);
  }, [threadRuns, pendingRuns, dispatch]);

  // A confirmed voice recording is run by the server as an agent run in its
  // own thread; open that thread so the answer is visible here.
  const handleVoiceConfirmed = useCallback(({ session }) => {
    const result = session?.result || session?.data?.result || null;
    if (result?.threadId && onThreadSelected) {
      onThreadSelected(result.threadId);
      return;
    }
    if (result?.message) showSuccess(result.message);
  }, [onThreadSelected]);

  // Auto-play TTS when AI run settles (hands-free or autoPlay on). Every
  // settled state speaks — a failure or a question must not leave hands-free
  // stuck waiting.
  const prevRunKeyRef = useRef(null);
  useEffect(() => {
    if (!latestRun) return;
    const key = `${latestRun._id}:${latestRun.status}`;
    if (key === prevRunKeyRef.current) return;
    prevRunKeyRef.current = key;

    if (!(voice.autoPlay || voice.handsFreeModeEnabled)) return;
    let text = '';
    if (latestRun.status === 'COMPLETED' || latestRun.status === 'AWAITING_CONFIRMATION') {
      text = speakableOutput(latestRun.output);
    } else if (latestRun.status === 'FAILED') {
      text = t('ai.voice.runFailed', 'That did not work. Please try again.');
    }
    if (text) voice.speak(text);
    else if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(latestRun.status)) voice.resumeHandsFree?.();
  }, [latestRun, voice, t]);

  const copyProps = { copyState: copy.copyState, onCopy: copy.copy };
  const ttsProps = {
    speak: voice.speak,
    voiceState: voice.voiceState,
    stopSpeaking: voice.stopSpeaking,
  };

  const hasHistory = threads.length > 0;
  const showThread = !!selectedThreadId || pendingRuns.length > 0 || threadRuns.length > 0;

  return (
    <div className="flex flex-1 flex-col h-full overflow-hidden min-w-0">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0 bg-background/80 backdrop-blur-sm">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleSidebar} title={t('ai.chat.toggleHistory')}>
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
            {t('ai.chat.newChat')}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <LiveVoiceButton variant="pill" threadId={selectedThreadId} className="h-8 py-1 text-xs" />
          <AiVoiceStatusBar
            voiceState={voice.voiceState}
            isHandsFree={voice.handsFreeModeEnabled}
            onToggleHandsFree={voice.toggleHandsFree}
            autoPlay={voice.autoPlay}
            onToggleAutoPlay={voice.toggleAutoPlay}
            isSTTSupported={voice.isSTTSupported}
            isTTSSupported={voice.isTTSSupported}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {showThread ? (
          <div className="mx-auto flex w-full max-w-[980px] flex-col gap-6 px-4 py-6 md:px-6 lg:px-8">
            <AiChatThread
              runs={threadRuns}
              latestRunId={latestRun?._id}
              isLoading={isLoadingThread && !pendingRuns.length && !threadRuns.length}
              pendingRuns={pendingRuns}
              onConfirm={confirm}
              isConfirming={isConfirming}
              onRetry={handleRetry}
              copyProps={copyProps}
              ttsProps={ttsProps}
            />
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <AiChatWelcome onSuggestionClick={handleSuggestion} liveThreadId={selectedThreadId} />
          </div>
        )}
      </div>

      <AiChatInput
        prefill={prefill}
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
        onVoiceConfirmed={handleVoiceConfirmed}
        liveThreadId={selectedThreadId}
      />
    </div>
  );
}
