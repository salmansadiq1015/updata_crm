'use client';

import { AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function IghImportPreviewDialog({ open, onClose, preview, onConfirm, isImporting }) {
  if (!preview) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Import Preview</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            {preview.total.toLocaleString()} articles found in the IGH catalog.
          </p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-md border p-3">
              <p className="text-2xl font-bold text-green-600">{preview.newCount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">New</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-2xl font-bold text-blue-600">{preview.updatedCount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Updated</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-2xl font-bold text-amber-600">{preview.obsoleteCount.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Obsolete</p>
            </div>
          </div>
          {preview.obsoleteCount > 0 && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {preview.obsoleteCount} articles in your catalog are no longer in the IGH feed. They will not be automatically removed.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isImporting}>Cancel</Button>
          <Button onClick={onConfirm} disabled={isImporting}>
            {isImporting ? 'Importing...' : 'Confirm Full Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
