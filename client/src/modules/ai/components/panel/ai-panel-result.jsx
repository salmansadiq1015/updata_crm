import { CheckCircle2, XCircle, AlertTriangle, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AGENT_STATUSES, WORKFLOW_LABELS } from '../../constants/ai-constants';
import { useMessageCopy } from '../../hooks/use-message-copy';
import { useLanguage } from '@/lib/i18n/language-context';

function ResultIcon({ status }) {
  if (status === AGENT_STATUSES.COMPLETED) return <CheckCircle2 className="h-8 w-8 text-emerald-200" />;
  if (status === AGENT_STATUSES.FAILED)    return <XCircle      className="h-8 w-8 text-rose-200" />;
  return                                          <AlertTriangle className="h-8 w-8 text-amber-200" />;
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
  const { t } = useLanguage();
  const status  = agentRun?.status ?? AGENT_STATUSES.FAILED;
  const content = buildResultContent(agentRun);
  const error   = agentRun?.error?.message;

  const { copy, copyState } = useMessageCopy();
  const isSuccess = status === AGENT_STATUSES.COMPLETED;

  return (
    <div className="flex min-h-full flex-col justify-center gap-4 px-5 py-8 text-center">
      <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-3xl border shadow-[0_22px_70px_rgba(0,0,0,0.24)] ${
        isSuccess
          ? 'border-emerald-300/20 bg-emerald-400/10'
          : status === AGENT_STATUSES.FAILED
            ? 'border-rose-300/20 bg-rose-400/10'
            : 'border-amber-300/20 bg-amber-400/10'
      }`}>
        <ResultIcon status={status} />
      </div>

      {status === AGENT_STATUSES.COMPLETED && (
        <>
          <p className="font-semibold text-emerald-100">{t('ai.result.done', 'Done')}</p>
          {content && (
            <p className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm leading-6 text-slate-300">
              {content}
            </p>
          )}
          {content && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/10 hover:text-white"
              onClick={() => copy(content, 'markdown', agentRun?._id)}
            >
              {copyState.copied && copyState.messageId === agentRun?._id ? (
                <>
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  {t('common.copiedShort', 'Kopiert')}
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  {t('ai.result.copyResponse', 'Antwort kopieren')}
                </>
              )}
            </Button>
          )}
        </>
      )}

      {status === AGENT_STATUSES.FAILED && (
        <>
          <p className="font-semibold text-rose-100">{t('ai.result.failed', 'Something went wrong')}</p>
          {error && <p className="mx-auto max-w-72 text-xs leading-5 text-slate-400">{error}</p>}
        </>
      )}

      {status === AGENT_STATUSES.CANCELLED && (
        <p className="text-sm text-slate-400">{t('ai.result.cancelled', 'Action cancelled')}</p>
      )}

      <Button variant="outline" size="sm" onClick={onStartOver} className="mt-2 border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/10 hover:text-white">
        {t('ai.result.startOver', 'Neu starten')}
      </Button>
    </div>
  );
}
