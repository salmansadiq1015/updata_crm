'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WORKFLOW_LABELS } from '../../constants/ai-constants';

export function AiChatConfirmation({ run, onConfirm, onCancel, isConfirming }) {
  return (
    <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
        <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Action Required
        </p>
      </div>

      <div className="text-sm">
        <p className="text-xs text-muted-foreground mb-1">The AI wants to perform:</p>
        <p className="font-medium">
          {WORKFLOW_LABELS[run?.workflowType] ?? run?.workflowType ?? 'AI Action'}
        </p>
        {run?.output && (
          <pre className="mt-2 text-xs bg-background/60 rounded-lg p-2.5 overflow-auto max-h-28 border">
            {typeof run.output === 'string'
              ? run.output
              : JSON.stringify(run.output, null, 2)}
          </pre>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isConfirming}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={onConfirm} disabled={isConfirming}>
          {isConfirming ? 'Confirming…' : '✓ Confirm'}
        </Button>
      </div>
    </div>
  );
}
