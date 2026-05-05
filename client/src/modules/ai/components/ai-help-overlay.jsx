'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const COMMANDS = [
  { trigger: 'Create a task for…',           result: 'Creates a new task' },
  { trigger: 'Send a notification to…',      result: 'Sends an in-app notification' },
  { trigger: 'Create a lead for customer…',  result: 'Opens lead creation flow' },
  { trigger: 'Record a report',              result: 'Starts report dictation' },
  { trigger: 'Create an order for…',         result: 'Starts order creation flow' },
];

export function AiHelpOverlay({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-xl bg-background border shadow-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="font-semibold text-sm">What can I say?</p>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ul className="flex flex-col gap-3">
          {COMMANDS.map(({ trigger, result }) => (
            <li key={trigger} className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">"{trigger}"</span>
              <span className="text-xs text-muted-foreground">{result}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
