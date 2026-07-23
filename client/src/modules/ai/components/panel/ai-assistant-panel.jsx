'use client';

import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useAiStore } from '../../store/ai-store';
import { useAiSocketEvents } from '../../hooks/use-ai-socket-events';
import { AiPanelChat } from './ai-panel-chat';

export function AiAssistantPanel() {
  // Register socket listeners
  useAiSocketEvents();

  const isPanelOpen = useAiStore((s) => s.isPanelOpen);
  const closePanel = useAiStore((s) => s.closePanel);

  return (
    <Sheet open={isPanelOpen} onOpenChange={(open) => !open && closePanel()} modal={false}>
      <SheetContent
        side="right"
        showCloseButton={false}
        overlay={false}
        onInteractOutside={(event) => event.preventDefault()}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="flex w-full flex-col gap-0 overflow-hidden border-l border-white/10 bg-[#0a1020] p-0 text-slate-100 shadow-[0_0_90px_rgba(208,10,25,0.14)] sm:w-[500px] sm:max-w-[500px] lg:w-[540px] lg:max-w-[540px]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(78,116,219,0.22),transparent_34%),radial-gradient(circle_at_86%_16%,rgba(208,10,25,0.18),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent_38%)]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-300/40 to-transparent" />
        <AiPanelChat onClose={closePanel} />
      </SheetContent>
    </Sheet>
  );
}
