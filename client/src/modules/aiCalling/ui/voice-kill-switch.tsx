'use client';

import { useState, type ReactElement } from 'react';
import { Loader2, Pause, PhoneCall, Play } from 'lucide-react';
import { ConfirmDialog as ConfirmDialogRaw } from '@/shared/components/confirm-dialog';
import { useVoiceSettings } from '../hooks/use-paired-phone';

// ConfirmDialog is an untyped .jsx; loosen its prop types for this .tsx module.
const ConfirmDialog = ConfirmDialogRaw as (props: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string;
  confirmText?: string; cancelText?: string; variant?: string; isLoading?: boolean; onConfirm: () => void;
}) => ReactElement;

/**
 * Global AI voice-calling kill switch: pausing stops every voice campaign before its next dial
 * (cloud SIP and paired phone) and cancels paired-phone calls not yet handed to the phone.
 * Calls already in progress finish normally. Needs ai-calling:admin to change.
 */
export function VoiceKillSwitch() {
  const [confirmPause, setConfirmPause] = useState(false);
  const { query, toggle } = useVoiceSettings();
  const s = query.data;
  if (!s) return null;
  const paused = s.voicePaused;
  return (
    <div
      role="region"
      aria-label="AI voice calling status"
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-2.5 text-sm ${paused ? 'border-rose-500/30 bg-rose-500/5' : 'border-border bg-card'}`}
    >
      <span className="flex items-center gap-2">
        <PhoneCall className="h-4 w-4 text-brand-500" aria-hidden="true" />
        <span className="font-medium">AI voice calling</span>
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${paused ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${paused ? 'bg-rose-500' : 'bg-emerald-500'}`} aria-hidden="true" />
          {paused ? 'Paused' : 'Active'}
        </span>
      </span>
      <span className="min-w-0 basis-full text-xs text-muted-foreground sm:basis-auto sm:flex-1">
        {paused
          ? <>No new calls are placed{s.pausedAt ? ` since ${new Date(s.pausedAt).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}. Calls in progress finish normally.</>
          : 'Start calling dials now. Scheduled runs follow calling hours. Limits and consent rules apply to both.'}
      </span>
      {s.pausedByEnv ? (
        <span className="text-xs text-muted-foreground">Paused by server setting</span>
      ) : (
        <button
          type="button"
          onClick={() => (paused ? toggle.mutate(false) : setConfirmPause(true))}
          disabled={toggle.isPending}
          className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:opacity-60 ${paused ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-rose-500/40 text-rose-600 hover:bg-rose-500/10'}`}
        >
          {toggle.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          {paused ? 'Resume calling' : 'Stop all calling'}
        </button>
      )}
      <ConfirmDialog
        open={confirmPause}
        onOpenChange={setConfirmPause}
        title="Stop all AI voice calling?"
        description="Every voice campaign stops before its next dial, on cloud SIP and on paired phones. Calls already in progress finish normally. Campaigns stay as they are; resume here to continue."
        confirmText="Stop all calling"
        cancelText="Keep calling"
        isLoading={toggle.isPending}
        onConfirm={() => toggle.mutate(true, { onSuccess: () => setConfirmPause(false) })}
      />
    </div>
  );
}
