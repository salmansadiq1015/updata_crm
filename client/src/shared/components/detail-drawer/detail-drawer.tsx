'use client';

import * as React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button as ButtonImpl } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  ChevronUp,
  ChevronDown,
  X,
  Pencil,
  Eye,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage as useLanguageImpl } from '@/lib/i18n/language-context';

type DrawerButtonProps = React.ComponentPropsWithRef<'button'> & {
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link';
  size?: 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg';
  asChild?: boolean;
};
const Button = ButtonImpl as unknown as React.ComponentType<DrawerButtonProps>;
const useLanguage = useLanguageImpl as unknown as () => {
  t: (key: string, fallback?: string, variables?: Record<string, string | number | null | undefined>) => string;
  isRTL?: boolean;
};

export type DrawerMode = 'view' | 'edit';
export type DrawerSize = 'sm' | 'md' | 'lg';

// The underlying Sheet forces `data-[side=*]:sm:max-w-sm` with attribute-selector
// specificity, so a plain `sm:max-w-[…]` from here loses. Matching the Sheet's own
// `data-[side=*]:sm:` variants lets tailwind-merge drop the Sheet's cap and makes
// this width win on whichever side the drawer opens from (right in LTR, left in RTL).
const sizeMap: Record<DrawerSize, string> = {
  sm: 'data-[side=left]:sm:max-w-[400px] data-[side=right]:sm:max-w-[400px]',
  md: 'data-[side=left]:sm:max-w-[520px] data-[side=right]:sm:max-w-[520px]',
  lg: 'data-[side=left]:sm:max-w-[640px] data-[side=right]:sm:max-w-[640px]',
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
  const { t, isRTL } = useLanguage();
  // Open from the inline-end edge: right in LTR, left in RTL.
  const side = isRTL ? 'left' : 'right';

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
        side={side}
        // The drawer renders its own close button in the header, so suppress the
        // Sheet's default absolute X (it would overlap the title, especially in RTL).
        showCloseButton={false}
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

          <div className="flex items-center gap-1 ms-4">
            {/* Navigation */}
            {(onPrevious || onNext) && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onPrevious}
                  disabled={!hasPrevious}
                  title={`${t('common.previous', 'Previous')} (Alt+↑)`}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onNext}
                  disabled={!hasNext}
                  title={`${t('common.next', 'Next')} (Alt+↓)`}
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
                title={mode === 'view' ? t('common.editMode', 'Edit mode') : t('common.viewMode', 'View mode')}
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
              title={t('common.close', 'Close')}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">{t('common.close', 'Close')}</span>
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
