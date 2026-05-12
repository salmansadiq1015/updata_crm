'use client';

import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LoadingSpinner({ className, size = 'default' }) {
  const sizeClass = { sm: 'h-4 w-4', default: 'h-6 w-6', lg: 'h-10 w-10' }[size];
  const ringSize = { sm: 'h-8 w-8', default: 'h-12 w-12', lg: 'h-20 w-20' }[size];

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div className="relative grid place-items-center">
        <div className={cn('rounded-full border border-primary/20 bg-primary/5 shadow-[0_0_24px_rgb(123_104_238_/_0.18)]', ringSize)} />
        <div className={cn('absolute rounded-full border-2 border-transparent border-t-primary border-r-cyan-300 animate-spin', ringSize)} />
        <Zap className={cn('absolute text-primary drop-shadow-[0_0_10px_rgb(123_104_238_/_0.55)]', sizeClass)} />
      </div>
    </div>
  );
}

const LOADER_STYLES = `
  @keyframes mb-shell-in {
    from { opacity: 0; transform: translateY(18px) scale(0.96); filter: blur(8px); }
    to { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
  }
  @keyframes mb-stage {
    0%, 100% { transform: rotateX(58deg) rotateZ(-18deg) translateY(0); }
    50% { transform: rotateX(62deg) rotateZ(-14deg) translateY(-8px); }
  }
  @keyframes mb-cube {
    from { transform: rotateX(-18deg) rotateY(0deg) rotateZ(45deg); }
    to { transform: rotateX(-18deg) rotateY(360deg) rotateZ(45deg); }
  }
  @keyframes mb-ring-spin {
    from { transform: rotateX(64deg) rotateZ(0deg); }
    to { transform: rotateX(64deg) rotateZ(360deg); }
  }
  @keyframes mb-ring-spin-reverse {
    from { transform: rotateX(68deg) rotateZ(360deg); }
    to { transform: rotateX(68deg) rotateZ(0deg); }
  }
  @keyframes mb-lift {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-10px); }
  }
  @keyframes mb-scan {
    from { transform: translateX(-110%); }
    to { transform: translateX(110%); }
  }
  @keyframes mb-grid {
    from { background-position: 0 0, 0 0; }
    to { background-position: 80px 40px, -80px -40px; }
  }
  @keyframes mb-progress {
    0% { transform: translateX(-92%) scaleX(0.28); }
    35% { transform: translateX(-38%) scaleX(0.72); }
    70% { transform: translateX(12%) scaleX(0.42); }
    100% { transform: translateX(92%) scaleX(0.28); }
  }
  @keyframes mb-text-shine {
    from { background-position: 220% center; }
    to { background-position: -220% center; }
  }
  @keyframes mb-status {
    0%, 100% { opacity: 0.52; }
    50% { opacity: 0.92; }
  }
  .mb-loader-root {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    color: white;
    background:
      radial-gradient(circle at 50% 42%, rgba(124, 97, 255, 0.18), transparent 24rem),
      linear-gradient(135deg, #070913 0%, #101827 42%, #070b15 100%);
  }
  .mb-loader-root::before {
    content: "";
    position: absolute;
    inset: -20%;
    opacity: 0.48;
    background:
      linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px),
      linear-gradient(0deg, rgba(255,255,255,0.035) 1px, transparent 1px);
    background-size: 80px 80px;
    mask-image: radial-gradient(circle at center, black 0%, transparent 68%);
    animation: mb-grid 18s linear infinite;
  }
  .mb-loader-root::after {
    content: "";
    position: absolute;
    inset: 0;
    background:
      linear-gradient(115deg, transparent 0%, rgba(123,104,238,0.12) 34%, transparent 52%),
      linear-gradient(245deg, transparent 0%, rgba(20,184,166,0.10) 30%, transparent 56%),
      linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.04) 100%);
    pointer-events: none;
  }
  .mb-loader-card {
    position: relative;
    width: min(420px, calc(100vw - 48px));
    padding: 36px 34px 32px;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 28px;
    background: linear-gradient(180deg, rgba(255,255,255,0.105), rgba(255,255,255,0.045));
    box-shadow:
      0 34px 90px rgba(0,0,0,0.52),
      inset 0 1px 0 rgba(255,255,255,0.14);
    backdrop-filter: blur(18px);
    animation: mb-shell-in 0.7s cubic-bezier(.2,.8,.2,1) both;
  }
  .mb-loader-card::before {
    content: "";
    position: absolute;
    inset: 1px;
    border-radius: 27px;
    background: linear-gradient(120deg, rgba(255,255,255,0.16), transparent 34%, rgba(123,104,238,0.10));
    pointer-events: none;
  }
  .mb-loader-scan {
    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: inherit;
    pointer-events: none;
  }
  .mb-loader-scan::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    width: 42%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent);
    animation: mb-scan 3.4s linear infinite;
  }
  .mb-loader-scene {
    position: relative;
    height: 190px;
    display: grid;
    place-items: center;
    perspective: 900px;
  }
  .mb-loader-platform {
    position: absolute;
    width: 210px;
    height: 210px;
    border-radius: 42px;
    background:
      linear-gradient(135deg, rgba(255,255,255,0.10), rgba(255,255,255,0.02)),
      radial-gradient(circle, rgba(123,104,238,0.38), transparent 58%);
    border: 1px solid rgba(255,255,255,0.12);
    box-shadow: 0 24px 80px rgba(5,8,16,0.56);
    transform-style: preserve-3d;
    animation: mb-stage 5.5s ease-in-out infinite;
  }
  .mb-loader-platform::after {
    content: "";
    position: absolute;
    inset: 28px;
    border-radius: 30px;
    border: 1px solid rgba(255,255,255,0.13);
  }
  .mb-loader-ring {
    position: absolute;
    width: 148px;
    height: 148px;
    border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.12);
    box-shadow: inset 0 0 28px rgba(123,104,238,0.18), 0 0 30px rgba(45,212,191,0.10);
  }
  .mb-loader-ring.one {
    border-top-color: rgba(139, 92, 246, 0.95);
    border-right-color: rgba(45, 212, 191, 0.78);
    animation: mb-ring-spin 3.8s linear infinite;
  }
  .mb-loader-ring.two {
    width: 112px;
    height: 112px;
    border-left-color: rgba(99,102,241,0.88);
    border-bottom-color: rgba(34,211,238,0.74);
    animation: mb-ring-spin-reverse 2.7s linear infinite;
  }
  .mb-loader-core {
    position: relative;
    width: 82px;
    height: 82px;
    transform-style: preserve-3d;
    animation: mb-lift 3s ease-in-out infinite;
  }
  .mb-loader-cube {
    position: absolute;
    inset: 16px;
    transform-style: preserve-3d;
    animation: mb-cube 5.2s linear infinite;
  }
  .mb-loader-face {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 14px;
    background:
      linear-gradient(145deg, rgba(167,139,250,0.92), rgba(79,70,229,0.82)),
      radial-gradient(circle at 30% 20%, rgba(255,255,255,0.38), transparent 42%);
    box-shadow: 0 0 30px rgba(123,104,238,0.48);
  }
  .mb-loader-front { transform: translateZ(25px); }
  .mb-loader-back { transform: rotateY(180deg) translateZ(25px); opacity: 0.58; }
  .mb-loader-right { transform: rotateY(90deg) translateZ(25px); opacity: 0.72; }
  .mb-loader-left { transform: rotateY(-90deg) translateZ(25px); opacity: 0.72; }
  .mb-loader-top { transform: rotateX(90deg) translateZ(25px); opacity: 0.86; }
  .mb-loader-bottom { transform: rotateX(-90deg) translateZ(25px); opacity: 0.56; }
  .mb-loader-zap {
    width: 23px;
    height: 23px;
    color: white;
    filter: drop-shadow(0 0 12px rgba(255,255,255,0.85));
  }
  .mb-loader-title {
    margin: 22px 0 0;
    text-align: center;
    font-size: 22px;
    line-height: 1;
    font-weight: 850;
    letter-spacing: 0;
    background: linear-gradient(90deg, #ffffff, #a78bfa, #5eead4, #ffffff);
    background-size: 240% auto;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: mb-text-shine 4.8s linear infinite;
  }
  .mb-loader-subtitle {
    margin: 11px 0 0;
    text-align: center;
    font-size: 12px;
    line-height: 1.45;
    color: rgba(226,232,240,0.68);
    letter-spacing: 0;
    animation: mb-status 1.8s ease-in-out infinite;
  }
  .mb-loader-progress {
    position: relative;
    height: 4px;
    margin-top: 26px;
    overflow: hidden;
    border-radius: 999px;
    background: rgba(255,255,255,0.08);
  }
  .mb-loader-progress::before {
    content: "";
    position: absolute;
    inset: 0;
    width: 68%;
    border-radius: inherit;
    background: linear-gradient(90deg, transparent, #8b5cf6 18%, #22d3ee 58%, transparent);
    box-shadow: 0 0 22px rgba(34,211,238,0.42);
    animation: mb-progress 2.3s cubic-bezier(.45,0,.2,1) infinite;
  }
  @media (max-width: 520px) {
    .mb-loader-card {
      padding: 30px 24px 28px;
      border-radius: 24px;
    }
    .mb-loader-scene {
      height: 170px;
    }
    .mb-loader-platform {
      width: 184px;
      height: 184px;
      border-radius: 36px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .mb-loader-root::before,
    .mb-loader-platform,
    .mb-loader-ring,
    .mb-loader-core,
    .mb-loader-cube,
    .mb-loader-title,
    .mb-loader-subtitle,
    .mb-loader-progress::before,
    .mb-loader-scan::before {
      animation: none !important;
    }
  }
`;

export function FullPageSpinner() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LOADER_STYLES }} />
      <div className="mb-loader-root" role="status" aria-live="polite" aria-label="MB Boiler ERP wird geladen">
        <div className="mb-loader-card">
          <div className="mb-loader-scan" />
          <div className="mb-loader-scene" aria-hidden="true">
            <div className="mb-loader-platform" />
            <div className="mb-loader-ring one" />
            <div className="mb-loader-ring two" />
            <div className="mb-loader-core">
              <div className="mb-loader-cube">
                <div className="mb-loader-face mb-loader-front">
                  <Zap className="mb-loader-zap" fill="white" strokeWidth={1.2} />
                </div>
                <div className="mb-loader-face mb-loader-back" />
                <div className="mb-loader-face mb-loader-right" />
                <div className="mb-loader-face mb-loader-left" />
                <div className="mb-loader-face mb-loader-top" />
                <div className="mb-loader-face mb-loader-bottom" />
              </div>
            </div>
          </div>
          <p className="mb-loader-title">MB Boiler ERP</p>
          <p className="mb-loader-subtitle">System wird vorbereitet</p>
          <div className="mb-loader-progress" aria-hidden="true" />
        </div>
      </div>
    </>
  );
}
