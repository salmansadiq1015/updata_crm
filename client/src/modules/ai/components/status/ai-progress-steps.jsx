'use client';

import { CheckCircle2, Circle, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';

function StepIcon({ type, isActive }) {
  if (type === 'ERROR')     return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
  if (isActive)             return <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />;
  if (type !== undefined)   return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
  return                           <Circle className="h-4 w-4 text-muted-foreground shrink-0" />;
}

export function AiProgressSteps({ steps = [], workflowLabel, isRunning }) {
  const { t } = useLanguage();
  if (!steps.length && isRunning) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-300">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>{workflowLabel ?? t('ai.chat.working')}...</span>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {steps.map((step, i) => {
        const isLast   = i === steps.length - 1;
        const isActive = isLast && isRunning;
        const label    = t(`ai.progress.${step.node}`, step.node);
        const detail   = step.toolName ? `(${step.toolName})` : '';

        return (
          <li key={step.stepIndex ?? i} className="flex items-start gap-3 rounded-xl border border-white/8 bg-slate-950/30 px-3 py-2">
            <StepIcon type={step.type} isActive={isActive} />
            <span className={cn('text-sm', isActive ? 'text-white' : 'text-slate-400')}>
              {label} {detail}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
