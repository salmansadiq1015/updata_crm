'use client';

import * as React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  ChevronUp,
  ChevronDown,
  X,
  Pencil,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type DrawerMode = 'view' | 'edit';
export type DrawerSize = 'sm' | 'md' | 'lg';

const sizeMap: Record<DrawerSize, string> = {
  sm: 'sm:max-w-[400px]',
  md: 'sm:max-w-[520px]',
  lg: 'sm:max-w-[640px]',
};

interface DetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: string;

  // Navigation
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;

  // Mode
  mode?: DrawerMode;
  onModeChange?: (mode: DrawerMode) => void;
  enableEditMode?: boolean;

  // Size
  size?: DrawerSize;

  // Content
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function DetailDrawer({
  open,
  onOpenChange,
  title,
  subtitle,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
  mode = 'view',
  onModeChange,
  enableEditMode = true,
  size = 'md',
  children,
  footer,
}: DetailDrawerProps) {
  // Keyboard shortcuts
  React.useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' && e.altKey && hasPrevious) {
        e.preventDefault();
        onPrevious?.();
      }
      if (e.key === 'ArrowDown' && e.altKey && hasNext) {
        e.preventDefault();
        onNext?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, hasPrevious, hasNext, onPrevious, onNext]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn(
          'flex flex-col p-0 gap-0',
          sizeMap[size]
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
          <div className="flex-1 min-w-0">
            <SheetTitle className="text-lg font-semibold truncate">
              {title}
            </SheetTitle>
            {subtitle && (
              <SheetDescription className="text-sm text-muted-foreground truncate mt-0.5">
                {subtitle}
              </SheetDescription>
            )}
          </div>

          <div className="flex items-center gap-1 ml-4">
            {/* Navigation */}
            {(onPrevious || onNext) && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onPrevious}
                  disabled={!hasPrevious}
                  title="Vorheriger (Alt+↑)"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onNext}
                  disabled={!hasNext}
                  title="Nächster (Alt+↓)"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Separator orientation="vertical" className="h-6 mx-1" />
              </>
            )}

            {/* Edit/View toggle */}
            {enableEditMode && onModeChange && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() =>
                  onModeChange(mode === 'view' ? 'edit' : 'view')
                }
                title={mode === 'view' ? 'Bearbeiten' : 'Ansehen'}
              >
                {mode === 'view' ? (
                  <Pencil className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            )}

            {/* Close */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="border-t border-border/40 px-6 py-3 bg-muted/20">
            {footer}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
