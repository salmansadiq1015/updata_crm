import { useLanguage } from '@/lib/i18n/language-context';
import { AiProgressSteps } from '../status/ai-progress-steps';
import { AGENT_STATUSES } from '../../constants/ai-constants';

export function AiPanelAgent({ agentRun, workflowLabel }) {
  const { t } = useLanguage();
  const steps = agentRun?.steps ?? [];
  const isRunning =
    agentRun?.status === AGENT_STATUSES.RUNNING ||
    agentRun?.status === AGENT_STATUSES.PENDING;

  return (
    <div className="flex flex-col gap-4 px-2 py-4">
      <p className="text-sm font-medium">{workflowLabel}...</p>

      <AiProgressSteps
        steps={steps}
        workflowLabel={workflowLabel}
        isRunning={isRunning}
      />

      <p className="text-xs text-muted-foreground text-center mt-2">
        {t('ai.panel.agentWait')}
      </p>
    </div>
  );
}
