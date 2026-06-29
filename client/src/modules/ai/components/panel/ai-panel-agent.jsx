import { useLanguage } from '@/lib/i18n/language-context';
import { AiProgressSteps } from '../status/ai-progress-steps';
import { AGENT_STATUSES } from '../../constants/ai-constants';
import { Loader2, Sparkles } from 'lucide-react';

export function AiPanelAgent({ agentRun, workflowLabel }) {
  const { t } = useLanguage();
  const steps = agentRun?.steps ?? [];
  const isRunning =
    agentRun?.status === AGENT_STATUSES.RUNNING ||
    agentRun?.status === AGENT_STATUSES.PENDING;

  return (
    <div className="flex min-h-full flex-col justify-center gap-5 px-5 py-8">
      <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/[0.06] p-5 shadow-[0_20px_80px_rgba(14,165,233,0.12)]">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200 ring-1 ring-cyan-200/20">
            {isRunning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{workflowLabel}...</p>
            <p className="mt-1 text-xs text-slate-400">{t('ai.panel.agentWait')}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <AiProgressSteps
          steps={steps}
          workflowLabel={workflowLabel}
          isRunning={isRunning}
        />
      </div>
    </div>
  );
}
