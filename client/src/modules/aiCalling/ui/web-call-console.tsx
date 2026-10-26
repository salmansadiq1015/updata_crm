'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Headphones, Info, Loader2, Mic, MicOff,
  PhoneOff, Play, Radio, RotateCcw, Settings2, UserRound, Wifi, WifiOff,
} from 'lucide-react';
import { aiCallingApi } from '../services/ai-calling-api';
import { UpdataVoiceOrb, type UpdataVoiceOrbState } from './updata-voice-orb';
import { createVoiceMeter, type VoiceMeter } from './voice-meter';

type LkParticipant = { isLocal?: boolean; identity?: string; name?: string; kind?: unknown; audioLevel?: number };
// agents-js 1.x publishes captions as text streams on this topic (one stream per segment).
type LkTextStreamReader = AsyncIterable<string> & { info?: { id?: string; attributes?: Record<string, string> } };
type LkTranscriptSegment = { id: string; text: string; final: boolean; firstReceivedTime?: number };

// Minimal shape used from livekit-client. The WebRTC package stays dynamically
// loaded so the dashboard does not download it until a test actually starts.
type LkRoom = {
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void> | void;
  on: (event: string, cb: (...args: unknown[]) => void) => LkRoom;
  remoteParticipants?: Map<string, LkParticipant>;
  localParticipant: {
    identity?: string;
    setMicrophoneEnabled: (on: boolean) => Promise<unknown>;
    getTrackPublication?: (source: string) => { track?: { mediaStreamTrack?: MediaStreamTrack } } | undefined;
  };
  registerTextStreamHandler?: (topic: string, handler: (reader: LkTextStreamReader, from: { identity: string }) => void) => void;
};

/** How long the room may stay without the voice agent before the test says why. */
const AGENT_JOIN_TIMEOUT_MS = 30_000;
const isAgentParticipant = (p?: LkParticipant) => Boolean(p && !p.isLocal && (p.kind === 4 || p.kind === 'agent' || String(p.identity || '').startsWith('agent-')));

export type WebCallPhase = 'idle' | 'starting' | 'connecting' | 'live' | 'reconnecting' | 'ended' | 'error';
export type WebCallStatus = {
  phase: WebCallPhase;
  callId: string | null;
  agentConnected: boolean;
  audioReady: boolean;
  muted: boolean;
  transcriptCount: number;
};

type TranscriptLine = {
  id: string;
  text: string;
  final: boolean;
  role: 'tester' | 'agent';
  order: number;
  atSeconds: number;
};

function formatDuration(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function errorMessage(error: unknown): string {
  const caught = error as {
    name?: string;
    response?: { data?: { error?: { message?: string } } };
    message?: string;
  };
  if (caught?.name === 'NotAllowedError' || /permission|notallowed/i.test(caught?.message || '')) {
    return 'Microphone access was denied. Allow microphone access for this site in your browser settings, then try again.';
  }
  if (caught?.name === 'NotFoundError') {
    return 'No microphone was found. Connect an input device, confirm it is available to the browser, and try again.';
  }
  if (/publication of local track timed out/i.test(caught?.message || '')) {
    return 'Your microphone could not be connected to the call: the voice server did not confirm it within 10 seconds. Check your internet connection and try again.';
  }
  return caught?.response?.data?.error?.message || caught?.message || 'Could not start the browser call';
}

function phaseCopy(
  phase: WebCallPhase,
  agentName: string,
  muted: boolean,
  agentSpeaking: boolean,
  agentThinking: boolean,
  agentConnected: boolean,
  audioReady: boolean,
) {
  if (phase === 'starting') return { title: 'Preparing the real agent', detail: 'Creating an isolated test record and secure room…' };
  if (phase === 'connecting') return { title: 'Connecting secure audio', detail: 'Allow microphone access if your browser asks.' };
  if (phase === 'reconnecting') return { title: 'Restoring the audio session', detail: 'Keep this window open while LiveKit reconnects.' };
  if (phase === 'ended') return { title: 'Test call ended', detail: 'The transcript below is preserved for this test session.' };
  if (phase === 'error') return { title: 'Browser call unavailable', detail: 'Review the error below, then retry when ready.' };
  if (phase === 'live' && !agentConnected) return { title: 'Waiting for the voice agent', detail: 'The secure room is connected, but the agent has not joined yet.' };
  if (phase === 'live' && !audioReady) return { title: `${agentName} joined · waiting for audio`, detail: 'The voice agent is present, but no playable agent audio track has arrived yet.' };
  if (phase === 'live' && agentSpeaking) return { title: `${agentName} is speaking`, detail: 'You can interrupt naturally when the agent finishes a phrase.' };
  if (phase === 'live' && agentThinking) return { title: `${agentName} is thinking`, detail: 'Your answer was received. The agent is preparing the next response.' };
  if (phase === 'live' && muted) return { title: 'Your microphone is muted', detail: `${agentName} can no longer hear your microphone.` };
  if (phase === 'live') return { title: 'Listening — go ahead and talk', detail: 'The agent will follow this campaign’s real questions and rules.' };
  return { title: `Talk to ${agentName}`, detail: 'Use your microphone to test the configured voice and campaign flow.' };
}

/**
 * Real-time browser voice test. It connects the tester's microphone and speaker
 * to the same LiveKit + OpenAI Realtime agent used by a campaign. The server
 * marks its call record as a test, so the selected lead is never updated.
 */
export function WebCallConsole({
  campaignId,
  agentName = 'AI agent',
  disabledReason,
  onStatusChange,
}: {
  campaignId: string;
  agentName?: string;
  disabledReason?: string;
  onStatusChange?: (status: WebCallStatus) => void;
}) {
  const [phase, setPhase] = useState<WebCallPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [agentThinking, setAgentThinking] = useState(false);
  const [voiceActivityLevel, setVoiceActivityLevel] = useState(0);
  const [agentConnected, setAgentConnected] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const roomRef = useRef<LkRoom | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const transcriptScrollRef = useRef<HTMLDivElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const startedAtRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const startingRef = useRef(false);
  const agentWaitRef = useRef<number | null>(null);
  // Real audio levels (agent track + microphone) for the orb, read every frame.
  const meterRef = useRef<VoiceMeter | null>(null);
  const meter = () => (meterRef.current ??= createVoiceMeter());
  // A microphone publish / mute change still waiting for the server. Leaving the room
  // in the middle of it makes livekit-client log "missing track resolver" when the late
  // confirmation arrives, so every exit waits for it (briefly) first.
  const micBusyRef = useRef<Promise<unknown> | null>(null);
  const trackMic = <T,>(work: Promise<T>): Promise<T> => {
    const settled = work.finally(() => { if (micBusyRef.current === settled) micBusyRef.current = null; });
    micBusyRef.current = settled;
    return work;
  };
  const leftRoomsRef = useRef(new WeakSet<LkRoom>());
  const leaveRoom = (room: LkRoom | null | undefined): Promise<void> => {
    if (!room || leftRoomsRef.current.has(room)) return Promise.resolve(); // each room is left once
    leftRoomsRef.current.add(room);
    const pending = micBusyRef.current;
    const wait = pending
      ? Promise.race([pending.catch(() => undefined), new Promise((resolve) => { window.setTimeout(resolve, 4000); })])
      : Promise.resolve();
    return wait.then(() => Promise.resolve(room.disconnect())).then(() => undefined, () => undefined);
  };

  useEffect(() => () => {
    if (agentWaitRef.current) window.clearTimeout(agentWaitRef.current);
    generationRef.current += 1;
    startingRef.current = false;
    const room = roomRef.current;
    roomRef.current = null;
    void leaveRoom(room);
    meterRef.current?.close();
    meterRef.current = null;
  }, []);

  useEffect(() => {
    if (phase !== 'live') return undefined;
    startedAtRef.current ??= Date.now();
    const timer = window.setInterval(() => {
      if (startedAtRef.current) setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (!stickToBottomRef.current) return;
    transcriptEndRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [transcript]);

  useEffect(() => {
    onStatusChange?.({ phase, callId, agentConnected, audioReady, muted, transcriptCount: transcript.length });
  }, [agentConnected, audioReady, callId, muted, onStatusChange, phase, transcript.length]);

  const orbState: UpdataVoiceOrbState = useMemo(() => {
    if (phase === 'error') return 'error';
    if (phase === 'reconnecting') return 'reconnecting';
    if (phase === 'starting') return 'processing';
    if (phase === 'connecting') return 'connecting';
    if (phase !== 'live') return 'idle';
    if (!agentConnected || !audioReady) return 'connecting';
    if (agentSpeaking) return 'speaking';
    if (agentThinking) return 'processing';
    if (muted) return 'muted';
    return 'listening';
  }, [agentConnected, agentSpeaking, agentThinking, audioReady, muted, phase]);

  const copy = phaseCopy(phase, agentName, muted, agentSpeaking, agentThinking, agentConnected, audioReady);
  const active = ['starting', 'connecting', 'live', 'reconnecting'].includes(phase);
  const showConversation = transcript.length > 0 || phase === 'live' || phase === 'reconnecting' || phase === 'ended';

  async function start() {
    if (disabledReason || startingRef.current || active) return;
    startingRef.current = true;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setError(null);
    setTranscript([]);
    setElapsedSeconds(0);
    setCallId(null);
    startedAtRef.current = null;
    stickToBottomRef.current = true;
    setMuted(false);
    setAgentConnected(false);
    setAudioReady(false);
    setAgentSpeaking(false);
    setAgentThinking(false);
    setVoiceActivityLevel(0);
    setConfirmEnd(false);
    setPhase('starting');
    meter().resume(); // inside the click, so the browser allows audio analysis

    try {
      const session = await aiCallingApi.startWebTest(campaignId);
      if (generationRef.current !== generation) return;
      setCallId(session.callId);
      setPhase('connecting');

      const livekit = await import('livekit-client');
      if (generationRef.current !== generation) return;
      const { Room, RoomEvent, Track } = livekit as unknown as {
        Room: new () => LkRoom;
        RoomEvent: Record<string, string>;
        Track: { Kind: { Audio: string }; Source?: { Microphone: string } };
      };
      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (...args: unknown[]) => {
        if (generationRef.current !== generation) return;
        const track = args[0] as { kind: string; attach: (element?: HTMLAudioElement) => HTMLMediaElement; mediaStreamTrack?: MediaStreamTrack };
        if (track.kind === Track.Kind.Audio && audioElRef.current) {
          track.attach(audioElRef.current);
          meter().attach('agent', track.mediaStreamTrack);
          void audioElRef.current.play().catch(() => {
            setError('Agent audio is connected, but browser playback is blocked. Use the audio control in the address bar to allow sound.');
          });
          setAudioReady(true);
          setAgentConnected(true);
        }
      });
      room.on(RoomEvent.ParticipantConnected, (...args: unknown[]) => {
        if (generationRef.current !== generation || !isAgentParticipant(args[0] as LkParticipant)) return;
        setAgentConnected(true);
        if (agentWaitRef.current) window.clearTimeout(agentWaitRef.current);
      });
      room.on(RoomEvent.ParticipantDisconnected, () => {
        if (generationRef.current !== generation) return;
        setAgentConnected([...(room.remoteParticipants?.values() || [])].some(isAgentParticipant));
        setAudioReady(false);
        setAgentSpeaking(false);
        setAgentThinking(false);
        setVoiceActivityLevel(0);
      });
      room.on(RoomEvent.ActiveSpeakersChanged, (...args: unknown[]) => {
        if (generationRef.current !== generation) return;
        const speakers = (args[0] as LkParticipant[]) || [];
        const remoteSpeaker = speakers.find((speaker) => !speaker.isLocal);
        const localSpeaker = speakers.find((speaker) => speaker.isLocal);
        setAgentSpeaking(Boolean(remoteSpeaker));
        setVoiceActivityLevel(Math.max(0, Math.min(1, remoteSpeaker?.audioLevel ?? (localSpeaker?.audioLevel ?? 0) * 0.42)));
        if (remoteSpeaker) setAgentThinking(false);
      });
      const upsertLines = (segments: LkTranscriptSegment[], role: TranscriptLine['role']) => {
        setTranscript((current) => {
          const byId = new Map(current.map((line) => [line.id, line]));
          segments.forEach((segment) => {
            const text = segment.text?.trim();
            if (!text) return;
            const previous = byId.get(segment.id);
            byId.set(segment.id, {
              id: segment.id,
              text,
              final: segment.final,
              role,
              order: previous?.order ?? segment.firstReceivedTime ?? Date.now(),
              atSeconds: previous?.atSeconds ?? Math.max(0, Math.floor((Date.now() - (startedAtRef.current || Date.now())) / 1000)),
            });
          });
          const ordered = [...byId.values()].sort((a, b) => a.order - b.order);
          return ordered.length > 250 ? ordered.slice(ordered.length - 250) : ordered;
        });
      };
      // Current agents send every caption on BOTH channels (text streams and the legacy
      // transcription event) with different ids. The first channel heard in a call is
      // used for the whole call; the other is ignored, so no line is shown twice.
      let captionSource: 'stream' | 'legacy' | null = null;
      const acceptCaptions = (source: 'stream' | 'legacy') => {
        captionSource ??= source;
        return captionSource === source;
      };
      // Legacy transcription events (older agents).
      room.on(RoomEvent.TranscriptionReceived, (...args: unknown[]) => {
        if (generationRef.current !== generation || !acceptCaptions('legacy')) return;
        const participant = args[1] as LkParticipant | undefined;
        const segments = (args[0] as LkTranscriptSegment[]) || [];
        const tester = Boolean(participant?.isLocal);
        upsertLines(segments, tester ? 'tester' : 'agent');
        if (!tester && segments.some((segment) => segment.text?.trim())) setAgentThinking(false);
        if (tester && segments.some((segment) => segment.final && segment.text?.trim())) setAgentThinking(true);
      });
      // Current agents: text streams on "lk.transcription". The agent's own captions
      // arrive as deltas; the tester's transcript arrives as the full text so far.
      const streamText: Record<string, string> = {};
      room.registerTextStreamHandler?.('lk.transcription', (reader, from) => {
        if (generationRef.current !== generation || !acceptCaptions('stream')) return;
        const id = reader.info?.attributes?.['lk.segment_id'] || reader.info?.id || `seg-${Date.now()}`;
        const tester = from?.identity === room.localParticipant.identity;
        const final = reader.info?.attributes?.['lk.transcription_final'] === 'true';
        let text = tester ? '' : (streamText[id] || '');
        void (async () => {
          try {
            for await (const chunk of reader) {
              if (generationRef.current !== generation) return;
              text += chunk;
              streamText[id] = text;
              upsertLines([{ id, text, final, firstReceivedTime: Date.now() }], tester ? 'tester' : 'agent');
              if (tester && final) setAgentThinking(true);
              if (!tester) setAgentThinking(false);
            }
            // The stream closed: this line is complete (no lingering "partial" tag).
            if (generationRef.current === generation && text.trim()) {
              upsertLines([{ id, text, final: true, firstReceivedTime: Date.now() }], tester ? 'tester' : 'agent');
            }
          } catch { /* stream closed with the room */ }
        })();
      });
      room.on(RoomEvent.Reconnecting, () => {
        if (generationRef.current === generation) setPhase('reconnecting');
      });
      room.on(RoomEvent.Reconnected, () => {
        if (generationRef.current === generation) setPhase('live');
      });
      room.on(RoomEvent.Disconnected, () => {
        if (generationRef.current !== generation) return;
        roomRef.current = null;
        startingRef.current = false;
        meterRef.current?.detach('agent');
    meterRef.current?.detach('user');
    setPhase('ended');
        setAgentSpeaking(false);
        setAgentThinking(false);
        setVoiceActivityLevel(0);
        setAgentConnected(false);
        setAudioReady(false);
      });

      await room.connect(session.url, session.token);
      if (generationRef.current !== generation) {
        await leaveRoom(room);
        return;
      }
      setAgentConnected([...(room.remoteParticipants?.values() || [])].some(isAgentParticipant));
      await trackMic(room.localParticipant.setMicrophoneEnabled(true));
      meter().attach('user', room.localParticipant.getTrackPublication?.(Track.Source?.Microphone || 'microphone')?.track?.mediaStreamTrack);
      if (generationRef.current !== generation) {
        await leaveRoom(room);
        return;
      }
      startingRef.current = false;
      setPhase('live');
      // No agent after the timeout: stop and say what to check, instead of waiting forever.
      if (agentWaitRef.current) window.clearTimeout(agentWaitRef.current);
      agentWaitRef.current = window.setTimeout(() => {
        if (generationRef.current !== generation || [...(room.remoteParticipants?.values() || [])].some(isAgentParticipant)) return;
        generationRef.current += 1;
        roomRef.current = null;
        void leaveRoom(room);
        setError('The voice agent did not join the room. Make sure the agent worker is running (cd server/agent-worker && npm run dev) and that its LIVEKIT_AGENT_NAME and LiveKit project match the API.');
        setAgentThinking(false);
        setVoiceActivityLevel(0);
        setAgentConnected(false);
        setAudioReady(false);
        setPhase('error');
      }, AGENT_JOIN_TIMEOUT_MS);
    } catch (caught) {
      if (generationRef.current !== generation) return;
      const room = roomRef.current;
      roomRef.current = null;
      await leaveRoom(room); // never throws: the useful startup error is kept
      startingRef.current = false;
      setError(errorMessage(caught));
      setAgentThinking(false);
      setVoiceActivityLevel(0);
      setAgentConnected(false);
      setAudioReady(false);
      meterRef.current?.detach('agent');
      meterRef.current?.detach('user');
      setPhase('error');
    }
  }

  async function toggleMute() {
    const room = roomRef.current;
    if (!room || micBusyRef.current) return; // one microphone change at a time
    const nextMuted = !muted;
    try {
      await trackMic(room.localParticipant.setMicrophoneEnabled(!nextMuted));
      setMuted(nextMuted);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function hangUp() {
    if (agentWaitRef.current) window.clearTimeout(agentWaitRef.current);
    generationRef.current += 1;
    startingRef.current = false;
    const room = roomRef.current;
    roomRef.current = null;
    await leaveRoom(room); // local termination always succeeds
    setConfirmEnd(false);
    meterRef.current?.detach('agent');
    meterRef.current?.detach('user');
    setPhase('ended');
    setAgentSpeaking(false);
    setAgentThinking(false);
    setVoiceActivityLevel(0);
    setAgentConnected(false);
    setAudioReady(false);
  }

  function onTranscriptScroll() {
    const node = transcriptScrollRef.current;
    if (!node) return;
    stickToBottomRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 56;
  }

  const connectionTone = phase === 'live'
    ? 'bg-emerald-400'
    : phase === 'reconnecting' || phase === 'error'
      ? 'bg-amber-400'
      : phase === 'starting' || phase === 'connecting'
        ? 'bg-blue-400'
        : 'bg-slate-500';

  return (
    <div className="flex h-full min-h-[520px] flex-col bg-[#090f1f] text-slate-100">
      <audio ref={audioElRef} autoPlay className="hidden" />

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/8 bg-[#0b1223] px-4 py-3 text-xs">
        <div className="flex items-center gap-2 font-semibold">
          <span className={cnStatusDot(connectionTone, phase === 'live')} />
          {phase === 'live' ? 'Live browser call' : phase === 'reconnecting' ? 'Reconnecting' : active ? 'Starting browser call' : 'Private browser test'}
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            {agentConnected ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> : <Wifi className="h-3.5 w-3.5" />}
            Agent {agentConnected ? 'connected' : 'waiting'}
          </span>
          <span className="hidden items-center gap-1.5 sm:inline-flex">
            <Headphones className={`h-3.5 w-3.5 ${audioReady ? 'text-emerald-400' : ''}`} />
            Audio {audioReady ? 'ready' : 'pending'}
          </span>
          <span className="font-mono text-sm font-semibold tabular-nums text-slate-200" aria-label={`Call duration ${formatDuration(elapsedSeconds)}`}>
            {formatDuration(elapsedSeconds)}
          </span>
        </div>
      </div>

      <div className="relative flex shrink-0 flex-col items-center justify-center overflow-hidden border-b border-white/8 px-4 py-6 text-center sm:min-h-[388px]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_36%,rgba(14,165,233,.12),transparent_30%),radial-gradient(circle_at_56%_46%,rgba(168,85,247,.13),transparent_42%),linear-gradient(180deg,rgba(15,23,42,.18),rgba(2,6,23,.22))]" />
        <div className="pointer-events-none absolute inset-0 opacity-[.16] [background-image:linear-gradient(rgba(125,211,252,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(125,211,252,.08)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(circle_at_center,black,transparent_72%)]" />
        <UpdataVoiceOrb
          state={orbState}
          audioLevel={voiceActivityLevel}
          getAudio={active ? () => meterRef.current?.read() ?? null : undefined}
          size={phase === 'idle' || phase === 'ended' ? 200 : 'lg'}
        />
        <div className="relative mt-3">
          {active ? (
            <div className="mx-auto mb-2 flex w-fit items-center gap-2 rounded-full border border-sky-300/10 bg-slate-950/45 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.18em] text-sky-200/70 backdrop-blur-sm">
              <span className={`h-1.5 w-1.5 rounded-full ${orbState === 'speaking' ? 'bg-fuchsia-400 shadow-[0_0_8px_#e879f9]' : orbState === 'processing' ? 'bg-violet-400 shadow-[0_0_8px_#a78bfa]' : 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]'}`} />
              {orbState === 'processing' ? 'Thinking' : orbState === 'speaking' ? 'Voice active' : orbState === 'listening' ? 'Listening' : 'Establishing link'}
            </div>
          ) : null}
          <p className="text-base font-semibold tracking-tight">{copy.title}</p>
          <p className="mx-auto mt-1 max-w-lg text-xs leading-relaxed text-slate-400">{disabledReason || copy.detail}</p>
        </div>

        {error ? (
          <div role="alert" className="relative mt-3 flex max-w-lg items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/8 px-3 py-2 text-left text-xs text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="relative mt-4 flex flex-wrap items-center justify-center gap-2">
          {(phase === 'idle' || phase === 'ended' || phase === 'error') ? (
            <button
              type="button"
              onClick={start}
              disabled={Boolean(disabledReason) || active}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-950/30 transition hover:from-blue-500 hover:to-indigo-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {phase === 'ended' || phase === 'error' ? <RotateCcw className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
              {phase === 'ended' || phase === 'error' ? 'Test again' : 'Start test session'}
            </button>
          ) : null}

          {(phase === 'starting' || phase === 'connecting') ? (
            <span role="status" aria-live="polite" className="inline-flex h-10 items-center gap-2 rounded-xl border border-blue-400/15 bg-blue-400/8 px-4 text-sm text-blue-100">
              <Loader2 className="h-4 w-4 animate-spin" /> {phase === 'starting' ? 'Preparing…' : 'Connecting…'}
            </span>
          ) : null}

          {(phase === 'live' || phase === 'reconnecting') ? (
            <>
              <button
                type="button"
                onClick={toggleMute}
                disabled={phase !== 'live'}
                aria-pressed={muted}
                className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400 disabled:opacity-45 ${muted ? 'border-amber-400/30 bg-amber-400/10 text-amber-200' : 'border-white/12 bg-white/4 text-slate-200 hover:bg-white/8'}`}
              >
                {muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />} {muted ? 'Unmute' : 'Mute'}
              </button>
              <button
                type="button"
                onClick={() => setDiagnosticsOpen((open) => !open)}
                aria-expanded={diagnosticsOpen}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/12 bg-white/4 px-3 text-sm font-medium text-slate-200 transition hover:bg-white/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
              >
                <Settings2 className="h-4 w-4" /> Diagnostics
              </button>
              <button
                type="button"
                onClick={() => setConfirmEnd(true)}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-400"
              >
                <PhoneOff className="h-4 w-4" /> End test
              </button>
            </>
          ) : null}
        </div>

        {confirmEnd ? (
          <div role="alertdialog" aria-label="End test session" className="relative mt-3 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-rose-400/20 bg-[#141225] px-3 py-2 text-xs shadow-xl">
            <span className="mr-1 text-slate-300">End this browser test now?</span>
            <button type="button" onClick={() => setConfirmEnd(false)} className="rounded-lg px-2.5 py-1.5 font-semibold text-slate-300 hover:bg-white/8">Keep talking</button>
            <button type="button" onClick={hangUp} className="rounded-lg bg-rose-600 px-2.5 py-1.5 font-semibold text-white hover:bg-rose-500">End now</button>
          </div>
        ) : null}

        {diagnosticsOpen ? (
          <dl className="relative mt-3 grid w-full max-w-xl grid-cols-2 gap-2 rounded-xl border border-white/8 bg-black/20 p-3 text-left text-[11px] sm:grid-cols-4">
            <Diagnostic label="Room" value={phase === 'live' ? 'connected' : phase} healthy={phase === 'live'} />
            <Diagnostic label="Voice agent" value={agentConnected ? 'connected' : 'not connected'} healthy={agentConnected} />
            <Diagnostic label="Agent audio" value={audioReady ? 'subscribed' : 'not received'} healthy={audioReady} />
            <Diagnostic label="Microphone" value={muted ? 'muted' : phase === 'live' ? 'published' : 'not published'} healthy={phase === 'live' && !muted} />
          </dl>
        ) : null}
      </div>

      {showConversation ? (
        <section aria-labelledby="live-transcript-heading" className="flex min-h-[220px] flex-1 flex-col bg-[#0b1223]">
          <div className="flex shrink-0 items-center justify-between border-b border-white/8 px-4 py-3">
            <div className="flex items-center gap-2">
              <Radio className="h-4 w-4 text-blue-400" />
              <h2 id="live-transcript-heading" className="text-[11px] font-semibold uppercase tracking-[.16em] text-slate-300">Live conversation</h2>
            </div>
            <span className="text-[11px] text-slate-500">Real session transcript · {transcript.length} turn{transcript.length === 1 ? '' : 's'}</span>
          </div>
          <div
            ref={transcriptScrollRef}
            onScroll={onTranscriptScroll}
            className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5"
            aria-live="polite"
          >
            {transcript.length === 0 ? (
              <div className="flex h-full min-h-32 flex-col items-center justify-center text-center text-slate-500">
                <Radio className="h-5 w-5" />
                <p className="mt-2 text-xs">Conversation text will appear here only after you or the agent speaks.</p>
                <p className="mt-1 text-[11px]">If audio works but text never appears, transcription may be unavailable for this session.</p>
              </div>
            ) : transcript.map((line) => (
              <div key={line.id} className={`flex items-start gap-2 ${line.role === 'tester' ? 'justify-end' : 'justify-start'}`}>
                {line.role === 'agent' ? <UpdataVoiceOrb state={line.final ? 'idle' : 'speaking'} size="compact" className="mt-0.5" /> : null}
                <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                  line.role === 'tester'
                    ? 'rounded-tr-md bg-blue-600 text-white'
                    : 'rounded-tl-md border border-white/9 bg-white/5 text-slate-100'
                } ${line.final ? '' : 'opacity-65'}`}>
                  <div className="mb-1 flex items-center justify-between gap-4 text-[10px] font-semibold uppercase tracking-wider opacity-70">
                    <span>{line.role === 'tester' ? 'You' : agentName}</span>
                    <span className="font-mono normal-case tabular-nums">{formatDuration(line.atSeconds)}{line.final ? '' : ' · partial'}</span>
                  </div>
                  <p>{line.text}</p>
                </div>
                {line.role === 'tester' ? <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-700"><UserRound className="h-3.5 w-3.5 text-slate-300" /></span> : null}
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        </section>
      ) : (
        <div className="flex min-h-[160px] flex-1 items-center justify-center border-t border-white/5 bg-[#0b1223] p-6 text-center">
          <div className="max-w-md text-xs leading-relaxed text-slate-500">
            <Info className="mx-auto mb-2 h-4 w-4" />
            This is an isolated browser test: no phone number is dialled and production lead data is not changed.
          </div>
        </div>
      )}
    </div>
  );
}

function cnStatusDot(color: string, live: boolean) {
  return `relative inline-flex h-2 w-2 shrink-0 rounded-full ${color} ${live ? 'shadow-[0_0_10px_rgba(52,211,153,.7)]' : ''}`;
}

function Diagnostic({ label, value, healthy }: { label: string; value: string; healthy: boolean }) {
  return (
    <div className="rounded-lg bg-white/4 px-2.5 py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`mt-0.5 flex items-center gap-1 font-medium ${healthy ? 'text-emerald-300' : 'text-slate-300'}`}>
        {healthy ? <CheckCircle2 className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}{value}
      </dd>
    </div>
  );
}
