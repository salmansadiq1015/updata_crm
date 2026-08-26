'use client';

import { useCallback, useState } from 'react';
import { Bug, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import SupportFormSheet from './support-form-sheet';
import { useCreateTicketMutation } from '../hooks/use-create-ticket-mutation';

// Elements carrying this class are excluded from the captured
// screenshot (the FAB itself; the sheet is closed during capture
// anyway so it's never in the DOM at that point, but this also
// guards against any other floating chrome we don't own).
const IGNORE_CLASS = 'feedback-fab-ignore';

/**
 * Capture the origin (URL + viewport) at the moment the button is
 * pressed — before anything else can change the page. Wrapped in
 * try/catch returning null: diagnostics must never block filing.
 */
function captureOrigin() {
  try {
    return {
      originPlatform: 'web',
      originUrl: window.location.href,
      originViewport: `${innerWidth}x${innerHeight}`,
    };
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════
//  FeedbackFab
//  Global floating "report an issue" button, mounted once in
//  PlatformLayout. Captures a screenshot of the current page,
//  then opens the support ticket sheet with that screenshot
//  pre-attached — no manual upload, no navigation.
// ═══════════════════════════════════════════════════════════
export default function FeedbackFab() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [capturedFile, setCapturedFile] = useState(null);
  const [capturedOrigin, setCapturedOrigin] = useState(null);

  const createMutation = useCreateTicketMutation({
    onSuccess: () => setSheetOpen(false),
  });

  const handleCapture = useCallback(async () => {
    if (isCapturing) return;
    setIsCapturing(true);

    // Step 1: Record the origin FIRST, before anything else can change
    // the page. This happens outside the try/catch on purpose — if the
    // screenshot fails, the user still gets a ticket form, and the
    // origin is the one piece of context that cannot be reconstructed.
    const origin = captureOrigin();
    setCapturedOrigin(origin);

    try {
      // Step 2: Capture the visible page to a PNG, excluding the button.
      // Uses html2canvas-pro rather than plain html2canvas: this app's
      // Tailwind v4 color system serializes computed colors as oklch()/
      // lab(), which the original html2canvas cannot parse and fails on
      // for effectively every page. html2canvas-pro is an API-compatible
      // fork that adds support for those modern CSS color functions.
      const { default: html2canvas } = await import('html2canvas-pro');
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        backgroundColor: null,
        scale: 1,
        ignoreElements: (el) =>
          typeof el.classList !== 'undefined' && el.classList.contains(IGNORE_CLASS),
      });

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const file = blob
        ? new File([blob], 'screenshot.png', { type: 'image/png' })
        : null;

      setCapturedFile(file);
      setSheetOpen(true);
    } catch (err) {
      // Screenshot capture is best-effort — still let the user file
      // a ticket manually if it fails for any reason.
      console.error('Screenshot capture failed:', err);
      setCapturedFile(null);
      setSheetOpen(true);
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing]);

  return (
    <>
      <button
        type="button"
        onClick={handleCapture}
        disabled={isCapturing}
        title="Problem melden"
        aria-label="Problem melden"
        className={cn(
          IGNORE_CLASS,
          // pointer-events-auto is load-bearing: Radix's scroll lock sets
          // `pointer-events: none` directly on <body> while any Sheet/Dialog
          // is open (verified via computed style — not a z-index issue).
          // That inherits down to every body descendant including this
          // button, which is a normal PlatformLayout child, not portaled
          // outside body like the Sheet/Dialog content is. Without this
          // override, clicks on the FAB never fire at all while a
          // Sheet/Dialog is open — z-[60] alone does nothing to fix that.
          'fixed bottom-6 right-6 z-[60] pointer-events-auto flex h-12 w-12 items-center justify-center rounded-full',
          'bg-primary text-primary-foreground shadow-lg shadow-primary/30',
          'hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/40 hover:scale-105',
          'active:scale-95 transition-all duration-150 ease-out',
          // No disabled:pointer-events-none: the native `disabled` attribute
          // already blocks re-clicks on its own. Removing pointer-events
          // here matters — radix-overlay.js re-hit-tests this button's
          // coordinates against the live DOM to keep an open Sheet/Dialog
          // from dismissing itself when this FAB is clicked, and that
          // re-hit-test would silently miss a pointer-events:none button.
          'disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:scale-100',
        )}
      >
        {isCapturing ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Bug className="h-5 w-5" />
        )}
      </button>

      <SupportFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        isSubmitting={createMutation.isPending}
        onSubmit={(payload) => createMutation.mutate(payload)}
        initialFile={capturedFile}
        origin={capturedOrigin}
      />
    </>
  );
}
