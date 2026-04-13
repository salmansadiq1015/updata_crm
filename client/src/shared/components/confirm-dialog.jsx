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
import { AlertTriangle } from 'lucide-react';

export function ConfirmDialog({ open, onOpenChange, title, description, onConfirm, loading, variant = 'destructive', confirmText = 'Bestaetigen', cancelText = 'Abbrechen' }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-2xl shadow-theme-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${variant === 'destructive' ? 'bg-destructive/10' : 'bg-primary/10'}`}>
              <AlertTriangle className={`h-5 w-5 ${variant === 'destructive' ? 'text-destructive' : 'text-primary'}`} />
            </div>
            <DialogTitle>{title}</DialogTitle>
          </div>
          {description && <DialogDescription className="mt-2">{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="rounded-lg">
            {cancelText}
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={loading} className="rounded-lg">
            {loading ? 'Wird ausgefuehrt...' : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
