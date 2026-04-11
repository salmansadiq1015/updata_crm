'use client';

import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export function BulkActionsBar({ count, onClear, children }) {
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border bg-primary/5 border-primary/20 px-4 py-3 mb-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <span className="text-sm font-medium text-primary">
        {count} ausgewaehlt
      </span>
      <div className="flex items-center gap-2 ml-auto">
        {children}
        <Button variant="ghost" size="sm" onClick={onClear} className="gap-1.5 text-muted-foreground">
          <X className="h-3.5 w-3.5" />
          Aufheben
        </Button>
      </div>
    </div>
  );
}
