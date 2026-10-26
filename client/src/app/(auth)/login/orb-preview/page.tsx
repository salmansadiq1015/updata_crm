'use client';

import { UpdataVoiceOrb } from '@/modules/aiCalling/ui/updata-voice-orb';
import { useEffect } from 'react';

export default function OrbPreviewPage() {
  useEffect(() => {
    document.body.dataset.orbPreviewHydrated = 'true';
  }, []);
  return (
    <main className="min-h-screen bg-[#050817] px-10 py-12 text-slate-100">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-bold uppercase tracking-[.24em] text-cyan-300/60">Voice intelligence</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Conversation-reactive orb</h1>
        <div className="mt-10 grid grid-cols-3 gap-5">
          {([
            ['idle', 0, 'Idle'],
            ['connecting', 0, 'Connecting'],
            ['listening', 0.35, 'Listening'],
            ['processing', 0, 'Thinking'],
            ['speaking', 0.8, 'Speaking'],
            ['muted', 0, 'Muted'],
          ] as const).map(([state, audioLevel, title]) => (
            <section key={state} className="relative flex min-h-[440px] flex-col items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-[#090f1f]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(14,165,233,.12),transparent_35%),radial-gradient(circle_at_62%_50%,rgba(168,85,247,.12),transparent_48%)]" />
              <UpdataVoiceOrb state={state} audioLevel={audioLevel} size={300} />
              <div className="relative mt-3 rounded-full border border-white/10 bg-slate-950/50 px-3 py-1 text-[10px] font-bold uppercase tracking-[.2em] text-sky-200">{title}</div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
