import { CheckCircle2, XCircle, AlertTriangle, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AGENT_STATUSES, WORKFLOW_LABELS } from '../../constants/ai-constants';
import { useMessageCopy } from '../../hooks/use-message-copy';

function ResultIcon({ status }) {
  if (status === AGENT_STATUSES.COMPLETED) return <CheckCircle2 className="h-10 w-10 text-green-500" />;
  if (status === AGENT_STATUSES.FAILED)    return <XCircle      className="h-10 w-10 text-destructive" />;
  return                                          <AlertTriangle className="h-10 w-10 text-amber-500" />;
}

function buildResultContent(agentRun) {
  const output = agentRun?.output;
  if (!output) return null;
  if (output.message && typeof output.message === 'string') return output.message;
  if (output.taskNumber) return `Task ${output.taskNumber} created`;
  if (output.leadNumber) return `Lead ${output.leadNumber} created`;
  if (output.invoiceNumber) return `Invoice ${output.invoiceNumber} created`;
  if (output.sent !== undefined) return `Notification sent to ${output.sent} recipient(s)`;
  return JSON.stringify(output, null, 2);
}

export function AiPanelResult({ agentRun, onStartOver }) {
  const status  = agentRun?.status ?? AGENT_STATUSES.FAILED;
  const content = buildResultContent(agentRun);
  const error   = agentRun?.error?.message;

  const { copy, copyState } = useMessageCopy();

  return (
    <div className="flex flex-col items-center gap-4 px-2 py-6 text-center">
      <ResultIcon status={status} />

      {status === AGENT_STATUSES.COMPLETED && (
        <>
          <p className="font-semibold text-green-600 dark:text-green-400">Done</p>
          {content && <p className="text-sm text-muted-foreground">{content}</p>}
          {content && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => copy(content, 'markdown', agentRun._id)}
            >
              {copyState.copied && copyState.messageId === agentRun._id ? (
                <>
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy response
                </>
              )}
            </Button>
          )}
        </>
      )}

      {status === AGENT_STATUSES.FAILED && (
        <>
          <p className="font-semibold text-destructive">Something went wrong</p>
          {error && <p className="text-xs text-muted-foreground max-w-60">{error}</p>}
        </>
      )}

      {status === AGENT_STATUSES.CANCELLED && (
        <p className="text-sm text-muted-foreground">Action cancelled</p>
      )}

      <Button variant="outline" size="sm" onClick={onStartOver} className="mt-2">
        Start over
      </Button>
    </div>
  );
}
