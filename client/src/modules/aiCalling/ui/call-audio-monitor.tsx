'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RemoteTrack, Room } from 'livekit-client';
import { Loader2, Volume2, VolumeX } from 'lucide-react';
import { readableError } from './calling-agent-primitives';
import { aiCallingApi } from '../services/ai-calling-api';

// Only one listening session across the live card and call drawer. No microphone publishing.
let activeListener: { owner: object; stop: () => void } | null = null;
export function CallAudioMonitor({ callId, live }: { callId: string; live: boolean }) {
  const instance = useRef({});
  const room = useRef<Room | null>(null);
  const credentialRequest = useRef<AbortController | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<RemoteTrack, HTMLMediaElement>());
  const operation = useRef(0);
  const volumeRef = useRef(1);
  const [volume, setVolume] = useState(1);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [trackCount, setTrackCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const stop = useCallback((): void => {
    operation.current++;
    credentialRequest.current?.abort(); credentialRequest.current = null;
    const current = room.current; room.current = null;
    current?.removeAllListeners();
    void current?.disconnect().catch(() => {});
    for (const [track, node] of nodes.current) { track.detach(node); node.remove(); }
    nodes.current.clear();
    if (activeListener?.owner === instance.current) activeListener = null;
    setListening(false); setBusy(false); setBlocked(false); setReconnecting(false); setTrackCount(0);
  }, []);
  useEffect(() => { if (!live) queueMicrotask(stop); return stop; }, [live, callId, stop]);

  const enableAudio = async () => {
    const connection = room.current;
    const generation = operation.current;
    if (!connection) return;
    try {
      await connection.startAudio();
      if (generation !== operation.current) return;
      await Promise.all([...nodes.current.values()].map(node => node.play()));
      if (generation === operation.current) { setBlocked(false); setError(null); }
    } catch {
      if (generation === operation.current) { setBlocked(true); setError('Your browser paused audio. Tap Enable audio to play both voices.'); }
    }
  };
  const start = async () => {
    activeListener?.stop(); stop();
    const generation = ++operation.current;
    const request = new AbortController(); credentialRequest.current = request;
    activeListener = { owner: instance.current, stop }; setBusy(true); setError(null);
    try {
      const credentials = await aiCallingApi.monitorCall(callId, request.signal);
      if (generation !== operation.current) return;
      const { Room, RoomEvent, Track } = await import('livekit-client');
      if (generation !== operation.current) return;
      const connection = new Room({ adaptiveStream: true, dynacast: true });
      room.current = connection;
      const attach = (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio || nodes.current.has(track) || room.current !== connection) return;
        const node = track.attach(); node.volume = volumeRef.current; node.hidden = true;
        nodes.current.set(track, node); container.current?.appendChild(node);
        setTrackCount(nodes.current.size);
        void node.play().catch(() => { if (room.current === connection) setBlocked(true); });
      };
      connection.on(RoomEvent.TrackSubscribed, attach);
      connection.on(RoomEvent.TrackUnsubscribed, track => { const node = nodes.current.get(track); if (node && room.current === connection) { track.detach(node); node.remove(); nodes.current.delete(track); setTrackCount(nodes.current.size); } });
      connection.on(RoomEvent.AudioPlaybackStatusChanged, () => { if (room.current === connection) setBlocked(!connection.canPlaybackAudio); });
      connection.on(RoomEvent.Reconnecting, () => { if (room.current === connection) setReconnecting(true); });
      connection.on(RoomEvent.SignalReconnecting, () => { if (room.current === connection) setReconnecting(true); });
      connection.on(RoomEvent.Reconnected, () => { if (room.current === connection) setReconnecting(false); });
      connection.on(RoomEvent.Disconnected, () => { if (room.current === connection) { stop(); setError('Live audio disconnected. Retry while the call is still active.'); } });
      await connection.connect(credentials.url, credentials.token, { autoSubscribe: true, peerConnectionTimeout: 15_000, websocketTimeout: 15_000 });
      if (generation !== operation.current) { await connection.disconnect(); return; }
      // Existing and newly published agent/lead audio tracks are both subscribed.
      for (const participant of connection.remoteParticipants.values()) for (const publication of participant.trackPublications.values()) if (publication.track) attach(publication.track);
      setListening(true);
      try { await connection.startAudio(); } catch { if (generation === operation.current) setBlocked(true); }
    } catch (cause) {
      if (generation === operation.current) { stop(); setError(readableError(cause)); }
    } finally {
      if (credentialRequest.current === request) credentialRequest.current = null;
      if (generation === operation.current) setBusy(false);
    }
  };
  const status = busy ? 'Connecting to the live conversation…'
    : reconnecting ? 'Reconnecting audio… Your microphone remains off.'
      : listening ? trackCount ? 'Listening to AI agent and lead · microphone off' : 'Connected · waiting for conversation audio · microphone off'
        : live ? 'Hear both voices live through your speakers.' : 'Live audio is available while the call is active.';
  return <section aria-label="Conversation audio" className="space-y-3 rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">Conversation audio</p><p role="status" className="mt-1 text-muted-foreground">{status}</p></div><button type="button" disabled={!live} onClick={() => busy || listening ? stop() : void start()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 font-medium hover:bg-muted disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : listening ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}{busy ? 'Cancel connection' : listening ? 'Stop listening' : 'Listen to both voices'}</button></div>
    {listening && <label className="flex items-center gap-3 text-muted-foreground">Speaker volume<input aria-label="Speaker volume" type="range" min={0} max={100} value={Math.round(volume * 100)} onChange={event => { const next = Number(event.target.value) / 100; setVolume(next); volumeRef.current = next; for (const node of nodes.current.values()) node.volume = next; }} className="min-w-0 flex-1 accent-primary" /></label>}
    {blocked && listening && <button type="button" className="font-medium text-primary underline" onClick={() => void enableAudio()}>Enable audio</button>}
    {error && <p role="alert" className="text-amber-600 dark:text-amber-400">{error}</p>}
    <div ref={container} hidden />
  </section>;
}
