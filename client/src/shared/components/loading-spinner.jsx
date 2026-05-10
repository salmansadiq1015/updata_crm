'use client';

import { cn } from '@/lib/utils';
import { Zap } from 'lucide-react';

export function LoadingSpinner({ className, size = 'default' }) {
  const sizeClass = { sm: 'h-4 w-4', default: 'h-6 w-6', lg: 'h-10 w-10' }[size];
  const ringSize = { sm: 'h-8 w-8', default: 'h-12 w-12', lg: 'h-20 w-20' }[size];

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div className="relative">
        <div className={cn('rounded-full border-2 border-muted border-t-primary animate-spin', ringSize)} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Zap className={cn('text-primary', sizeClass)} />
        </div>
      </div>
    </div>
  );
}

// Fixed particle positions — no Math.random() to avoid hydration mismatch
const PARTICLES = [
  { id: 0,  x: 7,  y: 14, s: 2,   delay: 0,   dur: 6.2, c: '#7B61FF' },
  { id: 1,  x: 91, y: 21, s: 1.5, delay: 1.1, dur: 7.4, c: '#00D4FF' },
  { id: 2,  x: 14, y: 76, s: 2.5, delay: 2.3, dur: 5.1, c: '#9F7AEA' },
  { id: 3,  x: 86, y: 67, s: 1,   delay: 0.5, dur: 8.3, c: '#7B61FF' },
  { id: 4,  x: 44, y: 7,  s: 2,   delay: 3.1, dur: 6.7, c: '#00D4FF' },
  { id: 5,  x: 56, y: 93, s: 1.5, delay: 1.7, dur: 7.1, c: '#9F7AEA' },
  { id: 6,  x: 27, y: 41, s: 1,   delay: 2.6, dur: 5.8, c: '#7B61FF' },
  { id: 7,  x: 73, y: 37, s: 2,   delay: 0.9, dur: 6.4, c: '#00D4FF' },
  { id: 8,  x: 4,  y: 56, s: 1.5, delay: 3.7, dur: 7.9, c: '#9F7AEA' },
  { id: 9,  x: 96, y: 44, s: 2,   delay: 1.3, dur: 5.3, c: '#7B61FF' },
  { id: 10, x: 34, y: 89, s: 1,   delay: 4.2, dur: 8.1, c: '#00D4FF' },
  { id: 11, x: 66, y: 11, s: 2.5, delay: 0.4, dur: 6.0, c: '#9F7AEA' },
  { id: 12, x: 21, y: 24, s: 1.5, delay: 2.0, dur: 7.2, c: '#7B61FF' },
  { id: 13, x: 79, y: 81, s: 2,   delay: 1.9, dur: 5.6, c: '#00D4FF' },
  { id: 14, x: 11, y: 91, s: 2.5, delay: 0.8, dur: 7.0, c: '#9F7AEA' },
  { id: 15, x: 89, y: 9,  s: 1.5, delay: 2.4, dur: 8.2, c: '#7B61FF' },
  { id: 16, x: 41, y: 61, s: 2,   delay: 4.6, dur: 5.0, c: '#00D4FF' },
  { id: 17, x: 63, y: 73, s: 1,   delay: 1.6, dur: 6.6, c: '#9F7AEA' },
  { id: 18, x: 24, y: 4,  s: 2,   delay: 3.3, dur: 7.7, c: '#7B61FF' },
  { id: 19, x: 52, y: 48, s: 1.5, delay: 0.2, dur: 5.9, c: '#00D4FF' },
];

const KEYFRAMES = `
  @keyframes pl-float {
    0%, 100% { transform: translateY(0px) translateX(0px); }
    33%  { transform: translateY(-14px) translateX(6px); }
    66%  { transform: translateY(7px)  translateX(-5px); }
  }
  @keyframes pl-orbit-a {
    from { transform: perspective(500px) rotateX(72deg) rotateZ(0deg); }
    to   { transform: perspective(500px) rotateX(72deg) rotateZ(360deg); }
  }
  @keyframes pl-orbit-b {
    from { transform: perspective(500px) rotateX(72deg) rotateZ(60deg); }
    to   { transform: perspective(500px) rotateX(72deg) rotateZ(-300deg); }
  }
  @keyframes pl-orbit-c {
    from { transform: perspective(500px) rotateX(72deg) rotateZ(120deg); }
    to   { transform: perspective(500px) rotateX(72deg) rotateZ(480deg); }
  }
  @keyframes pl-pulse-out {
    0%   { transform: scale(1);   opacity: 0.35; }
    100% { transform: scale(2.6); opacity: 0; }
  }
  @keyframes pl-glow {
    0%, 100% { box-shadow: 0 0 28px rgba(123,97,255,0.55), 0 0 60px rgba(123,97,255,0.18), inset 0 1px 0 rgba(255,255,255,0.22); }
    50%       { box-shadow: 0 0 48px rgba(123,97,255,0.80), 0 0 90px rgba(123,97,255,0.30), inset 0 1px 0 rgba(255,255,255,0.28); }
  }
  @keyframes pl-icon {
    0%, 100% { filter: drop-shadow(0 0 6px rgba(255,255,255,0.9)); }
    50%       { filter: drop-shadow(0 0 18px rgba(255,255,255,1)) drop-shadow(0 0 34px rgba(123,97,255,0.8)); }
  }
  @keyframes pl-shimmer {
    0%   { background-position: -250% center; }
    100% { background-position: 250% center; }
  }
  @keyframes pl-blink {
    0%, 100% { opacity: 0.45; }
    50%       { opacity: 0.75; }
  }
  @keyframes pl-bar {
    0%   { width: 0%; }
    15%  { width: 18%; }
    35%  { width: 38%; }
    55%  { width: 56%; }
    75%  { width: 70%; }
    90%  { width: 80%; }
    100% { width: 84%; }
  }
  @keyframes pl-fade-up {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes pl-blob-1 {
    0%, 100% { transform: translate(0,   0)   scale(1); }
    40%       { transform: translate(32px,-22px) scale(1.1); }
    70%       { transform: translate(-18px,14px) scale(0.95); }
  }
  @keyframes pl-blob-2 {
    0%, 100% { transform: translate(0,   0)   scale(1); }
    35%       { transform: translate(-28px,20px) scale(1.05); }
    65%       { transform: translate(16px,-12px) scale(1.1); }
  }
  .pl-ring {
    position: absolute; inset: 0; margin: auto;
    border-radius: 50%;
    border: 1.5px solid transparent;
  }
  .pl-ring-a {
    width: 168px; height: 168px;
    background:
      linear-gradient(#080E1C, #080E1C) padding-box,
      linear-gradient(145deg, #7B61FF 0%, #00D4FF 45%, transparent 70%) border-box;
    animation: pl-orbit-a 4.2s linear infinite;
  }
  .pl-ring-b {
    width: 134px; height: 134px;
    background:
      linear-gradient(#080E1C, #080E1C) padding-box,
      linear-gradient(235deg, #00D4FF 0%, #9F7AEA 50%, transparent 70%) border-box;
    animation: pl-orbit-b 3.1s linear infinite;
  }
  .pl-ring-c {
    width: 104px; height: 104px;
    background:
      linear-gradient(#080E1C, #080E1C) padding-box,
      linear-gradient(325deg, #9F7AEA 0%, #7B61FF 45%, transparent 70%) border-box;
    animation: pl-orbit-c 5.4s linear infinite;
  }
  .pl-shimmer {
    background: linear-gradient(
      90deg,
      #c8bfff 0%,
      #ffffff 20%,
      #7B61FF 38%,
      #ffffff 50%,
      #00D4FF 62%,
      #ffffff 78%,
      #c8bfff 100%
    );
    background-size: 220% auto;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: pl-shimmer 3.4s linear infinite;
  }
`;

export function FullPageSpinner() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      {/* Root */}
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#080E1C',
        overflow: 'hidden', zIndex: 9999,
      }}>

        {/* Ambient gradient blobs */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', top: '15%', left: '18%',
            width: '45vw', height: '45vw',
            background: 'radial-gradient(circle, rgba(123,97,255,0.09) 0%, transparent 68%)',
            animation: 'pl-blob-1 9s ease-in-out infinite',
          }} />
          <div style={{
            position: 'absolute', bottom: '12%', right: '16%',
            width: '38vw', height: '38vw',
            background: 'radial-gradient(circle, rgba(0,212,255,0.07) 0%, transparent 68%)',
            animation: 'pl-blob-2 11s ease-in-out infinite',
          }} />
        </div>

        {/* Particle field */}
        {PARTICLES.map((p) => (
          <div key={p.id} style={{
            position: 'absolute',
            left: `${p.x}%`, top: `${p.y}%`,
            width: `${p.s}px`, height: `${p.s}px`,
            borderRadius: '50%',
            backgroundColor: p.c,
            opacity: 0.28 + (p.id % 4) * 0.08,
            animation: `pl-float ${p.dur}s ease-in-out ${p.delay}s infinite`,
          }} />
        ))}

        {/* Content column */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '36px', position: 'relative' }}>

          {/* ── Orbital ring system ── */}
          <div style={{
            position: 'relative',
            width: '192px', height: '192px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>

            {/* Pulse rings */}
            {[0, 0.9, 1.8].map((delay) => (
              <div key={delay} style={{
                position: 'absolute', inset: 0, margin: 'auto',
                width: '76px', height: '76px',
                borderRadius: '50%',
                border: '1px solid rgba(123,97,255,0.4)',
                animation: `pl-pulse-out 2.7s ease-out ${delay}s infinite`,
              }} />
            ))}

            {/* Orbital rings */}
            <div className="pl-ring pl-ring-a" />
            <div className="pl-ring pl-ring-b" />
            <div className="pl-ring pl-ring-c" />

            {/* Core sphere */}
            <div style={{
              position: 'absolute', inset: 0, margin: 'auto',
              width: '76px', height: '76px',
              borderRadius: '50%',
              background: 'radial-gradient(circle at 33% 30%, rgba(150,120,255,0.95) 0%, rgba(80,50,180,0.98) 55%, rgba(18,12,52,1) 100%)',
              animation: 'pl-glow 2.2s ease-in-out infinite',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              {/* Specular highlight */}
              <div style={{
                position: 'absolute', top: '10%', left: '15%',
                width: '38%', height: '26%',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(255,255,255,0.32) 0%, transparent 100%)',
                pointerEvents: 'none',
              }} />
              {/* Secondary glint */}
              <div style={{
                position: 'absolute', bottom: '14%', right: '12%',
                width: '18%', height: '12%',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(0,212,255,0.25) 0%, transparent 100%)',
                pointerEvents: 'none',
              }} />
              {/* Icon */}
              <Zap
                fill="white"
                strokeWidth={1}
                style={{
                  width: '30px', height: '30px',
                  color: 'white',
                  animation: 'pl-icon 2.2s ease-in-out infinite',
                  position: 'relative', zIndex: 1,
                }}
              />
            </div>
          </div>

          {/* ── Brand text ── */}
          <div style={{ textAlign: 'center', animation: 'pl-fade-up 0.7s ease-out 0.15s both' }}>
            <p
              className="pl-shimmer"
              style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '0.06em', lineHeight: 1, marginBottom: '10px' }}
            >
              MB Boiler ERP
            </p>
            <p style={{
              fontSize: '10px',
              color: 'rgba(180,170,255,0.5)',
              letterSpacing: '0.28em',
              textTransform: 'uppercase',
              fontWeight: 500,
              animation: 'pl-blink 1.8s ease-in-out infinite',
            }}>
              Laden
            </p>
          </div>

          {/* ── Progress bar ── */}
          <div style={{
            width: '200px', height: '2px',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '2px', overflow: 'hidden',
            animation: 'pl-fade-up 0.7s ease-out 0.3s both',
          }}>
            <div style={{
              height: '100%', borderRadius: '2px',
              background: 'linear-gradient(90deg, #7B61FF 0%, #00D4FF 60%, #9F7AEA 100%)',
              boxShadow: '0 0 10px rgba(123,97,255,0.9), 0 0 20px rgba(0,212,255,0.4)',
              animation: 'pl-bar 3.5s cubic-bezier(0.4,0,0.2,1) infinite',
            }} />
          </div>
        </div>
      </div>
    </>
  );
}
