'use client';

import { Bot, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAiStore } from '../store/ai-store';
import { AGENT_STATUSES } from '../constants/ai-constants';
import { useAiHistory } from '../hooks/use-ai-history';
import { useLanguage } from '@/lib/i18n/language-context';

export function AiAssistantButton({ className, variant = 'floating' }) {
  const { t } = useLanguage();
  const openPanel  = useAiStore((s) => s.openPanel);
  const closePanel = useAiStore((s) => s.closePanel);
  const isPanelOpen = useAiStore((s) => s.isPanelOpen);
  const activeRunId = useAiStore((s) => s.activeRunId);
  const { threads: runs } = useAiHistory();

  const hasActiveRun = runs.some((r) =>
    r.status === AGENT_STATUSES.PENDING ||
    r.status === AGENT_STATUSES.RUNNING ||
    r.status === AGENT_STATUSES.AWAITING_CONFIRMATION
  );

  const label = isPanelOpen
    ? t('common.close', 'Close')
    : t('ai.panel.open', 'Open AI Assistant');

  if (variant === 'header') {
    return (
      <button
        type="button"
        onClick={() => (isPanelOpen ? closePanel() : openPanel())}
        aria-label={label}
        title={label}
        className={cn(
          'relative flex h-14 w-14 shrink-0 items-center justify-center',
          'bg-gradient-to-br from-violet-500 via-purple-500 to-cyan-500 text-white',
          'transition-all duration-200 hover:brightness-110 active:brightness-95',
          hasActiveRun && 'animate-pulse',
          className
        )}
      >
        {/* Bot does a headstand when the panel is open */}
        <Bot
          className={cn(
            'h-5 w-5 transition-transform duration-300 ease-out',
            isPanelOpen && 'rotate-180'
          )}
        />
        <Sparkles
          className={cn(
            'absolute right-2.5 top-2.5 h-3.5 w-3.5 rounded-full bg-slate-950/60 p-0.5 text-cyan-200',
            'transition-all duration-300',
            isPanelOpen ? 'scale-0 opacity-0' : 'scale-100 opacity-100'
          )}
        />
        {hasActiveRun && (
          <span className="absolute bottom-2 right-2 h-1.5 w-1.5 rounded-full bg-cyan-200" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openPanel}
      aria-label={t('ai.panel.open', 'Open AI Assistant')}
      className={cn(
        'fixed bottom-6 right-6 z-40',
        'flex h-14 w-14 items-center justify-center rounded-2xl',
        'border border-white/15 bg-gradient-to-br from-violet-500 via-purple-500 to-cyan-500 text-white',
        'shadow-[0_20px_60px_rgba(14,165,233,0.22),0_0_0_6px_rgba(139,92,246,0.12)]',
        'transition-all duration-200 hover:scale-105 hover:shadow-[0_24px_70px_rgba(14,165,233,0.28),0_0_0_8px_rgba(139,92,246,0.15)] active:scale-95',
        hasActiveRun && 'animate-pulse ring-4 ring-cyan-300/25',
        isPanelOpen && 'opacity-0 pointer-events-none',
        className
      )}
    >
      <Bot className="h-6 w-6" />
      <Sparkles className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-slate-950 p-0.5 text-cyan-200" />
    </button>
  );
}
