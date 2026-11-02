"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"
import { useLanguage } from "@/lib/i18n/language-context"

/** @param {React.ComponentProps<typeof DialogPrimitive.Root>} props */
function Dialog({
  ...props
}) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

/** @param {React.ComponentProps<typeof DialogPrimitive.Trigger>} props */
function DialogTrigger({
  ...props
}) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

/** @param {React.ComponentProps<typeof DialogPrimitive.Portal>} props */
function DialogPortal({
  ...props
}) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

/** @param {React.ComponentProps<typeof DialogPrimitive.Close>} props */
function DialogClose({
  ...props
}) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

/** @param {React.ComponentProps<typeof DialogPrimitive.Overlay>} props */
function DialogOverlay({
  className,
  ...props
}) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-background/80 duration-200 supports-backdrop-filter:backdrop-blur-md data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props} />
  );
}

/**
 * @param {React.ComponentProps<typeof DialogPrimitive.Content> & {
 *   showCloseButton?: boolean,
 *   hideClose?: boolean,
 *   dismissableOnOutsideClick?: boolean
 * }} props
 */
function DialogContent({
  className,
  children,
  showCloseButton = true,
  hideClose,
  // Modals hold in-progress input, so a stray click outside must not discard
  // it: by default the dialog no longer closes on an outside interaction
  // (client feedback, applied project-wide). Escape and the close button still
  // work. A dialog that genuinely wants outside-click dismissal opts in with
  // dismissableOnOutsideClick; an explicit onInteractOutside still wins.
  onInteractOutside,
  dismissableOnOutsideClick = false,
  ...props
}) {
  const { t } = useLanguage();

  const handleInteractOutside = (event) => {
    if (onInteractOutside) { onInteractOutside(event); return; }
    if (!dismissableOnOutsideClick) event.preventDefault();
  };

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        onInteractOutside={handleInteractOutside}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-1rem)] max-h-[92dvh] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/95 p-0 text-sm text-card-foreground shadow-[0_28px_90px_rgba(0,0,0,0.42)] ring-1 ring-foreground/[0.06] duration-200 outline-none supports-backdrop-filter:backdrop-blur-xl sm:w-full sm:max-w-4xl data-open:animate-in data-open:fade-in-0 data-open:zoom-in-[0.97] data-open:slide-in-from-bottom-2 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-[0.97] data-closed:slide-out-to-bottom-2",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && !hideClose && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-4 end-4 z-10 h-8 w-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
              size="icon-sm"
            >
              <XIcon className="h-4 w-4" />
              <span className="sr-only">{t('common.close', 'Schliessen')}</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/** @param {React.ComponentProps<'div'>} props */
function DialogBody({
  className,
  ...props
}) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6", className)}
      {...props} />
  );
}

/** @param {React.ComponentProps<'div'>} props */
function DialogHeader({
  className,
  ...props
}) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 border-b border-border/70 bg-card/95 px-5 py-5 sm:px-6", className)}
      {...props} />
  );
}

/** @param {React.ComponentProps<'div'> & { showCloseButton?: boolean }} props */
function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}) {
  const { t } = useLanguage();

  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex shrink-0 flex-col-reverse gap-2 border-t border-border/70 bg-card/95 px-5 py-4 supports-backdrop-filter:backdrop-blur-xl sm:flex-row sm:justify-end sm:px-6",
        className
      )}
      {...props}>
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">{t('common.close', 'Schliessen')}</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  );
}

/** @param {React.ComponentProps<typeof DialogPrimitive.Title>} props */
function DialogTitle({
  className,
  ...props
}) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-lg leading-tight font-semibold tracking-tight text-foreground", className)}
      {...props} />
  );
}

/** @param {React.ComponentProps<typeof DialogPrimitive.Description>} props */
function DialogDescription({
  className,
  ...props
}) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props} />
  );
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
