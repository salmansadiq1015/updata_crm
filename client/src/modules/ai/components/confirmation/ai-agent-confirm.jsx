import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WORKFLOW_LABELS } from '../../constants/ai-constants';

function buildConfirmSummary(agentRun) {
  const steps = agentRun?.steps ?? [];
  const last  = steps[steps.length - 1];
  if (last?.toolInput) {
    const input = last.toolInput;
    if (input.title)       return `Create task: "${input.title}"`;
    if (input.description) return `Action: "${String(input.description).slice(0, 80)}"`;
  }
  return WORKFLOW_LABELS[agentRun?.workflowType] ?? 'Proceed with this action';
}

export function AiAgentConfirm({ agentRun, onConfirm, onCancel, isConfirming }) {
  const summary = buildConfirmSummary(agentRun);

  return (
    <div className="flex flex-col gap-4 px-2 py-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium">Action Required</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            The AI wants to perform the following action:
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
          ✗ Cancel
        </Button>
        <Button
          size="sm"
          className="flex-1"
          onClick={() => onConfirm()}
          disabled={isConfirming}
        >
          {isConfirming ? 'Confirming…' : '✓ Confirm'}
        </Button>
      </div>
    </div>
  );
}
