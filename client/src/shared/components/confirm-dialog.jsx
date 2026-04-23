'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ConfirmDialog({ open, onOpenChange, title, description, onConfirm, loading, isLoading, variant = 'destructive', confirmText = 'Bestaetigen', cancelText = 'Abbrechen' }) {
  const busy = loading || isLoading;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center gap-3.5">
            <div className={cn(
              'h-11 w-11 rounded-xl flex items-center justify-center shrink-0',
              variant === 'destructive' ? 'bg-destructive/10' : 'bg-primary/10'
            )}>
              <AlertTriangle className={cn('h-5 w-5', variant === 'destructive' ? 'text-destructive' : 'text-primary')} />
            </div>
            <div className="space-y-1">
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </div>
          </div>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelText}
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={busy} className="gap-2">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
