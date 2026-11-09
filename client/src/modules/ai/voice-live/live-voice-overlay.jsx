'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight, Check, ChevronDown, Keyboard, Loader2, Maximize2, Mic, MicOff, Minimize2,
  PhoneOff, RotateCcw, ScrollText, SendHorizontal, Square, X, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { VoiceOrb } from './voice-orb';
import { AiRecordLink } from '../components/chat/ai-record-link';
import { AiRecordCards } from '../components/chat/ai-record-cards';

export const VOICE_OPTIONS = [
  { id: 'marin', label: 'Marin', tone: 'live.voice.tone.warm' },
  { id: 'cedar', label: 'Cedar', tone: 'live.voice.tone.calm' },
  { id: 'coral', label: 'Coral', tone: 'live.voice.tone.bright' },
  { id: 'sage', label: 'Sage', tone: 'live.voice.tone.clear' },
  { id: 'ash', label: 'Ash', tone: 'live.voice.tone.deep' },
  { id: 'ballad', label: 'Ballad', tone: 'live.voice.tone.soft' },
  { id: 'verse', label: 'Verse', tone: 'live.voice.tone.expressive' },
  { id: 'alloy', label: 'Alloy', tone: 'live.voice.tone.neutral' },
  { id: 'echo', label: 'Echo', tone: 'live.voice.tone.steady' },
  { id: 'shimmer', label: 'Shimmer', tone: 'live.voice.tone.light' },
];

const TOOL_LABELS = {
  crm_request: ['live.tool.crm_request', 'Working on it'],
  confirm_pending_action: ['live.tool.confirm', 'Confirming'],
  get_my_day: ['live.tool.get_my_day', 'Preparing your day'],
  search_leads: ['live.tool.search_leads', 'Searching leads'],
  create_lead: ['live.tool.create_lead', 'Creating lead'],
  update_lead_status: ['live.tool.update_lead_status', 'Updating lead'],
  list_follow_ups: ['live.tool.list_follow_ups', 'Checking follow-ups'],
  create_follow_up: ['live.tool.create_follow_up', 'Scheduling follow-up'],
  complete_follow_up: ['live.tool.complete_follow_up', 'Completing follow-up'],
  list_calendar: ['live.tool.list_calendar', 'Checking calendar'],
  create_meeting: ['live.tool.create_meeting', 'Creating meeting'],
  list_notifications: ['live.tool.list_notifications', 'Reading notifications'],
  mark_notifications_read: ['live.tool.mark_notifications_read', 'Marking notifications read'],
  find_employee: ['live.tool.find_employee', 'Finding colleague'],
  list_inbox: ['live.tool.list_inbox', 'Checking inbox'],
  open_page: ['live.tool.open_page', 'Opening page'],
  end_conversation: ['live.tool.end_conversation', 'Ending'],
};

const ERROR_MESSAGES = {
  mic_denied: ['live.error.micDenied', 'Microphone access was blocked. Allow the microphone for this site in your browser and try again.'],
  no_mic: ['live.error.noMic', 'No microphone was found. Connect one and try again.'],
  mic_busy: ['live.error.micBusy', 'The microphone is in use by another application.'],
  unavailable: ['live.error.unavailable', 'Live voice is not configured on this server.'],
  forbidden: ['live.error.forbidden', 'You do not have access to the AI assistant.'],
  unsupported: ['live.error.unsupported', 'This browser does not support live voice. Use a current Chrome, Edge, Safari or Firefox.'],
  connection_lost: ['live.error.connectionLost', 'The connection was lost.'],
  session_expired: ['live.error.expired', 'The voice session expired.'],
  connect_failed: ['live.error.connectFailed', 'Could not connect to the voice service. Check your connection and try again.'],
};

function activityLabel(t, { status, activity, muted, runningTool }) {
  if (status === 'connecting') return t('live.state.connecting', 'Connecting…');
  if (status === 'error') return t('live.state.error', 'Something went wrong');
  if (status !== 'live') return t('live.state.ready', 'Ready');
  if (activity === 'working' && runningTool) {
    const [key, fallback] = TOOL_LABELS[runningTool] || ['live.tool.default', 'Working on it'];
    return `${t(key, fallback)}…`;
  }
  if (activity === 'speaking') return t('live.state.speaking', 'Speaking');
  if (activity === 'thinking') return t('live.state.thinking', 'Thinking…');
  if (activity === 'user_speaking') return t('live.state.hearing', 'Listening…');
  if (muted) return t('live.state.muted', 'Microphone off');
  return t('live.state.listening', 'Listening');
}

export function orbStateOf({ status, activity, muted }) {
  if (status === 'connecting') return 'connecting';
  if (status === 'error') return 'error';
  if (status !== 'live') return 'idle';
  if (muted && activity !== 'speaking' && activity !== 'working' && activity !== 'thinking') return 'muted';
  return activity;
}

function ActionCard({ action, t }) {
  const [key, fallback] = TOOL_LABELS[action.name] || ['live.tool.default', action.name];
  const display = action.display;
  const running = action.status === 'running';
  const failed = action.status === 'failed';
  const waiting = action.status === 'awaiting_confirmation' || action.status === 'needs_follow_up';
  const message = action.result?.message || (display?.kind === 'agent_run' ? display.output?.message : null);
  const caption = action.name === 'crm_request' ? action.args?.request : (display?.title || null);

  return (
    <div
      data-testid="live-voice-action"
      data-status={action.status}
      className="w-72 shrink-0 snap-start rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 text-left backdrop-blur-xl"
    >
      <div className="flex items-center gap-2">
        <span className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full',
          running && 'bg-sky-400/15 text-sky-300',
          failed && 'bg-red-500/15 text-red-300',
          waiting && 'bg-amber-400/15 text-amber-300',
          !running && !failed && !waiting && 'bg-emerald-400/15 text-emerald-300',
        )}
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : failed ? <X className="h-3.5 w-3.5" /> : waiting ? <AlertTriangle className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
        </span>
        <p className="truncate text-xs font-semibold uppercase tracking-wide text-slate-300">{t(key, fallback)}</p>
      </div>
      {caption ? <p className="mt-2 line-clamp-2 text-sm text-slate-100">{caption}</p> : null}
      {!running && message ? <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-xs leading-5 text-slate-400">{message}</p> : null}
      {display?.kind === 'agent_run' && display.output ? (
        <div className="[&_a]:max-w-full">
          <AiRecordLink output={display.output} />
          <AiRecordCards output={display.output} />
        </div>
      ) : null}
      {display?.kind === 'record' && display.href ? (
        <Link href={display.href} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-sky-200 hover:border-sky-300/40 hover:bg-sky-400/10">
          {t('live.action.open', 'Open')} <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}

function ControlButton({ label, onClick, active, danger, children, testId, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active === undefined ? undefined : active}
      data-testid={testId}
      className={cn(
        'flex h-14 w-14 items-center justify-center rounded-full border transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70 disabled:opacity-40',
        danger
          ? 'border-red-400/30 bg-red-500 text-white shadow-lg shadow-red-500/30 hover:bg-red-400'
          : active
            ? 'border-white/80 bg-white text-slate-900 hover:bg-slate-100'
            : 'border-white/10 bg-white/[0.08] text-slate-100 hover:bg-white/[0.14]',
      )}
    >
      {children}
    </button>
  );
}

export function LiveVoiceOverlay({
  live, minimized, onMinimize, onExpand, onClose, onRetry, voice, onVoiceChange,
}) {
  const { t } = useLanguage();
  const { status, activity, muted, transcript, actions, error } = live;
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [showTranscript, setShowTranscript] = useState(false);
  const [voiceMenu, setVoiceMenu] = useState(false);
  const inputRef = useRef(null);
  const transcriptEndRef = useRef(null);
  const actionsEndRef = useRef(null);

  const runningTool = useMemo(() => [...actions].reverse().find((a) => a.status === 'running')?.name, [actions]);
  const orbState = orbStateOf({ status, activity, muted });
  const label = activityLabel(t, { status, activity, muted, runningTool });

  const lastUser = useMemo(() => [...transcript].reverse().find((i) => i.role === 'user' && i.text), [transcript]);
  const lastAssistant = useMemo(() => [...transcript].reverse().find((i) => i.role === 'assistant' && i.text), [transcript]);
  // Show the assistant caption only if it is newer than the person's last words.
  const assistantIsLatest = lastAssistant && (!lastUser || transcript.indexOf(lastAssistant) > transcript.indexOf(lastUser));

  useEffect(() => { if (typing) inputRef.current?.focus(); }, [typing]);
  useEffect(() => { transcriptEndRef.current?.scrollIntoView?.({ block: 'end' }); }, [transcript, showTranscript]);
  useEffect(() => { actionsEndRef.current?.scrollIntoView?.({ inline: 'end', block: 'nearest', behavior: 'smooth' }); }, [actions.length]);

  // Keyboard: Esc ends (or closes the transcript), Space toggles the microphone.
  useEffect(() => {
    if (minimized) return undefined;
    const onKey = (e) => {
      const editing = ['INPUT', 'TEXTAREA'].includes(e.target?.tagName) || e.target?.isContentEditable;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showTranscript) setShowTranscript(false);
        else if (typing) setTyping(false);
        else onClose();
      } else if (e.key === ' ' && !editing && status === 'live') {
        e.preventDefault();
        live.toggleMute();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [minimized, onClose, showTranscript, typing, status, live]);

  const submitDraft = (e) => {
    e?.preventDefault();
    if (!draft.trim()) return;
    live.sendText(draft);
    setDraft('');
  };

  const currentVoice = VOICE_OPTIONS.find((v) => v.id === voice) || VOICE_OPTIONS[0];

  // ── Minimized: a floating pill that keeps the conversation going ─────────
  if (minimized) {
    return (
      <div
        data-testid="live-voice-mini"
        className="dark fixed bottom-5 right-5 z-[70] flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/90 py-1.5 pl-1.5 pr-2 text-slate-100 shadow-2xl shadow-sky-950/50 backdrop-blur-xl rtl:left-5 rtl:right-auto"
        role="region"
        aria-label={t('live.title', 'Updata Live')}
      >
        <button type="button" onClick={onExpand} className="rounded-full" aria-label={t('live.expand', 'Expand')}>
          <VoiceOrb state={orbState} getLevels={live.getLevels} size={52} label={label} />
        </button>
        <div className="min-w-0 max-w-[11rem] pr-1">
          <p className="text-xs font-semibold text-white">{t('live.title', 'Updata Live')}</p>
          <p className="truncate text-xs text-slate-400" aria-live="polite">{label}</p>
        </div>
        <button type="button" onClick={live.toggleMute} aria-label={muted ? t('live.unmute', 'Turn microphone on') : t('live.mute', 'Turn microphone off')} className={cn('flex h-9 w-9 items-center justify-center rounded-full', muted ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/15')}>
          {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
        <button type="button" onClick={onExpand} aria-label={t('live.expand', 'Expand')} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/15">
          <Maximize2 className="h-4 w-4" />
        </button>
        <button type="button" onClick={onClose} aria-label={t('live.end', 'End conversation')} data-testid="live-voice-end-mini" className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-400">
          <PhoneOff className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // ── Full screen ──────────────────────────────────────────────────────────
  return (
    <div
      data-testid="live-voice-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('live.title', 'Updata Live')}
      className="dark fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#020814] text-slate-100"
    >
      {/* Atmosphere: slow drifting light behind the orb. Brand blues only. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[38%] h-[70vmin] w-[70vmin] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-500/20 blur-[120px]" />
        <div className="absolute -left-[10%] bottom-[-20%] h-[60vmin] w-[60vmin] rounded-full bg-cyan-400/10 blur-[140px] motion-safe:animate-[pulse_9s_ease-in-out_infinite]" />
        <div className="absolute -right-[10%] top-[-15%] h-[55vmin] w-[55vmin] rounded-full bg-blue-600/15 blur-[140px] motion-safe:animate-[pulse_12s_ease-in-out_infinite]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(2,8,20,0.85)_100%)]" />
      </div>

      {/* Top bar */}
      <header className="relative z-10 flex items-center gap-3 px-4 pt-4 sm:px-6">
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 backdrop-blur-xl">
          <span className={cn('h-2 w-2 rounded-full', status === 'live' ? 'bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.6)]' : status === 'error' ? 'bg-amber-400' : 'bg-sky-300 animate-pulse')} />
          <span className="text-sm font-semibold tracking-tight">{t('live.title', 'Updata Live')}</span>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setVoiceMenu((v) => !v)}
            disabled={status === 'live' || status === 'connecting'}
            title={status === 'live' ? t('live.voice.lockedHint', 'End the conversation to change the voice') : undefined}
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-sm text-slate-300 backdrop-blur-xl hover:bg-white/[0.1] disabled:cursor-default disabled:hover:bg-white/[0.05]"
            data-testid="live-voice-voice-picker"
            aria-haspopup="listbox"
            aria-expanded={voiceMenu}
          >
            {t('live.voice.label', 'Voice')}: <span className="font-medium text-white">{currentVoice.label}</span>
            {status !== 'live' && status !== 'connecting' ? <ChevronDown className="h-3.5 w-3.5" /> : null}
          </button>
          {voiceMenu ? (
            <ul role="listbox" className="absolute left-0 top-11 z-20 w-56 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/95 p-1 shadow-2xl backdrop-blur-xl">
              {VOICE_OPTIONS.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.id === voice}
                    onClick={() => { onVoiceChange(option.id); setVoiceMenu(false); }}
                    className={cn('flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm hover:bg-white/10', option.id === voice && 'bg-sky-400/10 text-sky-200')}
                  >
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs text-slate-400">{t(option.tone)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-1.5 rtl:ml-0 rtl:mr-auto">
          <button type="button" onClick={() => setShowTranscript((v) => !v)} aria-pressed={showTranscript} className={cn('flex h-10 w-10 items-center justify-center rounded-full border border-white/10 backdrop-blur-xl', showTranscript ? 'bg-white text-slate-900' : 'bg-white/[0.05] hover:bg-white/[0.1]')} aria-label={t('live.transcript', 'Transcript')} title={t('live.transcript', 'Transcript')} data-testid="live-voice-transcript-toggle">
            <ScrollText className="h-4 w-4" />
          </button>
          <button type="button" onClick={onMinimize} disabled={status !== 'live'} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] backdrop-blur-xl hover:bg-white/[0.1] disabled:opacity-40" aria-label={t('live.minimize', 'Minimize — keep talking while you use the app')} title={t('live.minimize', 'Minimize — keep talking while you use the app')} data-testid="live-voice-minimize">
            <Minimize2 className="h-4 w-4" />
          </button>
          <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] backdrop-blur-xl hover:bg-white/[0.1]" aria-label={t('live.close', 'Close')} title={t('live.close', 'Close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Stage */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-4">
        <VoiceOrb
          state={orbState}
          getLevels={live.getLevels}
          size={typeof window !== 'undefined' && window.innerWidth < 640 ? 230 : 320}
          label={label}
          className="drop-shadow-[0_0_60px_rgba(14,165,233,0.25)]"
        />
        <p className="mt-4 text-sm font-medium tracking-wide text-sky-200/90" aria-live="polite" data-testid="live-voice-status">{label}</p>

        {/* Captions */}
        <div className="mt-6 flex min-h-[7.5rem] w-full max-w-2xl flex-col items-center gap-2 text-center" aria-live="polite" data-testid="live-voice-captions">
          {status === 'error' ? (
            <div className="flex flex-col items-center gap-4">
              <p className="max-w-md text-base leading-7 text-slate-200">{t(...(ERROR_MESSAGES[error] || ERROR_MESSAGES.connect_failed))}</p>
              {!['unavailable', 'forbidden', 'unsupported'].includes(error) ? (
                <button type="button" onClick={onRetry} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100" data-testid="live-voice-retry">
                  <RotateCcw className="h-4 w-4" /> {t('live.retry', 'Try again')}
                </button>
              ) : null}
            </div>
          ) : (
            <>
              {lastUser ? (
                <p className={cn('line-clamp-2 max-w-xl text-sm leading-6 text-slate-400 transition-opacity', assistantIsLatest && 'opacity-60')}>
                  {lastUser.text}
                </p>
              ) : null}
              {assistantIsLatest ? (
                <p className="line-clamp-4 text-lg font-medium leading-8 text-white sm:text-xl">{lastAssistant.text}</p>
              ) : status === 'live' && !lastUser ? (
                <p className="text-base text-slate-400">{t('live.hint', 'Just start talking — ask about your day, create a task, find a lead…')}</p>
              ) : null}
            </>
          )}
        </div>
      </main>

      {/* What was done in this conversation */}
      {actions.length ? (
        <section className="relative z-10 mx-auto w-full max-w-5xl px-4" aria-label={t('live.actions', 'Actions in this conversation')}>
          <div className="flex snap-x gap-3 overflow-x-auto pb-3 scrollbar-thin">
            {actions.filter((a) => a.name !== 'end_conversation').map((action) => <ActionCard key={action.id} action={action} t={t} />)}
            <span ref={actionsEndRef} />
          </div>
        </section>
      ) : null}

      {/* Controls */}
      <footer className="relative z-10 flex flex-col items-center gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-2">
        {typing ? (
          <form onSubmit={submitDraft} className="flex w-full max-w-xl items-center gap-2 rounded-full border border-white/10 bg-white/[0.07] py-1.5 pl-5 pr-1.5 backdrop-blur-xl">
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t('live.typePlaceholder', 'Type a message…')}
              className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
              data-testid="live-voice-text-input"
              disabled={status !== 'live'}
            />
            <button type="submit" disabled={!draft.trim() || status !== 'live'} className="flex h-9 w-9 items-center justify-center rounded-full bg-sky-400 text-slate-950 disabled:opacity-40" aria-label={t('live.send', 'Send')}>
              <SendHorizontal className="h-4 w-4" />
            </button>
          </form>
        ) : null}
        <div className="flex items-center gap-4">
          <ControlButton
            label={muted ? t('live.unmute', 'Turn microphone on') : t('live.mute', 'Turn microphone off')}
            onClick={live.toggleMute}
            active={muted}
            testId="live-voice-mute"
            disabled={status !== 'live'}
          >
            {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </ControlButton>
          <ControlButton label={t('live.type', 'Type instead')} onClick={() => setTyping((v) => !v)} active={typing} testId="live-voice-type" disabled={status !== 'live'}>
            <Keyboard className="h-5 w-5" />
          </ControlButton>
          <ControlButton label={t('live.interrupt', 'Stop speaking')} onClick={live.interrupt} testId="live-voice-interrupt" disabled={activity !== 'speaking' || status !== 'live'}>
            <Square className="h-4 w-4 fill-current" />
          </ControlButton>
          <ControlButton label={t('live.end', 'End conversation')} onClick={onClose} danger testId="live-voice-end">
            <PhoneOff className="h-5 w-5" />
          </ControlButton>
        </div>
        <p className="text-xs text-slate-500">{t('live.footer', 'Updata can make mistakes. Changes are confirmed before they are made.')}</p>
      </footer>

      {/* Full transcript drawer */}
      {showTranscript ? (
        <aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-md flex-col border-l border-white/10 bg-slate-950/95 backdrop-blur-2xl rtl:left-0 rtl:right-auto rtl:border-l-0 rtl:border-r" data-testid="live-voice-transcript">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-sm font-semibold">{t('live.transcript', 'Transcript')}</h2>
            <button type="button" onClick={() => setShowTranscript(false)} className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10" aria-label={t('live.close', 'Close')}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-5 pb-6 scrollbar-thin">
            {transcript.filter((i) => i.text).length === 0 ? (
              <p className="text-sm text-slate-500">{t('live.transcriptEmpty', 'Nothing said yet.')}</p>
            ) : transcript.filter((i) => i.text).map((item) => (
              <div key={item.id} className={cn('flex', item.role === 'user' ? 'justify-end' : 'justify-start')}>
                <p className={cn(
                  'max-w-[85%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm leading-6',
                  item.role === 'user' ? 'bg-sky-500/20 text-sky-50' : 'bg-white/[0.07] text-slate-100',
                )}
                >
                  {item.text}
                </p>
              </div>
            ))}
            <span ref={transcriptEndRef} />
          </div>
        </aside>
      ) : null}
    </div>
  );
}
