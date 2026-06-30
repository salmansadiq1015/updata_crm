'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  BrainCircuit,
  ClipboardList,
  ExternalLink,
  FileText,
  HelpCircle,
  MapPinned,
  Mic,
  PenSquare,
  Search,
  ShieldCheck,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { generateId } from '@/lib/utils/ids';
import { useAiChat } from '../../hooks/use-ai-chat';
import { useInteractionLayer } from '../../hooks/use-interaction-layer';
import { AiChatInput } from '../chat/ai-chat-input';
import { AiChatThread } from '../chat/ai-chat-thread';
import { AiVoiceStatusBar } from '../voice/ai-voice-status-bar';
import { AiHelpOverlay } from '../ai-help-overlay';
import { buildAiRouteContext } from '../../utils/ai-route-context';
import {
  AGENT_STATUSES,
  SESSION_TYPES,
  WORKFLOW_LABELS,
} from '../../constants/ai-constants';

const PANEL_ACTIONS = [
  {
    key: 'order',
    icon: ClipboardList,
    label: 'ai.panel.action.order',
    fallbackLabel: 'Create order',
    prompt: 'ai.panel.prompt.order',
    fallbackPrompt: 'Create an urgent order for Herr Mueller at Bahnhofstrasse 12, Zurich. Heating is defective and requested tomorrow morning.',
  },
  {
    key: 'report',
    icon: FileText,
    label: 'ai.panel.action.report',
    fallbackLabel: 'Dictate report',
    prompt: 'ai.panel.prompt.report',
    fallbackPrompt: 'Create a draft service report for the current order: boiler inspected, burner cleaned, ignition electrode replaced, system running again.',
  },
  {
    key: 'project',
    icon: ClipboardList,
    label: 'ai.panel.action.project',
    fallbackLabel: 'Create project',
    prompt: 'ai.panel.prompt.project',
    fallbackPrompt: 'Create a project for customer Mueller: heating modernization, planned start tomorrow.',
  },
  {
    key: 'quotation',
    icon: PenSquare,
    label: 'ai.panel.action.quotation',
    fallbackLabel: 'Create quote',
    prompt: 'ai.panel.prompt.quotation',
    fallbackPrompt: 'Create a draft quotation for customer Mueller: boiler service for CHF 500.',
  },
  {
    key: 'invoice',
    icon: FileText,
    label: 'ai.panel.action.invoice',
    fallbackLabel: 'Create invoice',
    prompt: 'ai.panel.prompt.invoice',
    fallbackPrompt: 'Create an invoice from the current order with a due date in 30 days.',
  },
  {
    key: 'address',
    icon: MapPinned,
    label: 'ai.panel.action.address',
    fallbackLabel: 'Capture address',
    prompt: 'ai.panel.prompt.address',
    fallbackPrompt: 'Capture this customer address: Industriestrasse 42, 8005 Zurich.',
  },
  {
    key: 'search',
    icon: Search,
    label: 'ai.panel.action.search',
    fallbackLabel: 'Search customer',
    prompt: 'ai.panel.prompt.search',
    fallbackPrompt: 'Search customer Mueller and show the best CRM matches.',
  },
  {
    key: 'documents',
    icon: Search,
    label: 'ai.panel.action.documents',
    fallbackLabel: 'Search docs',
    prompt: 'ai.panel.prompt.documents',
    fallbackPrompt: 'Search documents for service report Mueller.',
  },
  {
    key: 'reminder',
    icon: Zap,
    label: 'ai.panel.action.reminder',
    fallbackLabel: 'Reminder',
    prompt: 'ai.panel.prompt.reminder',
    fallbackPrompt: 'Remind me about this task tomorrow at 09:00.',
  },
  {
    key: 'status',
    icon: Wrench,
    label: 'ai.panel.action.status',
    fallbackLabel: 'Update status',
    prompt: 'ai.panel.prompt.status',
    fallbackPrompt: 'Set the current order status to completed after confirmation.',
  },
  {
    key: 'document',
    icon: FileText,
    label: 'ai.panel.action.document',
    fallbackLabel: 'Create document',
    prompt: 'ai.panel.prompt.document',
    fallbackPrompt: 'Generate a service report document preview for the current order from the dictated report content.',
  },
];

function newThreadId() {
  return generateId();
}

function getOutputText(run) {
  if (run?.output?.message && typeof run.output.message === 'string') return run.output.message;
  if (run?.output) return typeof run.output === 'string' ? run.output : JSON.stringify(run.output, null, 2);
  return '';
}

function getVoiceResult(session) {
  return session?.result || session?.data?.result || null;
}

function AiPanelChatWelcome({ onSuggestionClick }) {
  const { t } = useLanguage();

  return (
    <div className="flex min-h-full flex-col gap-5 px-5 py-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.22)]">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200 ring-1 ring-cyan-200/20">
            <BrainCircuit className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold text-white">{t('ai.panel.chatTitle', 'Field-service assistant')}</p>
            <p className="mt-1 text-sm leading-6 text-slate-300">
              {t('ai.panel.chatSubtitle', 'Create work, draft documents, search authorized ERP data, schedule teams, and confirm actions from one conversation.')}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {PANEL_ACTIONS.map(({ key, icon: Icon, label, fallbackLabel, prompt, fallbackPrompt }) => (
          <Button
            key={key}
            variant="outline"
            className="h-auto min-h-16 justify-start gap-2 rounded-2xl border-white/10 bg-white/[0.04] px-3 py-3 text-left text-slate-200 hover:border-cyan-300/35 hover:bg-cyan-300/10 hover:text-white"
            onClick={() => onSuggestionClick(t(prompt, fallbackPrompt))}
          >
            <Icon className="h-4 w-4 shrink-0 text-cyan-200" />
            <span className="min-w-0 text-wrap text-sm font-semibold leading-5">{t(label, fallbackLabel)}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

export function AiPanelChat({ onClose }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useLanguage();
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [currentThreadId, setCurrentThreadId] = useState(() => newThreadId());
  const [showHelp, setShowHelp] = useState(false);
  const [localRuns, setLocalRuns] = useState([]);
  const routeContext = useMemo(() => buildAiRouteContext(pathname), [pathname]);

  const handleThreadSelected = useCallback((id) => {
    setSelectedThreadId((current) => (current === id ? current : id));
    setCurrentThreadId((current) => (current === id ? current : id));
  }, []);

  const handleNewChat = useCallback(() => {
    const id = newThreadId();
    setSelectedThreadId(null);
    setCurrentThreadId(id);
    setLocalRuns([]);
  }, []);

  const chat = useAiChat({
    selectedThreadId,
    currentThreadId,
    context: routeContext,
    onThreadSelected: handleThreadSelected,
    onThreadDeleted: handleNewChat,
  });
  const dispatch = chat.dispatch;

  const { copy, voice } = useInteractionLayer({ onDispatch: dispatch });

  const activeLocalRuns = useMemo(
    () => localRuns.filter((run) => run.threadId === currentThreadId),
    [currentThreadId, localRuns],
  );
  const threadRuns = useMemo(
    () => [...activeLocalRuns, ...chat.threadRuns],
    [activeLocalRuns, chat.threadRuns],
  );
  const latestRun = chat.latestRun ?? activeLocalRuns[activeLocalRuns.length - 1] ?? null;
  const workflowLabel = latestRun?.workflowType
    ? t(`ai.workflow.${latestRun.workflowType}`, WORKFLOW_LABELS[latestRun.workflowType] || t('ai.chat.working'))
    : t('ai.panel.ready', 'Ready');
  const isRunning =
    chat.isDispatching ||
    latestRun?.status === AGENT_STATUSES.PENDING ||
    latestRun?.status === AGENT_STATUSES.RUNNING;

  const handleSuggestion = useCallback((text) => dispatch(text), [dispatch]);

  const handleVoiceStart = useCallback(async () => {
    try {
      const session = await chat.voiceSession.createSessionAsync(SESSION_TYPES.COMMAND);
      const sid = session?._id || session?.id;
      if (sid) await chat.recorder.startRecording(sid);
    } catch {
      // Mutation and recorder hooks own the visible error feedback.
    }
  }, [chat.recorder, chat.voiceSession]);

  const handleVoiceConfirmed = useCallback(({ session, transcriptText }) => {
    const result = getVoiceResult(session);
    if (result?.threadId) {
      handleThreadSelected(result.threadId);
      return;
    }

    const message = result?.message || t('ai.panel.voiceActionCompleted', 'Voice action completed.');
    setLocalRuns((runs) => [
      ...runs,
      {
        _id: `voice-${session?._id || session?.id || generateId()}`,
        threadId: currentThreadId,
        input: transcriptText || t('ai.chat.voiceRecording', 'Voice recording'),
        output: { message },
        steps: [],
        status: AGENT_STATUSES.COMPLETED,
        workflowType: result?.workflowType || 'FIELD_SERVICE_AGENT',
        createdAt: new Date().toISOString(),
      },
    ]);
  }, [currentThreadId, handleThreadSelected, t]);

  const handleRetry = useCallback((correlationId) => {
    const run = [...threadRuns, ...chat.pendingRuns].find((item) => item.correlationId === correlationId);
    const input = typeof run?.input === 'string' ? run.input : run?.input ? JSON.stringify(run.input) : '';
    dispatch(input, correlationId);
  }, [chat.pendingRuns, dispatch, threadRuns]);

  const handleOpenFullChat = useCallback(() => {
    const path = selectedThreadId ? `/ai/${selectedThreadId}` : '/ai';
    onClose?.();
    router.push(path);
  }, [onClose, router, selectedThreadId]);

  const prevRunKeyRef = useRef(null);
  useEffect(() => {
    if (!latestRun) return;
    const key = `${latestRun._id}:${latestRun.status}`;
    if (key === prevRunKeyRef.current) return;
    prevRunKeyRef.current = key;

    if (latestRun.status === AGENT_STATUSES.COMPLETED && (voice.autoPlay || voice.handsFreeModeEnabled)) {
      const text = getOutputText(latestRun);
      if (text) voice.speak(text);
    }
  }, [latestRun, voice]);

  const showThread = selectedThreadId || chat.pendingRuns.length > 0 || threadRuns.length > 0;
  const copyProps = { copyState: copy.copyState, onCopy: copy.copy };
  const ttsProps = {
    speak: voice.speak,
    voiceState: voice.voiceState,
    stopSpeaking: voice.stopSpeaking,
  };

  return (
    <div className="relative z-10 flex h-full min-h-0 flex-col">
      <SheetHeader className="flex shrink-0 flex-row items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 text-white shadow-[0_18px_46px_rgba(14,165,233,0.22)]">
            <BrainCircuit className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <SheetTitle className="truncate text-sm font-semibold text-white">MB Boiler AI</SheetTitle>
            <div className="mt-1 flex items-center gap-2 text-[11px] font-medium text-slate-400">
              <span className="inline-flex max-w-64 items-center gap-1 truncate rounded-full bg-emerald-400/10 px-2 py-0.5 text-emerald-200 ring-1 ring-emerald-300/15">
                <ShieldCheck className="h-3 w-3 shrink-0" />
                <span className="truncate">{isRunning ? workflowLabel : t('ai.panel.ready', 'Ready')}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-cyan-200/80">
                <Zap className="h-3 w-3" />
                ERP
              </span>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 rounded-xl text-slate-300 hover:bg-white/10 hover:text-white"
          onClick={onClose}
          title={t('common.close', 'Close')}
        >
          <X className="h-4 w-4" />
        </Button>
      </SheetHeader>

      <div className="flex shrink-0 items-center gap-2 border-b border-white/10 px-5 py-2.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 rounded-xl text-xs text-slate-300 hover:bg-white/10 hover:text-white"
          onClick={handleNewChat}
        >
          <PenSquare className="h-3.5 w-3.5" />
          {t('ai.chat.newChat', 'New chat')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 rounded-xl text-xs text-slate-300 hover:bg-white/10 hover:text-white"
          onClick={handleVoiceStart}
          disabled={chat.recorder?.recordingState === 'recording'}
        >
          <Mic className="h-3.5 w-3.5" />
          {t('ai.chat.startVoiceRecording', 'Start voice recording')}
        </Button>
        <div className="ml-auto flex min-w-0 items-center gap-1.5">
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
            size="icon"
            className="h-9 w-9 rounded-xl text-slate-300 hover:bg-white/10 hover:text-white"
            onClick={() => setShowHelp(true)}
            title={t('ai.panel.helpTrigger', 'What can I say?')}
          >
            <HelpCircle className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 rounded-xl text-slate-300 hover:bg-white/10 hover:text-white"
            onClick={handleOpenFullChat}
            title={t('ai.panel.openFullChat', 'Open full chat')}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {showThread ? (
          <div className="mx-auto flex w-full max-w-[34rem] flex-col gap-5 px-5 py-5">
            <AiChatThread
              runs={threadRuns}
              latestRunId={chat.latestRun?._id}
              isLoading={chat.isLoadingThread && !chat.pendingRuns.length && !threadRuns.length}
              pendingRuns={chat.pendingRuns}
              onConfirm={chat.confirm}
              isConfirming={chat.isConfirming}
              onRetry={handleRetry}
              copyProps={copyProps}
              ttsProps={ttsProps}
            />
          </div>
        ) : (
          <AiPanelChatWelcome onSuggestionClick={handleSuggestion} />
        )}
      </div>

      <AiChatInput
        onSubmit={dispatch}
        isDispatching={chat.isDispatching}
        recorder={chat.recorder}
        voiceSession={chat.voiceSession}
        onVoiceStart={handleVoiceStart}
        voiceState={voice.voiceState}
        transcript={voice.transcript}
        onStartListening={voice.startListening}
        onStopListening={voice.stopListening}
        isSTTSupported={voice.isSTTSupported}
        compact
        variant="panel"
        onVoiceConfirmed={handleVoiceConfirmed}
      />

      {showHelp && <AiHelpOverlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}
