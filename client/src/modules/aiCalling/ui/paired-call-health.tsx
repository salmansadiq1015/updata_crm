'use client';

import { useState, type ReactElement } from 'react';
import { AlertTriangle, Hand, PhoneOff, Smartphone } from 'lucide-react';
import { ConfirmDialog as ConfirmDialogRaw } from '@/shared/components/confirm-dialog';
import { useCallControl } from '../hooks/use-paired-phone';
import type { ActiveCall } from '../types/ai-calling-types';

const ConfirmDialog = ConfirmDialogRaw as (props: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; description?: string;
  confirmText?: string; cancelText?: string; variant?: string; isLoading?: boolean; onConfirm: () => void;
}) => ReactElement;

/** Readiness reason codes from the server (pairedPhone/readiness.js) in plain words. */
export const DEVICE_WAIT_TEXT: Record<string, string> = {
  revoked: 'the paired phone was revoked',
  archived: 'the paired phone is archived',
  audio_not_verified: 'two-way call audio is not verified on the phone yet',
  gateway_offline: 'the laptop gateway is offline',
  board_disconnected: 'the ESP32 board is not plugged in',
  key_not_provisioned: 'the dial key is not provisioned on the ESP32',
  phone_not_connected: 'the phone is not connected over Bluetooth',
  phone_in_call: 'the phone is busy with another call',
  device_busy: 'the phone is finishing a call',
  needs_attention: 'a previous call needs checking',
  cooldown: 'cooling down between calls',
  hourly_cap: 'the hourly call limit is reached',
  daily_cap: 'the daily call limit is reached',
  firmware_fault: 'the ESP32 reports a fault',
  setup_in_progress: 'a setup action is running on the bridge',
};

/**
 * What a person has to do for each reason. Reasons not listed clear by themselves
 * (cooldown, caps, a call finishing), so the campaign simply waits for them.
 */
export const DEVICE_FIX_TEXT: Record<string, string> = {
  revoked: 'Pair the phone again under AI Calling → Paired phones.',
  archived: 'Open Connections → Archived phones and restore this phone.',
  audio_not_verified: 'Verify two-way call audio in the paired phone\'s device card.',
  gateway_offline: 'Start the Updata gateway on the laptop the ESP32 is plugged into.',
  board_disconnected: 'Plug the ESP32 into the laptop running the gateway.',
  key_not_provisioned: 'Open the paired phone\'s device card, choose Finish setup → Save security key and hold the ESP32\'s BOOT button until it is saved. This is needed after a new dial key is issued.',
  phone_not_connected: 'Turn on Bluetooth on the phone and reconnect it to the bridge (device card → Phone setup).',
  needs_attention: 'Check the phone, end any open call, then choose Clear in the device card.',
  firmware_fault: 'Restart the ESP32 (unplug and plug it back in).',
};

/** One sentence for the paired phone's state: what blocks calls and how to fix it, or what it waits for. */
export function deviceWaitSentence(reasons: string[]): { blocking: boolean; text: string } {
  const fixes = [...new Set(reasons.map((r) => DEVICE_FIX_TEXT[r]).filter(Boolean))];
  const what = reasons.map((r) => DEVICE_WAIT_TEXT[r] || r).join(' · ');
  return fixes.length
    ? { blocking: true, text: `Calls are blocked: ${what}. To fix: ${fixes.join(' ')}` }
    : { blocking: false, text: `Waiting: ${what}. Calls continue on their own once this clears.` };
}

/** dBFS → 0..100 for a simple level bar (−60 dBFS = empty, 0 = full). */
const pct = (db: number | null | undefined) => (db == null ? 0 : Math.max(0, Math.min(100, Math.round(((db + 60) / 60) * 100))));

function Level({ label, db, stale }: { label: string; db: number | null | undefined; stale: boolean }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">{db == null || stale ? '—' : `${Math.round(db)} dBFS`}</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label={label} aria-valuemin={-60} aria-valuemax={0} aria-valuenow={db == null || stale ? -60 : Math.max(-60, Math.min(0, Math.round(db)))}>
        <div className={`h-full rounded-full ${stale ? 'bg-muted-foreground/30' : 'bg-emerald-500'}`} style={{ width: `${stale ? 0 : pct(db)}%` }} />
      </div>
    </div>
  );
}

/** Live audio health + takeover/end controls for one paired-phone call. Shows only reported values. */
export function PairedCallHealth({ call, compact = false }: { call: ActiveCall; compact?: boolean }) {
  const control = useCallControl();
  const [confirm, setConfirm] = useState<null | 'takeover' | 'hangup'>(null);
  const [showAudio, setShowAudio] = useState(false);
  const g = call.gateway;
  if (!g) return null;
  const stale = g.audioAgeSeconds == null || g.audioAgeSeconds > 6;
  const a = g.audio;
  const status = g.takenOver ? 'Taken over on the phone'
    : g.audioLost ? 'Call audio lost'
      : g.audioOpen ? 'Audio live'
        : g.state === 'queued' ? 'Waiting for the gateway'
          : g.state === 'claimed' || g.state === 'dialing' ? 'Dialing from your phone' : 'Connecting';
  return (
    <div className="mt-2 space-y-2 rounded-md border border-border bg-background/80 p-2">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 font-semibold text-brand-700 dark:text-brand-300"><Smartphone className="h-3 w-3" aria-hidden="true" /> Paired phone</span>
        <span className={`font-medium ${g.audioLost ? 'text-rose-600' : 'text-muted-foreground'}`}>{status}</span>
        {(!compact || showAudio) && a?.firstAiAudioMs != null ? <span className="text-muted-foreground">· AI first spoke after {(a.firstAiAudioMs / 1000).toFixed(1)} s</span> : null}
        {stale && g.audioOpen ? <span className="inline-flex items-center gap-1 text-amber-600"><AlertTriangle className="h-3 w-3" aria-hidden="true" /> audio stats stale</span> : null}
      </div>
      {compact && <button type="button" aria-expanded={showAudio} className="text-[11px] font-medium text-primary hover:underline" onClick={() => setShowAudio(!showAudio)}>{showAudio ? 'Hide audio details' : 'Audio details'}</button>}
      {(!compact || showAudio) && (g.audioOpen || g.audioLost) ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Level label="Lead → AI" db={a?.rxLevelDbfs} stale={stale} />
          <Level label="AI → lead" db={a?.txLevelDbfs} stale={stale} />
        </div>
      ) : null}
      {(!compact || showAudio) && a && !stale && ((a.downUnderruns || 0) > 0 || (a.upSeqGaps || 0) > 0) ? (
        <p className="text-[11px] text-amber-700 dark:text-amber-400">Audio glitches: {a.downUnderruns || 0} playback gaps · {a.upSeqGaps || 0} lost frames</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {g.audioOpen && !g.takenOver && !g.command ? (
          <button type="button" onClick={() => setConfirm('takeover')} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-border px-2.5 text-xs font-semibold hover:bg-muted">
            <Hand className="h-3.5 w-3.5" /> Take over on the phone
          </button>
        ) : null}
        {g.command !== 'hangup' ? (
          <button type="button" onClick={() => setConfirm('hangup')} className="inline-flex min-h-8 items-center gap-1 rounded-md border border-rose-500/40 px-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-500/10">
            <PhoneOff className="h-3.5 w-3.5" /> End call
          </button>
        ) : <span className="text-xs text-muted-foreground">Hanging up…</span>}
      </div>
      <ConfirmDialog
        open={confirm === 'takeover'} onOpenChange={(v) => setConfirm(v ? 'takeover' : null)}
        title="Take over this call?"
        description="The AI stops and the call moves to the phone itself: pick it up and continue talking. The call is marked for review."
        confirmText="Take over" cancelText="Let the AI continue" isLoading={control.takeover.isPending}
        onConfirm={() => control.takeover.mutate(call.recordId, { onSettled: () => setConfirm(null) })}
      />
      <ConfirmDialog
        open={confirm === 'hangup'} onOpenChange={(v) => setConfirm(v ? 'hangup' : null)}
        title="End this call now?"
        description="The phone hangs up. Answers already captured are kept; the call outcome is saved as usual."
        confirmText="End call" cancelText="Keep talking" variant="destructive" isLoading={control.hangup.isPending}
        onConfirm={() => control.hangup.mutate(call.recordId, { onSettled: () => setConfirm(null) })}
      />
    </div>
  );
}
