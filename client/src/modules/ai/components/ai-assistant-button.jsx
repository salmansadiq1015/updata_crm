'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAiStore } from '../store/ai-store';
import { AGENT_STATUSES } from '../constants/ai-constants';
import { useAiHistory } from '../hooks/use-ai-history';

export function AiAssistantButton() {
  const openPanel  = useAiStore((s) => s.openPanel);
  const isPanelOpen = useAiStore((s) => s.isPanelOpen);
  const activeRunId = useAiStore((s) => s.activeRunId);
  const { threads: runs } = useAiHistory();

  const hasActiveRun = runs.some((r) =>
    r.status === AGENT_STATUSES.PENDING ||
    r.status === AGENT_STATUSES.RUNNING ||
    r.status === AGENT_STATUSES.AWAITING_CONFIRMATION
  );

  return (
    <button
      type="button"
      onClick={openPanel}
      aria-label="Open AI Assistant"
      className={cn(
        'fixed bottom-6 right-6 z-40',
        'flex h-12 w-12 items-center justify-center rounded-full',
        'bg-primary text-primary-foreground shadow-lg',
        'transition-all hover:scale-105 active:scale-95',
        hasActiveRun && 'ring-4 ring-primary/40 animate-pulse',
        isPanelOpen && 'opacity-0 pointer-events-none'
      )}
    >
      <Sparkles className="h-5 w-5" />
    </button>
  );
}
