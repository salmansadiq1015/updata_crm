'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LIST_COLORS, FOLDER_COLOR_OPTIONS } from './task-ui-constants';

// ── List color dialog (hex swatches) ────────────────────────────────────────

type ListColorDialogProps = {
  open: boolean;
  currentColor: string | null;
  onColorChange: (color: string | null) => void;
  onClose: () => void;
};

export function ListColorDialog({ open, currentColor, onColorChange, onClose }: ListColorDialogProps) {
  const pick = (color: string | null) => { onColorChange(color); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>List color</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-8 gap-2 py-1">
          {LIST_COLORS.map((color) => (
            <button
              key={color}
              className={cn(
                'h-6 w-6 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring flex items-center justify-center',
                currentColor === color && 'ring-2 ring-ring ring-offset-1'
              )}
              style={{ backgroundColor: color }}
              onClick={() => pick(color)}
              aria-label={color}
            >
              {currentColor === color && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
            </button>
          ))}
        </div>
        {currentColor && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 text-left"
            onClick={() => pick(null)}
          >
            Remove color
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Folder color dialog (named color swatches) ───────────────────────────────

type FolderColorDialogProps = {
  open: boolean;
  currentColor: string | null;
  onColorChange: (color: string | null) => void;
  onClose: () => void;
};

export function FolderColorDialog({ open, currentColor, onColorChange, onClose }: FolderColorDialogProps) {
  const pick = (color: string | null) => { onColorChange(color); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Folder color</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap gap-2 py-1">
          {FOLDER_COLOR_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent',
                opt.class,
                currentColor === opt.value && 'ring-2 ring-ring ring-offset-1'
              )}
              onClick={() => pick(opt.value)}
              aria-label={opt.label}
            >
              {currentColor === opt.value && <Check className="h-3 w-3" strokeWidth={3} />}
              {opt.label}
            </button>
          ))}
        </div>
        {currentColor && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 text-left"
            onClick={() => pick(null)}
          >
            Remove color
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
