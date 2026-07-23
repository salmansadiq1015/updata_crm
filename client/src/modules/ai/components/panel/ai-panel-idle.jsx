'use client';

import { useState } from 'react';
import { ArrowRight, HelpCircle, Loader2, MessageSquareText, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AiMicButton } from '../recorder/ai-mic-button';
import { AiHelpOverlay } from '../ai-help-overlay';
import { useLanguage } from '@/lib/i18n/language-context';
import { MIN_AGENT_INPUT_LENGTH } from '../../constants/ai-constants';

export function AiPanelIdle({ onStartRecording, onTextSubmit, isSupported, isCreating }) {
  const { t } = useLanguage();
  const [text, setText]         = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isBusy = isCreating || isSubmitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length < MIN_AGENT_INPUT_LENGTH || isBusy) return;

    try {
      setIsSubmitting(true);
      await onTextSubmit(trimmed);
      setText('');
    } catch {
      // The mutation layer shows the user-facing error. Keep text for retry.
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col gap-6 px-5 py-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-300/20">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold text-white">{t('ai.panel.prompt', 'How can I help you?')}</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {t('ai.panel.promptHint', 'Use voice or type an ERP command. I will ask before sensitive actions.')}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6">
        <AiMicButton
          isSupported={isSupported}
          onClick={onStartRecording}
          disabled={isBusy}
        />
        {!isSupported && (
          <p className="max-w-56 text-center text-xs leading-5 text-slate-400">
            {t('ai.panel.voiceUnsupported', 'Sprache wird in diesem Browser nicht unterstützt. Nutzen Sie die Texteingabe.')}
          </p>
        )}
      </div>

      <div className="mt-auto space-y-4 pb-1">
        <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
          <span className="h-px flex-1 bg-white/10" />
          {t('common.or', 'or')}
          <span className="h-px flex-1 bg-white/10" />
        </div>

        <form
          onSubmit={handleSubmit}
          data-testid="ai-panel-command-composer"
          className="rounded-2xl border border-white/10 bg-slate-950/55 p-2 shadow-inner shadow-black/20"
        >
          <div className="flex items-center gap-2">
            <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-slate-400 sm:flex">
              <MessageSquareText className="h-4 w-4" />
            </span>
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('ai.panel.commandPlaceholder', 'Type a command...')}
              className="h-11 flex-1 border-white/10 bg-white/[0.03] text-sm text-white shadow-none placeholder:text-slate-500 focus-visible:bg-white/[0.05]"
              maxLength={2000}
            />
            <Button
              type="submit"
              size="icon"
              disabled={text.trim().length < MIN_AGENT_INPUT_LENGTH || isBusy}
              className="h-11 w-11 shrink-0 bg-gradient-to-br from-violet-500 to-cyan-500 text-white shadow-[0_12px_30px_rgba(34,211,238,0.18)] hover:from-violet-400 hover:to-cyan-400"
              aria-label={t('ai.panel.sendCommand', 'Send command')}
            >
              {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
            </Button>
          </div>
        </form>

        <button
          type="button"
          onClick={() => setShowHelp(true)}
          className="mx-auto flex min-h-10 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 text-xs font-semibold text-slate-300 transition-colors hover:border-cyan-300/30 hover:text-white"
        >
          <HelpCircle className="h-4 w-4 text-cyan-300" />
          {t('ai.panel.helpTrigger', 'Was kann ich sagen?')}
        </button>
      </div>

      {showHelp && <AiHelpOverlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}
