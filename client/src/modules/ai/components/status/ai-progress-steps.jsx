'use client';

import { CheckCircle2, Circle, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function StepIcon({ type, isActive }) {
  if (type === 'ERROR')     return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
  if (isActive)             return <Loader2 className="h-4 w-4 text-primary animate-spin shrink-0" />;
  if (type !== undefined)   return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
  return                           <Circle className="h-4 w-4 text-muted-foreground shrink-0" />;
}

const NODE_LABELS = {
  validate_entities: 'Input validated',
  gather_context:    'Context loaded',
  execute_tools:     'Executing action',
  handle_failure:    'Handling error',
};

export function AiProgressSteps({ steps = [], workflowLabel, isRunning }) {
  if (!steps.length && isRunning) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span>{workflowLabel ?? 'Working on it'}...</span>
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-2">
      {steps.map((step, i) => {
        const isLast   = i === steps.length - 1;
        const isActive = isLast && isRunning;
        const label    = NODE_LABELS[step.node] ?? step.node;
        const detail   = step.toolName ? `(${step.toolName})` : '';

        return (
          <li key={step.stepIndex ?? i} className="flex items-start gap-2">
            <StepIcon type={step.type} isActive={isActive} />
            <span className={cn('text-sm', isActive ? 'text-foreground' : 'text-muted-foreground')}>
              {label} {detail}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
