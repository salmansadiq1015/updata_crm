'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RemoteAudioTrack, RemoteTrack, Room } from 'livekit-client';
import { Loader2, Volume2, VolumeX } from 'lucide-react';
import { readableError } from './calling-agent-primitives';
import { aiCallingApi } from '../services/ai-calling-api';

// Only one listening session across the live card and call drawer. No microphone publishing.
let activeListener: { owner: object; stop: () => void } | null = null;

function setTrackVolume(track: RemoteTrack, node: HTMLMediaElement, volume: number) {
  node.volume = volume;
  (track as RemoteAudioTrack).setVolume?.(volume);
}
export function CallAudioMonitor({ callId, live }: { callId: string; live: boolean }) {
  const instance = useRef({});
  const room = useRef<Room | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const blockedTracks = useRef(new Set<RemoteTrack>());
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
    blockedTracks.current.clear();
    const context = audioContext.current; audioContext.current = null;
    if (context && context.state !== 'closed') { context.onstatechange = null; void context.close().catch(() => {}); }
    if (activeListener?.owner === instance.current) activeListener = null;
    setListening(false); setBusy(false); setBlocked(false); setReconnecting(false); setTrackCount(0);
  }, []);
  useEffect(() => { if (!live) queueMicrotask(stop); return stop; }, [live, callId, stop]);

  const enableAudio = async () => {
    const connection = room.current;
    const generation = operation.current;
    if (!connection) return;
    try {
      // Start every unlock operation inside the click, before the first await.
      await Promise.all([
        audioContext.current?.resume(),
        connection.startAudio(),
        ...[...nodes.current.values()].map(node => node.play()),
      ]);
      if (generation === operation.current) { blockedTracks.current.clear(); setBlocked(false); setError(null); }
    } catch {
      if (generation === operation.current) { setBlocked(true); setError('Your browser paused audio. Tap Enable audio to play both voices.'); }
    }
  };
  const start = async () => {
    activeListener?.stop(); stop();
    const generation = ++operation.current;
    // Browser user activation expires while credentials/WebRTC are loading.
    // Unlock the speaker context NOW and give LiveKit this already-running mix.
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) {
        const context = new Ctor(); audioContext.current = context;
        context.onstatechange = () => { if (generation === operation.current && context.state === 'suspended') setBlocked(true); };
        void context.resume().catch(() => { if (generation === operation.current) setBlocked(true); });
      }
    } catch { /* HTML media playback with an explicit Enable audio fallback. */ }
    const request = new AbortController(); credentialRequest.current = request;
    activeListener = { owner: instance.current, stop }; setBusy(true); setError(null);
    try {
      const credentials = await aiCallingApi.monitorCall(callId, request.signal);
      if (generation !== operation.current) return;
      const { Room, RoomEvent, Track } = await import('livekit-client');
      if (generation !== operation.current) return;
      const connection = new Room({ adaptiveStream: true, dynacast: true,
        ...(audioContext.current ? { webAudioMix: { audioContext: audioContext.current } } : {}),
      });
      room.current = connection;
      const attach = (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Audio || nodes.current.has(track) || room.current !== connection) return;
        const node = track.attach(); node.hidden = true;
        // With Web Audio, volume belongs to the SDK gain node, not the element.
        setTrackVolume(track, node, volumeRef.current);
        nodes.current.set(track, node); container.current?.appendChild(node);
        setTrackCount(nodes.current.size);
        void node.play().then(() => {
          if (room.current !== connection) return;
          blockedTracks.current.delete(track);
          if (!blockedTracks.current.size && connection.canPlaybackAudio && audioContext.current?.state !== 'suspended') setBlocked(false);
        }, () => {
          if (room.current === connection) { blockedTracks.current.add(track); setBlocked(true); }
        });
      };
      connection.on(RoomEvent.TrackSubscribed, attach);
      connection.on(RoomEvent.TrackUnsubscribed, track => { const node = nodes.current.get(track); if (node && room.current === connection) { track.detach(node); node.remove(); nodes.current.delete(track); blockedTracks.current.delete(track); setTrackCount(nodes.current.size); } });
      connection.on(RoomEvent.TrackSubscriptionFailed, () => { if (room.current === connection) setError('A voice track could not be received. Check your connection, then stop listening and retry.'); });
      connection.on(RoomEvent.AudioPlaybackStatusChanged, () => { if (room.current === connection) setBlocked(!connection.canPlaybackAudio || blockedTracks.current.size > 0 || audioContext.current?.state === 'suspended'); });
      connection.on(RoomEvent.Reconnecting, () => { if (room.current === connection) setReconnecting(true); });
      connection.on(RoomEvent.SignalReconnecting, () => { if (room.current === connection) setReconnecting(true); });
      connection.on(RoomEvent.Reconnected, () => { if (room.current === connection) setReconnecting(false); });
      connection.on(RoomEvent.Disconnected, () => { if (room.current === connection) { stop(); setError('Live audio disconnected. Retry while the call is still active.'); } });
      await connection.connect(credentials.url, credentials.token, { autoSubscribe: true, peerConnectionTimeout: 15_000, websocketTimeout: 15_000 });
      if (generation !== operation.current) { await connection.disconnect(); return; }
      // Existing and newly published agent/lead audio tracks are both subscribed.
      for (const participant of connection.remoteParticipants.values()) for (const publication of participant.trackPublications.values()) if (publication.track) attach(publication.track);
      setListening(true);
      // Playback can wait for the first media packet. It must not leave the
      // connection button stuck at "Connecting" when a speaker is silent.
      void connection.startAudio().catch(() => { if (generation === operation.current) setBlocked(true); });
    } catch (cause) {
      if (generation === operation.current) { stop(); setError(readableError(cause)); }
    } finally {
      if (credentialRequest.current === request) credentialRequest.current = null;
      if (generation === operation.current) setBusy(false);
    }
  };
  const status = busy ? 'Connecting to the live conversation…'
    : reconnecting ? 'Reconnecting audio… Your microphone remains off.'
      : listening && blocked ? 'Browser audio is paused. Enable audio to hear the conversation.'
        : listening ? trackCount > 1 ? 'Listening to AI agent and lead · microphone off' : trackCount === 1 ? 'Receiving one voice · waiting for the other voice · microphone off' : 'Connected · waiting for conversation audio · microphone off'
        : live ? 'Hear both voices live through your speakers.' : 'Live audio is available while the call is active.';
  return <section aria-label="Conversation audio" className="space-y-3 rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-medium">Conversation audio</p><p role="status" className="mt-1 text-muted-foreground">{status}</p></div><button type="button" disabled={!live} onClick={() => busy || listening ? stop() : void start()} className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 font-medium hover:bg-muted disabled:opacity-50">{busy ? <Loader2 className="size-4 animate-spin" /> : listening ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}{busy ? 'Cancel connection' : listening ? 'Stop listening' : 'Listen to both voices'}</button></div>
    {listening && <label className="flex items-center gap-3 text-muted-foreground">Speaker volume<input aria-label="Speaker volume" type="range" min={0} max={100} value={Math.round(volume * 100)} onChange={event => { const next = Number(event.target.value) / 100; setVolume(next); volumeRef.current = next; for (const [track, node] of nodes.current) setTrackVolume(track, node, next); }} className="min-w-0 flex-1 accent-primary" /></label>}
    {listening && volume === 0 && <p className="text-muted-foreground">Speaker volume is muted. Raise the slider to hear the call.</p>}
    {blocked && listening && <button type="button" className="font-medium text-primary underline" onClick={() => void enableAudio()}>Enable audio</button>}
    {error && <p role="alert" className="text-amber-600 dark:text-amber-400">{error}</p>}
    <div ref={container} hidden />
  </section>;
}
