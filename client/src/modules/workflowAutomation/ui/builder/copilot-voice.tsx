'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Loader2, Mic, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { splitIntoChunks } from '@/modules/ai/utils/tts-chunker';
import { MAX_SECONDS, type DictationError, type DictationState, type FinishMode } from '../../hooks/use-voice-dictation';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Mic button in the composer. */
export function MicButton({ state, disabled, onStart }: { state: DictationState; disabled: boolean; onStart: () => void }) {
  const { t } = useLanguage();
  return (
    <Button type="button" size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-sky-600 dark:hover:text-sky-300" disabled={disabled || state !== 'idle'} onClick={onStart}
      aria-label={t('workflowCopilot.voice.start', 'Speak instead of typing')} title={t('workflowCopilot.voice.start', 'Speak instead of typing')}>
      {state === 'requesting' ? <Loader2 className="size-4 animate-spin" /> : <Mic className="size-4" />}
    </Button>
  );
}

/** Replaces the text box while recording / transcribing. */
export function VoiceBar({ state, levels, seconds, onCancel, onFinish }: {
  state: DictationState; levels: number[]; seconds: number; onCancel: () => void; onFinish: (mode: FinishMode) => void;
}) {
  const { t } = useLanguage();
  if (state === 'processing') {
    return (
      <div className="flex h-[88px] items-center justify-center gap-2.5 rounded-xl border border-sky-500/30 bg-sky-500/[0.05] text-sm" role="status">
        <Loader2 className="size-4 animate-spin text-sky-500" />
        <span className="wf-tl-shimmer font-medium">{t('workflowCopilot.voice.transcribing', 'Turning your words into text…')}</span>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-sky-500/40 bg-gradient-to-b from-sky-500/[0.07] to-transparent px-2.5 py-2 shadow-[0_0_0_4px_rgb(14_165_233/0.08)]" role="group" aria-label={t('workflowCopilot.voice.recording', 'Recording')}>
      <div className="flex items-center gap-2">
        <Button type="button" size="icon" variant="ghost" className="size-8 shrink-0" onClick={onCancel} aria-label={t('workflowCopilot.voice.cancel', 'Discard recording')}><X className="size-4" /></Button>
        <span className="relative flex size-2.5 shrink-0" aria-hidden><span className="wf-tl-ping absolute inset-0 rounded-full bg-rose-500/70" /><span className="relative size-2.5 rounded-full bg-rose-500" /></span>
        <div className="flex h-9 min-w-0 flex-1 items-center gap-[3px]" aria-hidden>
          {levels.map((l, i) => (
            <span key={i} className="w-[3px] flex-1 rounded-full bg-gradient-to-t from-sky-500 to-cyan-300 transition-[height] duration-75" style={{ height: `${Math.max(10, Math.round(l * 100))}%`, opacity: 0.35 + l * 0.65 }} />
          ))}
        </div>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground" aria-live="off">{clock(seconds)}<span className="opacity-50">/{clock(MAX_SECONDS)}</span></span>
        <Button type="button" size="icon" variant="outline" className="size-8 shrink-0" onClick={() => onFinish('insert')} aria-label={t('workflowCopilot.voice.insert', 'Stop and edit the text')} title={t('workflowCopilot.voice.insert', 'Stop and edit the text')}><Check className="size-4" /></Button>
        <Button type="button" size="icon" className="size-8 shrink-0 bg-gradient-to-br from-sky-500 to-cyan-500 text-white hover:from-sky-600 hover:to-cyan-600" onClick={() => onFinish('send')} aria-label={t('workflowCopilot.voice.send', 'Stop and send')} title={t('workflowCopilot.voice.send', 'Stop and send')}><ArrowUp className="size-4" /></Button>
      </div>
      <p className="mt-1.5 ps-1 text-[11px] text-muted-foreground">{t('workflowCopilot.voice.hint', 'Listening… pause for a moment to send automatically.')}</p>
    </div>
  );
}

export function voiceErrorText(error: DictationError | 'unavailable' | 'empty', t: (k: string, f?: string) => string) {
  switch (error) {
    case 'denied': return t('workflowCopilot.voice.denied', 'Microphone access is blocked. Allow it in the browser’s address bar and try again.');
    case 'no_device': return t('workflowCopilot.voice.noDevice', 'No microphone was found.');
    case 'unsupported': return t('workflowCopilot.voice.unsupported', 'This browser cannot record audio. Please type your request.');
    case 'unavailable': return t('workflowCopilot.voice.unavailable', 'Speech recognition is not available right now. Please type your request.');
    case 'empty': return t('workflowCopilot.voice.empty', 'I didn’t catch that — please try again.');
    default: return t('workflowCopilot.voice.failed', 'The recording could not be started.');
  }
}

const VOICE_LANG: Record<string, string> = { de: 'de-DE', en: 'en-US', fr: 'fr-FR', ar: 'ar-SA' };
const plain = (md: string) => md.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/^\s*[-•*]\s+/gm, '').replace(/^\s*\d+\.\s+/gm, '');

/** Reads copilot replies aloud (browser speech synthesis) — turns the copilot into a spoken conversation. */
export function useReadAloud(locale: string) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [enabled, setEnabled] = useState(() => { try { return typeof window !== 'undefined' && localStorage.getItem('updata.wf-copilot.speak') === '1'; } catch { return false; } });
  const [speaking, setSpeaking] = useState(false);
  const queue = useRef<string[]>([]);
  const stop = useCallback(() => { if (!supported) return; queue.current = []; window.speechSynthesis?.cancel(); setSpeaking(false); }, [supported]);
  const nextRef = useRef<() => void>(() => {});
  const next = useCallback(() => {
    const chunk = queue.current.shift();
    if (!chunk) { setSpeaking(false); return; }
    const u = new SpeechSynthesisUtterance(chunk);
    u.lang = VOICE_LANG[locale] || 'en-US';
    u.onend = () => nextRef.current(); u.onerror = () => nextRef.current();
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  }, [locale]);
  useEffect(() => { nextRef.current = next; }, [next]);
  const speak = useCallback((text: string) => {
    if (!supported || !enabled || !text.trim()) return;
    stop();
    queue.current = splitIntoChunks(plain(text));
    next();
  }, [supported, enabled, stop, next]);
  const toggle = useCallback(() => setEnabled((v) => {
    try { localStorage.setItem('updata.wf-copilot.speak', v ? '0' : '1'); } catch { /* storage unavailable */ }
    if (v) stop();
    return !v;
  }), [stop]);
  useEffect(() => stop, [stop]);
  return { supported, enabled, speaking, speak, stop, toggle };
}

/** Small animated equaliser shown on the speaker toggle while a reply is read aloud. */
export function SpeakingBars({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex h-3 items-end gap-[2px]', className)} aria-hidden>
      {[0, 1, 2].map((i) => <span key={i} className="wf-voice-eq w-[2px] rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />)}
    </span>
  );
}
