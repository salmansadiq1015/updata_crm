'use client';

import { useEffect, useRef, useState } from 'react';
import { AudioLines, MousePointer2, Pause, Play } from 'lucide-react';
import { UpdataVoiceOrb, type UpdataVoiceOrbState } from '@/modules/aiCalling/ui/updata-voice-orb';

const STATES: { state: UpdataVoiceOrbState; label: string; detail: string }[] = [
  { state: 'idle', label: 'Ready', detail: 'A quiet presence. Ready for the next conversation.' },
  { state: 'connecting', label: 'Connecting', detail: 'Establishing a secure audio connection.' },
  { state: 'listening', label: 'Listening', detail: 'Your voice moves the light. Go ahead, we’re listening.' },
  { state: 'processing', label: 'Thinking', detail: 'Connecting the dots. A response is taking shape.' },
  { state: 'speaking', label: 'Speaking', detail: 'Every word becomes a ripple. Watch the conversation flow.' },
  { state: 'muted', label: 'Muted', detail: 'A moment of quiet. Your microphone is muted.' },
  { state: 'reconnecting', label: 'Reconnecting', detail: 'Finding the connection again.' },
  { state: 'error', label: 'Disconnected', detail: 'The session needs attention before continuing.' },
];
const DEMO: UpdataVoiceOrbState[] = ['connecting', 'listening', 'processing', 'speaking', 'listening', 'processing', 'speaking', 'idle'];

export default function OrbPreviewPage() {
  const [state, setState] = useState<UpdataVoiceOrbState>('idle');
  const [demo, setDemo] = useState(false);
  const [paused, setPaused] = useState(false);
  const [intensity, setIntensity] = useState(0.65);
  const settings = useRef({ state, intensity });
  useEffect(() => { settings.current = { state, intensity }; }, [state, intensity]);
  useEffect(() => {
    document.body.dataset.orbPreviewHydrated = 'true';
    return () => { delete document.body.dataset.orbPreviewHydrated; };
  }, []);
  useEffect(() => {
    if (!demo) return;
    let step = 0;
    const timer = window.setInterval(() => {
      step = (step + 1) % DEMO.length;
      setState(DEMO[step]);
    }, 2800);
    return () => window.clearInterval(timer);
  }, [demo]);

  // Synthetic audio is confined to this labelled preview. Calls use real tracks.
  const bands = useRef(new Uint8Array(64));
  function readDemoAudio() {
    const { state, intensity } = settings.current;
    const t = performance.now() / 1000;
    const voice = state === 'speaking' || state === 'listening';
    const envelope = voice ? Math.max(0, Math.sin(t * 3.4) * 0.45 + Math.sin(t * 7.3) * 0.18 + 0.35) * intensity : 0;
    for (let i = 0; i < bands.current.length; i += 1) {
      bands.current[i] = envelope * 255 * (0.35 + Math.abs(Math.sin(i * 0.22 + t * 2.6)) * 0.65) * (1 - i / 90);
    }
    return { level: envelope, bands: bands.current, source: state === 'speaking' ? 'agent' as const : 'user' as const };
  }
  const current = STATES.find((item) => item.state === state)!;

  return (
    <main className="dark min-h-screen bg-[#060a14] px-4 py-6 text-slate-100 sm:px-10 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/8 pb-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-cyan-300/15 bg-cyan-300/5 p-2.5"><AudioLines className="h-5 w-5 text-cyan-300" /></div>
            <div><p className="text-sm font-semibold">Updata <span className="font-normal text-slate-500">/ Voice studio</span></p><p className="mt-1 text-[10px] uppercase tracking-[.2em] text-slate-500">Interactive visualization preview</p></div>
          </div>
          <span className="text-[10px] text-slate-500">Orb playground</span>
        </header>
        <div className="grid gap-8 py-8 lg:grid-cols-[1fr_300px] lg:gap-12 lg:py-12">
          <section className="relative flex min-w-0 flex-col items-center overflow-hidden rounded-3xl border border-white/8 bg-[radial-gradient(ellipse_at_50%_42%,rgba(79,70,229,.12),transparent_60%)] px-4 pb-8 pt-12 sm:pt-6" aria-label="Orb preview">
            <span className="absolute left-5 top-5 text-[9px] uppercase tracking-[.2em] text-slate-500">Voice presence · 01</span>
            <button type="button" aria-label={paused ? 'Enable orb animation' : 'Pause orb animation'} aria-pressed={paused} onClick={() => setPaused((value) => !value)} className="absolute right-4 top-4 z-10 rounded-full border border-white/10 p-2 text-slate-400 hover:text-white focus-visible:outline-2 focus-visible:outline-cyan-300">
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </button>
            <UpdataVoiceOrb state={state} size={420} getAudio={readDemoAudio} reducedMotion={paused} />
            <div aria-live="polite" aria-atomic="true" className="relative -mt-3 text-center">
              <p className={`mx-auto w-fit rounded-full border border-white/10 bg-white/3 px-3 py-1 text-[9px] font-semibold uppercase tracking-[.2em] ${state === 'speaking' ? 'text-fuchsia-300' : state === 'processing' ? 'text-violet-300' : 'text-cyan-200'}`}>{current.label}</p>
              <h1 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">A little more alive.</h1>
              <p className="mx-auto mt-2 max-w-xs text-xs leading-relaxed text-slate-400">{current.detail}</p>
            </div>
            <p className="mt-8 flex items-center gap-2 text-[10px] text-slate-500 motion-reduce:hidden"><MousePointer2 className="h-3 w-3" />{paused ? 'Visualization paused' : 'Move to explore · Drag to rotate · Tap to ripple'}</p>
          </section>
          <aside className="flex flex-col justify-center">
            <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-cyan-300/70">Made for conversation</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">One presence.<br />Every state.</h2>
            <p className="mt-3 text-xs leading-relaxed text-slate-400">Explore the moments between listening, understanding, and responding.</p>
            <div className="mt-6 grid grid-cols-2 gap-2" role="group" aria-label="Conversation state">
              {STATES.map((item) => <button key={item.state} type="button" aria-pressed={state === item.state} onClick={() => { setDemo(false); setState(item.state); }} className={`rounded-xl border px-3 py-2.5 text-left text-xs transition focus-visible:outline-2 focus-visible:outline-cyan-300 ${state === item.state ? 'border-cyan-300/30 bg-cyan-300/8 text-cyan-100' : 'border-white/8 bg-white/2 text-slate-500 hover:border-white/20 hover:text-slate-200'}`}>{item.label}</button>)}
            </div>
            <label htmlFor="demo-intensity" className="mt-6 flex justify-between text-[10px] text-slate-400">Demo voice intensity <span className="font-mono">{Math.round(intensity * 100)}%</span></label>
            <input id="demo-intensity" type="range" min="0" max="1" step="0.01" value={intensity} onChange={(event) => setIntensity(Number(event.target.value))} className="mt-3 w-full accent-cyan-300" />
            <button type="button" onClick={() => { if (!demo) setState(DEMO[0]); setDemo((value) => !value); }} aria-pressed={demo} className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/15 bg-cyan-300/8 px-4 py-3 text-xs font-semibold text-cyan-100 hover:bg-cyan-300/15 focus-visible:outline-2 focus-visible:outline-cyan-300">{demo ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}{demo ? 'Stop conversation demo' : 'Play conversation demo'}</button>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-600">Simulated audio for preview only. This page does not access your microphone.</p>
            <p className="mt-6 border-t border-white/8 pt-4 text-[10px] leading-relaxed text-slate-500">Keyboard: arrows to rotate, Enter to ripple, Home to reset. Respects your reduced-motion preference.</p>
          </aside>
        </div>
      </div>
    </main>
  );
}
