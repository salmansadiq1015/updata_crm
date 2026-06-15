'use client';

import { AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function IghImportPreviewDialog({ open, onClose, preview, onConfirm, isImporting }) {
  if (!preview) return null;
  const data = preview.previewData ?? preview;
  const validationErrors = data.validationErrors ?? [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Import Preview</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            {(data.total ?? 0).toLocaleString()} articles found in the IGH catalog.
          </p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-md border p-3">
              <p className="text-2xl font-bold text-green-600">{(data.newCount ?? 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">New</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-2xl font-bold text-blue-600">{(data.updatedCount ?? 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Updated</p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-2xl font-bold text-amber-600">{(data.obsoleteCount ?? 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Obsolete</p>
            </div>
          </div>
          {(data.obsoleteCount ?? 0) > 0 && (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {data.obsoleteCount} articles in your catalog are no longer in the IGH feed. They will not be automatically removed.
            </p>
          )}
          {validationErrors.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {validationErrors.length} validation errors were found. Invalid rows will be skipped.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isImporting}>Cancel</Button>
          <Button onClick={onConfirm} disabled={isImporting}>
            {isImporting ? 'Approving...' : 'Approve Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
