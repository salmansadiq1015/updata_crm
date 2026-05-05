'use client';

import { CheckCircle2, AlertCircle, Circle, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatEntityLabel } from '../../constants/ai-constants';

const TYPE_ICON = {
  TOOL_CALL:  Cpu,
  ERROR:      AlertCircle,
  REASONING:  Circle,
  TRANSITION: CheckCircle2,
};

const TYPE_COLOR = {
  TOOL_CALL:  'text-blue-500',
  ERROR:      'text-destructive',
  REASONING:  'text-muted-foreground',
  TRANSITION: 'text-green-500',
};

export function AiRunSteps({ steps = [] }) {
  if (!steps.length) {
    return <p className="text-sm text-muted-foreground">No steps recorded.</p>;
  }

  return (
    <ol className="flex flex-col gap-3">
      {steps.map((step, i) => {
        const Icon  = TYPE_ICON[step.type] ?? Circle;
        const color = TYPE_COLOR[step.type] ?? 'text-muted-foreground';

        return (
          <li key={i} className="flex items-start gap-3">
            <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', color)} />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-sm font-medium">{step.node}</span>
              {step.toolName && (
                <span className="text-xs text-muted-foreground">Tool: {step.toolName}</span>
              )}
              {step.durationMs && (
                <span className="text-xs text-muted-foreground">{step.durationMs}ms</span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
