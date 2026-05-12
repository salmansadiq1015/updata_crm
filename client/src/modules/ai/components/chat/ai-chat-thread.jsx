'use client';

import { useRef, useEffect } from 'react';
import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { AiChatMessage } from './ai-chat-message';
import { AiChatTypingIndicator } from './ai-chat-typing-indicator';
import { AiChatConfirmation } from './ai-chat-confirmation';
import { AiProgressSteps } from '../status/ai-progress-steps';
import { AiRunSteps } from '../history/ai-run-steps';
import { AGENT_STATUSES, WORKFLOW_LABELS } from '../../constants/ai-constants';
import { useMessageRetry } from '../../hooks/use-message-retry';

const MD_COMPONENTS = {
  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
  h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-bold mb-1.5 mt-3 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h3>,
  ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:opacity-80">
      {children}
    </a>
  ),
  code: ({ className, children, ...rest }) => {
    const isBlock = /language-(\w+)/.exec(className || '');
    return isBlock ? (
      <code className="block bg-muted p-3 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre" {...rest}>
        {children}
      </code>
    ) : (
      <code className="bg-muted px-1 py-0.5 rounded text-xs font-mono" {...rest}>{children}</code>
    );
  },
  pre: ({ children }) => <pre className="mb-2 last:mb-0 rounded-lg overflow-hidden">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary/40 pl-3 italic text-muted-foreground mb-2">{children}</blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-2">
      <table className="text-xs border-collapse w-full">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-border px-2 py-1 font-semibold bg-muted text-left">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
  hr: () => <hr className="my-2 border-border" />,
};

function MarkdownMessage({ content }) {
  return (
    <div className="text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

function getRunOutputText(run) {
  if (run.output?.message && typeof run.output.message === 'string') return run.output.message;
  if (run.output) return JSON.stringify(run.output, null, 2);
  return '';
}

function AgentContent({ run, onConfirm, isConfirming }) {
  const { t } = useLanguage();
  const { status, steps = [], output, error, workflowType } = run;
  const isRunning = status === AGENT_STATUSES.RUNNING || status === AGENT_STATUSES.PENDING;

  if (isRunning) {
    return (
      <div className="flex flex-col gap-3">
        <AiChatTypingIndicator />
        {steps.length > 0 && (
          <AiProgressSteps
            steps={steps}
            workflowLabel={WORKFLOW_LABELS[workflowType] ?? t('ai.chat.working', 'Working on it')}
            isRunning
          />
        )}
      </div>
    );
  }

  if (status === AGENT_STATUSES.AWAITING_CONFIRMATION) {
    return (
      <AiChatConfirmation
        run={run}
        onConfirm={() => onConfirm(true)}
        onCancel={() => onConfirm(false)}
        isConfirming={isConfirming}
      />
    );
  }

  if (status === AGENT_STATUSES.COMPLETED) {
    if (output?.message && typeof output.message === 'string') {
      return <MarkdownMessage content={output.message} />;
    }
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          <p className="text-sm font-medium text-green-700 dark:text-green-400">{t('ai.result.done', 'Done')}</p>
        </div>
        {output && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3 overflow-auto max-h-40 border">
            <pre className="whitespace-pre-wrap wrap-break-word">
              {typeof output === 'string' ? output : JSON.stringify(output, null, 2)}
            </pre>
          </div>
        )}
        {steps.length > 0 && (
          <details className="text-xs">
            <summary className="text-muted-foreground cursor-pointer hover:text-foreground transition-colors py-1 select-none">
              {t('ai.chat.viewSteps', 'View steps')} ({steps.length})
            </summary>
            <div className="mt-2 pl-1">
              <AiRunSteps steps={steps} />
            </div>
          </details>
        )}
      </div>
    );
  }

  if (status === AGENT_STATUSES.FAILED) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm font-medium text-destructive">{t('ai.result.failed', 'Something went wrong')}</p>
        </div>
        {error?.message && (
          <p className="text-xs text-muted-foreground">{error.message}</p>
        )}
        {error?.code && (
          <p className="text-xs text-muted-foreground/60">{t('common.code', 'Code')}: {error.code}</p>
        )}
      </div>
    );
  }

  if (status === AGENT_STATUSES.CANCELLED) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <MinusCircle className="h-4 w-4 shrink-0" />
        <p className="text-sm">{t('ai.result.cancelled', 'Action cancelled')}</p>
      </div>
    );
  }

  return null;
}

function RunPair({ run, onConfirm, isConfirming, onRetry, copyProps, ttsProps }) {
  const { t } = useLanguage();
  const timestamp = run.createdAt
    ? formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })
    : '';

  const inputText =
    typeof run.input === 'string'
      ? run.input
      : run.input
      ? JSON.stringify(run.input)
      : t('ai.chat.voiceRecording', 'Voice recording');

  const { retryState, scheduleRetry } = useMessageRetry({
    runId: run._id,
    correlationId: run.correlationId,
    onRetry,
    maxAttempts: 3,
  });

  // Use a ref so the effect dep array stays stable while always calling latest scheduleRetry
  const scheduleRetryRef = useRef(scheduleRetry);
  useEffect(() => { scheduleRetryRef.current = scheduleRetry; }, [scheduleRetry]);

  // Auto-trigger retry when run transitions to FAILED (transient errors only)
  useEffect(() => {
    if (run.status === AGENT_STATUSES.FAILED && run.error) {
      scheduleRetryRef.current(run.error, run.correlationId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run._id, run.status]);

  const isRunning = run.status === AGENT_STATUSES.RUNNING || run.status === AGENT_STATUSES.PENDING;
  const outputText = getRunOutputText(run);

  return (
    <div className="flex flex-col gap-6">
      <AiChatMessage variant="user" timestamp={timestamp}>
        {inputText}
      </AiChatMessage>
      <AiChatMessage
        variant="assistant"
        messageId={run._id}
        content={outputText}
        isStreaming={isRunning}
        retryState={retryState}
        copyState={copyProps?.copyState}
        onCopy={copyProps?.onCopy}
        ttsProps={ttsProps}
      >
        <AgentContent run={run} onConfirm={onConfirm} isConfirming={isConfirming} />
      </AiChatMessage>
    </div>
  );
}

/**
 * Renders all runs as a continuous chat history thread.
 * History runs are shown oldest→newest; the active (live) run is always last.
 */
export function AiChatThread({
  runs = [],
  latestRunId,
  isLoading,
  pendingInput,
  onConfirm,
  isConfirming,
  onRetry,
  copyProps,
  ttsProps,
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [runs.length, pendingInput, latestRunId]);

  const sorted = [...runs].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (!sorted.length && pendingInput) {
    return (
      <div className="flex flex-col gap-6 w-full">
        <AiChatMessage variant="user">{pendingInput}</AiChatMessage>
        <AiChatMessage variant="assistant">
          <AiChatTypingIndicator />
        </AiChatMessage>
        <div ref={bottomRef} />
      </div>
    );
  }

  if (isLoading && !sorted.length) {
    return (
      <div className="flex flex-col gap-6 w-full">
        {[1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-6">
            <div className="flex justify-end">
              <Skeleton className="h-12 w-52 rounded-2xl rounded-tr-sm" />
            </div>
            <div className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full shrink-0" />
              <div className="flex flex-col gap-2 flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 w-full">
      {sorted.map((run) => (
        <RunPair
          key={run._id}
          run={run}
          onConfirm={run._id === latestRunId ? onConfirm : undefined}
          isConfirming={run._id === latestRunId ? isConfirming : false}
          onRetry={onRetry}
          copyProps={copyProps}
          ttsProps={ttsProps}
        />
      ))}

      {pendingInput && (
        <div className="flex flex-col gap-6">
          <AiChatMessage variant="user">{pendingInput}</AiChatMessage>
          <AiChatMessage variant="assistant">
            <AiChatTypingIndicator />
          </AiChatMessage>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
