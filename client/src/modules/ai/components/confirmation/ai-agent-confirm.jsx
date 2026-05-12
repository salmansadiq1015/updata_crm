import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WORKFLOW_LABELS } from '../../constants/ai-constants';
import { useLanguage } from '@/lib/i18n/language-context';

function buildConfirmSummary(agentRun) {
  const steps = agentRun?.steps ?? [];
  const last = steps[steps.length - 1];
  if (last?.toolInput) {
    const input = last.toolInput;
    if (input.title) return `Create task: "${input.title}"`;
    if (input.description) return `Action: "${String(input.description).slice(0, 80)}"`;
  }
  return WORKFLOW_LABELS[agentRun?.workflowType] ?? 'Proceed with this action';
}

export function AiAgentConfirm({ agentRun, onConfirm, onCancel, isConfirming }) {
  const { t } = useLanguage();
  const summary = buildConfirmSummary(agentRun);

  return (
    <div className="flex flex-col gap-4 px-2 py-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">{t('ai.confirm.title', 'Bestaetigung erforderlich')}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('ai.confirm.desc', 'Der AI Assistent moechte die folgende Aktion ausfuehren:')}
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-muted/50 border px-3 py-2.5 text-sm">
        {summary}
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => onCancel()}
          disabled={isConfirming}
        >
          {t('common.cancel', 'Abbrechen')}
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={() => onConfirm()}
          disabled={isConfirming}
        >
          {isConfirming ? t('ai.confirm.confirming', 'Wird bestaetigt...') : t('common.confirm', 'Bestaetigen')}
        </Button>
      </div>
    </div>
  );
}
