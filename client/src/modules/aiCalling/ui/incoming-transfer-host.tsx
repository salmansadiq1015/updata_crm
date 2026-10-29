'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import type { Socket } from 'socket.io-client';
import type { Room } from 'livekit-client';
import { Headset, Loader2, Mic, MicOff, PhoneForwarded, PhoneOff, Quote, X } from 'lucide-react';
import { onSocketConnect } from '@/lib/socket/client';
import { useIntelT } from '../hooks/use-intel-t';
import { callingIntelligenceApi as api } from '../services/calling-intelligence-api';
import type { TransferJoin, TransferOffer } from '../types/calling-intelligence-types';
import { categoryLabel } from './call-intelligence-panel';

const errorText = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : 'The request failed.');

/** Seconds left until an offer expires (re-rendered by the caller's ticker). */
function secondsLeft(expiresAt: string | null, now: number) {
  return expiresAt ? Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000)) : null;
}

/**
 * Mounted once in the platform layout: listens for "incoming transfer" offers from
 * AI calls, shows the context card, and joins the call's audio when accepted.
 */
export function IncomingTransferHost() {
  const t = useIntelT();
  const [offers, setOffers] = useState<TransferOffer[]>([]);
  const [busy, setBusy] = useState<'web' | 'phone' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<{ offer: TransferOffer; join: TransferJoin } | null>(null);
  const [phoneNotice, setPhoneNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const current = offers[0] || null;

  useEffect(() => {
    let cancelled = false;
    api.offers().then(list => { if (!cancelled && list.length) setOffers(list); }).catch(() => { /* no permission or offline: realtime only */ });
    const onOffer = (offer: TransferOffer) => setOffers(list => [offer, ...list.filter(o => o.recordId !== offer.recordId)]);
    const onClosed = ({ recordId }: { recordId: string }) => setOffers(list => list.filter(o => o.recordId !== recordId));
    const attached = new Set<Socket>();
    const unsubscribe = onSocketConnect((socket: Socket) => {
      socket.off('ai-calling:transfer-offer', onOffer); socket.on('ai-calling:transfer-offer', onOffer);
      socket.off('ai-calling:transfer-closed', onClosed); socket.on('ai-calling:transfer-closed', onClosed);
      attached.add(socket);
    });
    return () => {
      cancelled = true; unsubscribe();
      for (const socket of attached) { socket.off('ai-calling:transfer-offer', onOffer); socket.off('ai-calling:transfer-closed', onClosed); }
    };
  }, []);

  useEffect(() => {
    if (!current) return;
    const timer = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      // Expired offers disappear (the server has already moved the call to its fallback).
      setOffers(list => list.filter(o => !o.expiresAt || Date.parse(o.expiresAt) > tick));
    }, 1000);
    return () => clearInterval(timer);
  }, [current]);
  const left = current ? secondsLeft(current.expiresAt, now) : null;

  const accept = async (mode: 'web' | 'phone') => {
    if (!current) return;
    setBusy(mode); setError(null);
    try {
      const res = await api.accept(current.recordId, mode);
      setOffers(list => list.filter(o => o.recordId !== current.recordId));
      if (mode === 'web' && res.join) setJoined({ offer: current, join: res.join });
      else setPhoneNotice(t('callingIntel.incoming.phoneSoon', 'Accepted. The agent is handing over; your phone will ring shortly.'));
    } catch (e) { setError(errorText(e)); setOffers(list => list.filter(o => o.recordId !== current.recordId)); } finally { setBusy(null); }
  };
  const decline = async () => {
    if (!current) return;
    setBusy('decline'); setError(null);
    try { await api.decline(current.recordId); } catch { /* already closed */ }
    setOffers(list => list.filter(o => o.recordId !== current.recordId)); setBusy(null);
  };

  return <>
    {current && !joined && <Dialog.Root open onOpenChange={open => { if (!open) void decline(); }}><Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" />
      <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-[70] flex max-h-[92dvh] w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-sky-400/25 bg-card text-foreground shadow-2xl outline-none">
        <header className="flex items-start justify-between gap-3 border-b border-border bg-gradient-to-r from-blue-600/15 via-blue-500/10 to-cyan-500/15 p-4">
          <div className="min-w-0"><Dialog.Title className="flex items-center gap-2 text-base font-semibold"><span className="relative flex size-2.5"><span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-400 opacity-75" /><span className="relative inline-flex size-2.5 rounded-full bg-cyan-500" /></span>{t('callingIntel.incoming.title', 'Incoming call transfer')}</Dialog.Title>
            <p className="mt-1 truncate text-xs text-muted-foreground">{current.agentName}{current.campaignName ? ` · ${current.campaignName}` : ''}{left != null ? ` · ${t('callingIntel.incoming.secondsLeft', '{n}s left', { n: left })}` : ''}</p></div>
          <button type="button" aria-label={t('callingIntel.incoming.decline', 'Decline')} onClick={() => void decline()} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X className="size-4" /></button>
        </header>
        <div className="min-h-0 space-y-4 overflow-y-auto p-4 text-sm">
          <div className="grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-border p-3"><p className="text-[11px] text-muted-foreground">{t('callingIntel.incoming.lead', 'Lead')}</p><p className="font-medium">{current.lead?.name || '—'}</p><p className="text-xs text-muted-foreground">{[current.lead?.leadNumber, current.lead?.city].filter(Boolean).join(' · ')}</p></div>
            <div className="rounded-xl border border-border p-3"><p className="text-[11px] text-muted-foreground">{t('callingIntel.incoming.why', 'Why the agent is transferring')}</p><p className="font-medium [overflow-wrap:anywhere]">{current.reason || t('callingIntel.review.notStated', 'Not stated')}</p></div></div>
          {current.summary && <div className="rounded-xl border border-border p-3"><p className="text-[11px] text-muted-foreground">{t('callingIntel.handoff.summary', 'Agent summary')}</p><p className="mt-1 whitespace-pre-wrap">{current.summary}</p></div>}
          {current.captured.length > 0 && <div><p className="text-[11px] font-semibold uppercase text-muted-foreground">{t('callingIntel.incoming.captured', 'Answers captured so far')}</p><dl className="mt-1 grid gap-1 text-xs sm:grid-cols-2">{current.captured.map(c => <div key={c.fieldKey} className="rounded-lg bg-muted/50 p-2"><dt className="text-muted-foreground">{c.label}</dt><dd dir="auto">{c.value}</dd></div>)}</dl></div>}
          {current.extracted.length > 0 && <ul className="space-y-1 text-xs">{current.extracted.map((e, i) => <li key={i}><span className="font-medium">{categoryLabel(t, e.category)}:</span> {e.value} <span dir="auto" className="text-muted-foreground">“{e.quote}”</span></li>)}</ul>}
          {current.transcript.length > 0 && <div><p className="text-[11px] font-semibold uppercase text-muted-foreground">{t('callingIntel.incoming.conversation', 'Conversation so far')}</p><ol className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-2 text-xs">{current.transcript.map((turn, i) => <li key={i} className="flex gap-2"><span className="w-12 shrink-0 text-muted-foreground">{turn.role === 'customer' ? t('callingIntel.queue.lead', 'Lead') : t('callingIntel.queue.agent', 'Agent')}</span><span dir="auto" className="min-w-0 [overflow-wrap:anywhere]">{turn.text}</span></li>)}</ol></div>}
          {offers.length > 1 && <p className="text-xs text-muted-foreground">{t('callingIntel.incoming.more', '{n} more transfer(s) waiting', { n: offers.length - 1 })}</p>}
          {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-300">{error}</p>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-border p-4">
          <button type="button" disabled={Boolean(busy)} onClick={() => void decline()} className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-50"><PhoneOff className="size-4" />{t('callingIntel.incoming.decline', 'Decline')}</button>
          {current.modes.phone && <button type="button" disabled={Boolean(busy)} onClick={() => void accept('phone')} className="inline-flex items-center gap-2 rounded-xl border border-sky-400/40 px-4 py-2.5 text-sm font-medium text-sky-700 hover:bg-sky-400/10 disabled:opacity-50 dark:text-sky-200">{busy === 'phone' ? <Loader2 className="size-4 animate-spin" /> : <PhoneForwarded className="size-4" />}{t('callingIntel.incoming.acceptPhone', 'Take it on my phone')}</button>}
          {current.modes.web && <button type="button" disabled={Boolean(busy)} onClick={() => void accept('web')} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 disabled:opacity-50">{busy === 'web' ? <Loader2 className="size-4 animate-spin" /> : <Headset className="size-4" />}{t('callingIntel.incoming.acceptWeb', 'Accept and join')}</button>}
        </footer>
      </Dialog.Content>
    </Dialog.Portal></Dialog.Root>}
    {joined && <HumanCallRoom offer={joined.offer} join={joined.join} onClose={() => setJoined(null)} />}
    {phoneNotice && <div role="status" className="fixed bottom-4 end-4 z-[70] flex max-w-sm items-start gap-2 rounded-xl border border-sky-400/30 bg-card p-3 text-sm shadow-xl"><PhoneForwarded className="mt-0.5 size-4 shrink-0 text-sky-500" /><span className="flex-1">{phoneNotice}</span><button type="button" aria-label={t('callingIntel.common.close', 'Close')} onClick={() => setPhoneNotice(null)}><X className="size-4" /></button></div>}
  </>;
}

/** The accepted person's live audio leg in the call's LiveKit room (microphone on). */
export function HumanCallRoom({ offer, join, onClose }: { offer: TransferOffer; join: TransferJoin; onClose: () => void }) {
  const t = useIntelT();
  const room = useRef<Room | null>(null);
  const audio = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'connecting' | 'live' | 'ended' | 'error'>('connecting');
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);
  const leave = useCallback(async () => { await room.current?.disconnect().catch(() => {}); room.current = null; onClose(); }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { Room: LiveKitRoom, RoomEvent, Track } = await import('livekit-client');
        const connection = new LiveKitRoom({ adaptiveStream: true, dynacast: true });
        room.current = connection;
        connection.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind !== Track.Kind.Audio) return;
          const node = track.attach(); node.hidden = true; audio.current?.appendChild(node);
          void node.play().catch(() => setBlocked(true));
        });
        connection.on(RoomEvent.TrackUnsubscribed, track => { track.detach().forEach(node => node.remove()); });
        connection.on(RoomEvent.AudioPlaybackStatusChanged, () => setBlocked(!connection.canPlaybackAudio));
        connection.on(RoomEvent.Disconnected, () => { if (!cancelled) setState('ended'); });
        await connection.connect(join.url, join.token, { autoSubscribe: true });
        if (cancelled) { await connection.disconnect(); return; }
        await connection.localParticipant.setMicrophoneEnabled(true);
        for (const participant of connection.remoteParticipants.values()) for (const pub of participant.trackPublications.values()) if (pub.track && pub.track.kind === Track.Kind.Audio) { const node = pub.track.attach(); node.hidden = true; audio.current?.appendChild(node); }
        try { await connection.startAudio(); } catch { setBlocked(true); }
        setState('live');
        api.joined(offer.recordId).catch(() => { /* the worker reports the join as well */ });
      } catch (e) {
        if (!cancelled) { setState('error'); setError(errorText(e)); }
      }
    })();
    return () => { cancelled = true; void room.current?.disconnect(); room.current = null; };
  }, [join.url, join.token, offer.recordId]);

  return <div role="dialog" aria-label={t('callingIntel.room.title', 'Live call with {name}', { name: offer.lead?.name || '' })} className="fixed bottom-4 end-4 z-[70] w-[min(22rem,calc(100%-2rem))] space-y-3 rounded-2xl border border-sky-400/30 bg-card p-4 text-sm shadow-2xl">
    <div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{offer.lead?.name || t('callingIntel.incoming.lead', 'Lead')}</p><p role="status" className="text-xs text-muted-foreground">{state === 'connecting' ? t('callingIntel.room.connecting', 'Connecting your microphone…') : state === 'live' ? t('callingIntel.room.live', 'You are on the call. The AI agent has stepped back.') : state === 'ended' ? t('callingIntel.room.ended', 'The call has ended.') : t('callingIntel.room.error', 'Could not join: {error}', { error: error || '' })}</p></div>{state === 'live' && <span className="mt-1 size-2.5 animate-pulse rounded-full bg-cyan-500" />}</div>
    {offer.reason && <p className="flex gap-1.5 text-xs text-muted-foreground"><Quote className="size-3 shrink-0" />{offer.reason}</p>}
    {blocked && <button type="button" className="text-xs font-medium text-sky-600 underline dark:text-sky-300" onClick={() => void room.current?.startAudio().then(() => setBlocked(false))}>{t('callingIntel.room.enableAudio', 'Enable audio')}</button>}
    <div className="flex gap-2">
      {state === 'live' && <button type="button" onClick={async () => { const next = !muted; await room.current?.localParticipant.setMicrophoneEnabled(!next); setMuted(next); }} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:bg-muted">{muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}{muted ? t('callingIntel.room.unmute', 'Unmute') : t('callingIntel.room.mute', 'Mute')}</button>}
      <button type="button" onClick={() => void leave()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-500"><PhoneOff className="size-4" />{state === 'live' ? t('callingIntel.room.hangUp', 'Leave call') : t('callingIntel.common.close', 'Close')}</button>
    </div>
    <div ref={audio} hidden />
  </div>;
}
