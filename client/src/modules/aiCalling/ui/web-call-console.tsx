'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, PhoneOff, Loader2, Radio, Bot, AlertTriangle, Play } from 'lucide-react';
import { showError } from '@/lib/toast';
import { aiCallingApi } from '../services/ai-calling-api';

// Minimal shape we use from livekit-client (loaded dynamically so it never runs on the server).
type LkRoom = {
  connect: (url: string, token: string) => Promise<void>;
  disconnect: () => Promise<void> | void;
  on: (event: string, cb: (...args: unknown[]) => void) => LkRoom;
  localParticipant: { setMicrophoneEnabled: (on: boolean) => Promise<unknown> };
};

type Phase = 'idle' | 'starting' | 'connecting' | 'live' | 'ended' | 'error';

/**
 * Real-time browser voice test. Starts a LiveKit room with the agent dispatched
 * into it, then connects the admin's browser (mic + speaker) to speak with the
 * AI exactly as a lead would — no phone, no SIP. Needs LiveKit + OpenAI
 * configured and the agent worker running; otherwise it reports that honestly and
 * points to the text Simulate tab (it never fakes a call).
 */
export function WebCallConsole({ campaignId }: { campaignId: string }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const roomRef = useRef<LkRoom | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => () => { try { roomRef.current?.disconnect(); } catch { /* noop */ } }, []);

  async function start() {
    setError(null);
    setPhase('starting');
    try {
      const session = await aiCallingApi.startWebTest(campaignId);
      setPhase('connecting');

      const livekit = await import('livekit-client');
      const { Room, RoomEvent, Track } = livekit as unknown as {
        Room: new () => LkRoom; RoomEvent: Record<string, string>; Track: { Kind: { Audio: string } };
      };
      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (...args: unknown[]) => {
        const track = args[0] as { kind: string; attach: (el?: HTMLAudioElement) => HTMLMediaElement };
        if (track.kind === Track.Kind.Audio && audioElRef.current) {
          track.attach(audioElRef.current);
          audioElRef.current.play().catch(() => { /* autoplay may need a gesture; user already clicked */ });
        }
      });
      room.on(RoomEvent.ActiveSpeakersChanged, (...args: unknown[]) => {
        const speakers = (args[0] as Array<{ isLocal?: boolean }>) || [];
        setAgentSpeaking(speakers.some((s) => !s.isLocal));
      });
      room.on(RoomEvent.Disconnected, () => { setPhase('ended'); setAgentSpeaking(false); });

      await room.connect(session.url, session.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setPhase('live');
    } catch (e: unknown) {
      const message = (e as { response?: { data?: { error?: { message?: string } } }; message?: string })
        ?.response?.data?.error?.message
        || (e as { message?: string })?.message
        || 'Could not start the browser call';
      setError(message);
      setPhase('error');
    }
  }

  async function hangUp() {
    try { await roomRef.current?.disconnect(); } catch { /* noop */ }
    setPhase('ended');
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-4 text-center">
      <audio ref={audioElRef} autoPlay className="hidden" />

      {phase === 'idle' || phase === 'ended' ? (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/10 ring-1 ring-brand-500/20">
            <Bot className="h-8 w-8 text-brand-500" />
          </div>
          <div>
            <p className="text-sm font-semibold">{phase === 'ended' ? 'Call ended' : 'Talk to your AI agent'}</p>
            <p className="mt-1 max-w-xs text-xs text-muted-foreground">
              Starts a real voice call in your browser using the campaign&apos;s questions, agent and voice. Needs LiveKit + OpenAI configured and the worker running.
            </p>
          </div>
          <button type="button" onClick={start} className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
            <Play className="h-4 w-4" /> {phase === 'ended' ? 'Call again' : 'Start browser call'}
          </button>
        </>
      ) : null}

      {phase === 'starting' || phase === 'connecting' ? (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
          <p className="text-sm text-muted-foreground">{phase === 'starting' ? 'Dispatching the agent…' : 'Connecting audio…'}</p>
        </>
      ) : null}

      {phase === 'live' ? (
        <>
          <div className={`flex h-20 w-20 items-center justify-center rounded-full ring-4 transition ${agentSpeaking ? 'bg-emerald-500/15 ring-emerald-500/40' : 'bg-brand-500/10 ring-brand-500/20'}`}>
            {agentSpeaking ? <Radio className="h-9 w-9 text-emerald-500 animate-pulse" /> : <Mic className="h-9 w-9 text-brand-500" />}
          </div>
          <div>
            <p className="text-sm font-semibold">{agentSpeaking ? 'Agent speaking…' : 'Listening — go ahead and talk'}</p>
            <p className="mt-1 text-xs text-muted-foreground">Your microphone is live. Speak as if you were the lead.</p>
          </div>
          <button type="button" onClick={hangUp} className="inline-flex items-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-600">
            <PhoneOff className="h-4 w-4" /> Hang up
          </button>
        </>
      ) : null}

      {phase === 'error' ? (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10 ring-1 ring-amber-500/20">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
          </div>
          <div>
            <p className="text-sm font-semibold">Browser call unavailable</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">{error}</p>
            <p className="mt-2 text-xs text-muted-foreground">Use the <strong>Simulate</strong> tab to test the questions and rules with no telephony.</p>
          </div>
          <button type="button" onClick={start} className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted">Try again</button>
        </>
      ) : null}
    </div>
  );
}
