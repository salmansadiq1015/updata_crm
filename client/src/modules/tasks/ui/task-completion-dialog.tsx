'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type TaskCompletionDialogProps = {
  open: boolean;
  incompleteCount: number;
  onCompleteAll: () => void;
  onParentOnly: () => void;
  onCancel: () => void;
};

export function TaskCompletionDialog({
  open,
  incompleteCount,
  onCompleteAll,
  onParentOnly,
  onCancel,
}: TaskCompletionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Open subtasks</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {incompleteCount} subtask{incompleteCount === 1 ? '' : 's'} still open.
        </p>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onParentOnly}>Parent only</Button>
            <Button type="button" onClick={onCompleteAll}>Complete all</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
