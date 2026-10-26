import type { UpdataVoiceOrbAudio } from './updata-voice-orb';

type Who = 'agent' | 'user';
type Tap = { source: MediaStreamAudioSourceNode; analyser: AnalyserNode; freq: Uint8Array<ArrayBuffer>; time: Uint8Array<ArrayBuffer>; track: MediaStreamTrack };

/**
 * Real audio levels for the voice orb: one AnalyserNode on the agent's audio
 * track and one on the tester's microphone (analysis only — never connected to
 * the speakers). `read()` is cheap and is called on every animation frame by
 * the orb; it returns whoever is louder, with frequency bands for the ring.
 */
export function createVoiceMeter() {
  let context: AudioContext | null = null;
  const taps: Record<Who, Tap | null> = { agent: null, user: null };

  function ensure(): AudioContext | null {
    if (context && context.state !== 'closed') return context;
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      context = Ctor ? new Ctor() : null;
    } catch {
      context = null;
    }
    return context;
  }

  function level(tap: Tap | null): number {
    if (!tap || tap.track.readyState === 'ended' || !tap.track.enabled) return 0;
    tap.analyser.getByteTimeDomainData(tap.time);
    let sum = 0;
    for (let i = 0; i < tap.time.length; i += 1) {
      const v = (tap.time[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / tap.time.length) * 4);
  }

  return {
    /** Call inside the click that starts the call so the browser allows audio processing. */
    resume() {
      const ctx = ensure();
      if (ctx?.state === 'suspended') void ctx.resume().catch(() => {});
    },
    attach(who: Who, track: MediaStreamTrack | undefined | null) {
      const ctx = ensure();
      if (!ctx || !track) return;
      this.detach(who);
      try {
        const source = ctx.createMediaStreamSource(new MediaStream([track]));
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.72;
        source.connect(analyser);
        taps[who] = { source, analyser, freq: new Uint8Array(analyser.frequencyBinCount), time: new Uint8Array(analyser.fftSize), track };
      } catch {
        taps[who] = null;
      }
    },
    detach(who: Who) {
      try { taps[who]?.source.disconnect(); } catch { /* already gone */ }
      taps[who] = null;
    },
    read(): UpdataVoiceOrbAudio | null {
      const agent = level(taps.agent);
      const user = level(taps.user);
      if (!taps.agent && !taps.user) return null;
      const who: Who = agent >= user * 0.8 ? 'agent' : 'user';
      const tap = taps[who];
      if (tap) tap.analyser.getByteFrequencyData(tap.freq);
      return { level: who === 'agent' ? agent : user, bands: tap?.freq, source: who };
    },
    close() {
      this.detach('agent');
      this.detach('user');
      void context?.close().catch(() => {});
      context = null;
    },
  };
}

export type VoiceMeter = ReturnType<typeof createVoiceMeter>;
