'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import type { Socket } from 'socket.io-client';
import { Hand, Headphones, Loader2, X } from 'lucide-react';
import { onSocketConnect } from '@/lib/socket/client';
import { showSuccess } from '@/lib/toast';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { inboundCallsApi } from '../services/inbound-calls-api';
import { callerDisplay, errorMessage, TERMINAL_STATUSES, type T } from '../inbound-domain';
import type { CallStatus } from '../types/inbound-call-types';
import { primaryClass, secondaryClass } from './inbound-primitives';
import { useInboundLanguage } from './use-inbound-language';

export type HandoffPayload = { callId?: string; id?: string; reason?: string | null; waitSeconds?: number | null };

export const handoffToastId = (id: string) => `inbound-handoff-${id}`;

/** The alert is over once the call is taken over or ends. */
export function handoffResolved(status: string | null | undefined): boolean {
  return Boolean(status) && (TERMINAL_STATUSES.has(status as CallStatus) || status === 'HUMAN_ACTIVE' || status === 'WRAPPING_UP');
}

/**
 * Mounted once in the platform layout: when a caller asks the AI receptionist for a
 * person (`inbound-call:handoff`), a persistent toast appears on ANY page with the
 * caller, the reason, "Take over" (confirmed) and "Open call". It closes itself when
 * the call is taken over or ends. The Incoming Calls page relies on this host too, so
 * there is never a second toast.
 */
export function InboundHandoffAlertHost() {
  const { t } = useInboundLanguage();
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; });
  const allowed = usePermissions().hasPermission('inbound-calls:read');

  useEffect(() => {
    if (!allowed) return undefined;
    const onHandoff = (p: HandoffPayload = {}) => {
      if (!p.id) return;
      const id = p.id;
      toast.custom((item) => <HandoffToast id={id} reason={p.reason ?? null} waitSeconds={p.waitSeconds ?? null} t={tRef.current} visible={item.visible} />, { id: handoffToastId(id), duration: Infinity });
    };
    const onUpdate = (p: { id?: string; status?: string } = {}) => {
      if (p.id && handoffResolved(p.status)) toast.dismiss(handoffToastId(p.id));
    };
    const attached = new Set<Socket>();
    const unsubscribe = onSocketConnect((socket: Socket) => {
      socket.off('inbound-call:handoff', onHandoff); socket.on('inbound-call:handoff', onHandoff);
      socket.off('inbound-call:update', onUpdate); socket.on('inbound-call:update', onUpdate);
      attached.add(socket);
    });
    return () => {
      unsubscribe();
      for (const socket of attached) { socket.off('inbound-call:handoff', onHandoff); socket.off('inbound-call:update', onUpdate); }
      attached.clear();
    };
  }, [allowed]);

  return null;
}

export function HandoffToast({ id, reason, waitSeconds, t, visible = true }: { id: string; reason: string | null; waitSeconds: number | null; t: T; visible?: boolean }) {
  const [caller, setCaller] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => toast.dismiss(handoffToastId(id));

  useEffect(() => {
    let cancelled = false;
    inboundCallsApi.get(id).then((call) => { if (!cancelled) setCaller(`${callerDisplay(call, t)}${call.caller.number && call.caller.name ? ` · ${call.caller.number}` : ''}`); }).catch(() => { /* name is optional */ });
    return () => { cancelled = true; };
  }, [id, t]);

  const takeOver = async () => {
    setBusy(true); setError(null);
    try {
      await inboundCallsApi.control(id, 'takeover');
      showSuccess(t('inbound.control.sent.takeover', 'Moving the call to your handset'));
      close();
    } catch (e) { setError(errorMessage(e, t('inbound.common.requestFailed', 'The request could not be completed. Try again.'))); } finally { setBusy(false); }
  };

  return (
    <div role="alert" aria-live="assertive" className={`pointer-events-auto w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-amber-400/40 bg-card p-4 text-foreground shadow-2xl transition ${visible ? 'opacity-100' : 'opacity-0'}`}>
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/15 text-amber-600 dark:text-amber-300"><Hand className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t('inbound.handoffAlert.title', 'A caller wants to speak to a person')}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{caller ?? t('inbound.common.loading', 'Loading…')}</p>
          {reason ? <p className="mt-1 text-xs [overflow-wrap:anywhere]" dir="auto">“{reason}”</p> : null}
          {waitSeconds ? <p className="mt-1 text-[11px] text-muted-foreground">{t('inbound.handoffAlert.wait', 'The AI keeps them on the line for about {seconds} s.', { seconds: waitSeconds })}</p> : null}
        </div>
        <button type="button" aria-label={t('inbound.handoffAlert.dismiss', 'Dismiss')} className="rounded-lg p-1 text-muted-foreground hover:bg-muted" onClick={close}><X className="size-4" /></button>
      </div>
      {error ? <p role="status" className="mt-2 text-xs text-rose-600 dark:text-rose-400">{error}</p> : null}
      {confirming ? (
        <div className="mt-3 rounded-xl border border-border bg-muted/30 p-2.5">
          <p className="text-xs">{t('inbound.control.confirm.takeover.body', 'The audio moves to your phone\'s handset and the AI stops speaking. Pick up the phone to continue.')}</p>
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" className={`${secondaryClass} h-8 min-h-0 px-3 text-xs`} disabled={busy} onClick={() => setConfirming(false)}>{t('inbound.common.cancel', 'Cancel')}</button>
            <button type="button" className={`${primaryClass} h-8 min-h-0 px-3 text-xs`} disabled={busy} onClick={() => void takeOver()}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Headphones className="size-3.5" />}{t('inbound.handoffAlert.confirm', 'Yes, take over')}</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex justify-end gap-2">
          <Link href={`/incoming-calls?call=${encodeURIComponent(id)}`} onClick={close} className={`${secondaryClass} h-8 min-h-0 px-3 text-xs`}>{t('inbound.handoffAlert.open', 'Open call')}</Link>
          <button type="button" className={`${primaryClass} h-8 min-h-0 px-3 text-xs`} onClick={() => setConfirming(true)}><Headphones className="size-3.5" />{t('inbound.control.takeover', 'Take over')}</button>
        </div>
      )}
    </div>
  );
}
