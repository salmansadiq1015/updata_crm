import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WORKFLOW_LABELS } from '../../constants/ai-constants';
import { useLanguage } from '@/lib/i18n/language-context';

function buildConfirmSummary(agentRun, t) {
  const steps = agentRun?.steps ?? [];
  const last = steps[steps.length - 1];
  if (last?.toolInput) {
    const input = last.toolInput;
    if (input.title) return t('ai.confirm.createTaskSummary', null, { title: input.title });
    if (input.description) {
      return t('ai.confirm.actionSummary', null, { description: String(input.description).slice(0, 80) });
    }
  }
  return t(`ai.workflow.${agentRun?.workflowType}`, WORKFLOW_LABELS[agentRun?.workflowType] ?? t('ai.confirm.proceed'));
}

export function AiAgentConfirm({ agentRun, onConfirm, onCancel, isConfirming }) {
  const { t } = useLanguage();
  const summary = buildConfirmSummary(agentRun, t);

  return (
    <div className="flex min-h-full flex-col justify-center gap-4 px-5 py-8">
      <div className="rounded-2xl border border-amber-300/20 bg-amber-400/[0.07] p-5 shadow-[0_20px_80px_rgba(245,158,11,0.13)]">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-300/10 text-amber-200 ring-1 ring-amber-200/25">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">{t('ai.confirm.title', 'Confirmation required')}</p>
            <p className="mt-1 text-xs leading-5 text-amber-50/70">
              {t('ai.confirm.desc', 'Der AI Assistent moechte die folgende Aktion ausfuehren:')}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm leading-6 text-slate-200">
        {summary}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/10 hover:text-white"
          onClick={() => onCancel()}
          disabled={isConfirming}
        >
          {t('common.cancel', 'Abbrechen')}
        </Button>
        <Button
          size="sm"
          className="flex-1 bg-gradient-to-r from-violet-500 to-cyan-500 text-white shadow-[0_12px_32px_rgba(14,165,233,0.18)]"
          onClick={() => onConfirm()}
          disabled={isConfirming}
        >
          {!isConfirming && <ShieldCheck className="mr-1.5 h-4 w-4" />}
          {isConfirming ? t('ai.confirm.confirming', 'Wird bestaetigt...') : t('common.confirm', 'Bestaetigen')}
        </Button>
      </div>
    </div>
  );
}
