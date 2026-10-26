'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export type UpdataVoiceOrbState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'speaking'
  | 'processing'
  | 'muted'
  | 'reconnecting'
  | 'error';

export type UpdataVoiceOrbSize = 'compact' | 'sm' | 'md' | 'lg';

/**
 * One frame of real call audio for the orb: a 0..1 level and, optionally,
 * frequency bands (0..255, from an AnalyserNode). `source` says whose voice it is.
 */
export type UpdataVoiceOrbAudio = { level: number; bands?: ArrayLike<number>; source?: 'agent' | 'user' };

const SIZE: Record<UpdataVoiceOrbSize, number> = {
  compact: 44,
  sm: 76,
  md: 148,
  lg: 264,
};

const LABEL: Record<UpdataVoiceOrbState, string> = {
  idle: 'Voice agent is idle',
  connecting: 'Voice agent is connecting',
  listening: 'Voice agent is listening',
  speaking: 'Voice agent is speaking',
  processing: 'Voice agent is processing',
  muted: 'Microphone is muted',
  reconnecting: 'Voice agent is reconnecting',
  error: 'Voice agent is disconnected',
};

type MotionProfile = { speed: number; energy: number; distortion: number; spin: number };

const MOTION: Record<UpdataVoiceOrbState, MotionProfile> = {
  idle: { speed: 0.42, energy: 0.24, distortion: 0.035, spin: 0.075 },
  connecting: { speed: 0.9, energy: 0.5, distortion: 0.045, spin: 0.22 },
  listening: { speed: 0.56, energy: 0.4, distortion: 0.045, spin: 0.1 },
  speaking: { speed: 1.2, energy: 0.85, distortion: 0.06, spin: 0.22 },
  processing: { speed: 1.08, energy: 0.7, distortion: 0.06, spin: 0.55 },
  muted: { speed: 0.18, energy: 0.08, distortion: 0.02, spin: 0.025 },
  reconnecting: { speed: 1.0, energy: 0.6, distortion: 0.06, spin: 0.34 },
  error: { speed: 0, energy: 0.04, distortion: 0.018, spin: 0 },
};

// Accent colour of the conversation ring per state (agent = magenta, person = cyan).
const RING: Record<UpdataVoiceOrbState, [number, number, number]> = {
  idle: [56, 189, 248],
  connecting: [96, 165, 250],
  listening: [34, 211, 238],
  speaking: [232, 121, 249],
  processing: [167, 139, 250],
  muted: [148, 163, 184],
  reconnecting: [129, 140, 248],
  error: [251, 113, 133],
};

type DustParticle = { angle: number; distance: number; size: number; alpha: number; drift: number };
type Pulse = { born: number; strength: number };

const TAU = Math.PI * 2;
const BARS = 72;

function seededRandom(seed: number): number {
  const value = Math.sin(seed * 91.733 + 17.17) * 43758.5453;
  return value - Math.floor(value);
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function pointColor(position: number, alpha: number, energy: number): string {
  const x = Math.max(0, Math.min(1, position));
  let red: number;
  let green: number;
  let blue: number;
  if (x < 0.5) {
    const blend = x * 2;
    red = mix(25, 67, blend);
    green = mix(220, 86, blend);
    blue = mix(255, 246, blend);
  } else {
    const blend = (x - 0.5) * 2;
    red = mix(67, 255, blend);
    green = mix(86, 49, blend);
    blue = mix(246, 218, blend);
  }
  const lift = energy * 18;
  return `rgba(${Math.min(255, Math.round(red + lift))},${Math.min(255, Math.round(green + lift))},${Math.min(255, Math.round(blue + lift))},${alpha.toFixed(3)})`;
}

const rgba = ([r, g, b]: [number, number, number], a: number) => `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

/**
 * A state-driven, conversation-reactive particle sphere.
 *
 * Everything (glow, sphere, conversation ring, pulses, loaders) is drawn in one
 * canvas around its own centre, so the orb stays perfectly circular and centred
 * at every size. The animation follows the call state and REAL audio: pass
 * `audioLevel` (coarse, e.g. LiveKit speaker levels) and/or `getAudio` (read every
 * frame, e.g. an AnalyserNode on the agent's track and the microphone).
 *  - speaking: the sphere ripples with the agent's voice, a magenta spectrum ring
 *    follows its frequencies and syllable peaks send out pulse rings;
 *  - listening: a calm cyan ring that rises with the person's microphone;
 *  - processing: orbiting dotted paths; connecting/reconnecting: a rotating arc;
 *  - idle: slow breathe; muted/error: still and desaturated.
 * Pointer and arrow keys rotate the sphere without changing call state.
 */
export function UpdataVoiceOrb({
  state = 'idle',
  audioLevel = 0,
  getAudio,
  size = 'md',
  reducedMotion = false,
  className,
  label,
}: {
  state?: UpdataVoiceOrbState;
  audioLevel?: number;
  getAudio?: () => UpdataVoiceOrbAudio | null;
  size?: UpdataVoiceOrbSize | number;
  reducedMotion?: boolean;
  className?: string;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const levelRef = useRef(0);
  const audioRef = useRef(getAudio);
  const pixels = typeof size === 'number' ? size : SIZE[size];
  const level = Math.max(0, Math.min(1, Number.isFinite(audioLevel) ? audioLevel : 0));
  const reactiveScale = reducedMotion ? 1 : 1 + level * 0.035;
  const status = label || LABEL[state];

  // The animation loop reads the latest props through refs (no re-render per frame).
  useLayoutEffect(() => {
    stateRef.current = state;
    levelRef.current = level;
    audioRef.current = getAudio;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || navigator.userAgent.includes('jsdom')) return undefined;
    const surface = canvas;

    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext('2d', { alpha: true });
    } catch {
      return undefined;
    }
    if (!context) return undefined;
    const ctx = context;

    const small = pixels < 100;
    const tiny = pixels < 60;
    const density = tiny ? 0.42 : small ? 0.62 : 1;
    const lineCount = Math.round(40 * density);
    const segmentCount = Math.round(72 * density);
    const dust: DustParticle[] = Array.from({ length: Math.round(56 * density) }, (_, index) => ({
      angle: seededRandom(index + 4) * TAU,
      distance: 1.08 + seededRandom(index + 17) * 0.36,
      size: 0.35 + seededRandom(index + 31) * (small ? 0.6 : 1.05),
      alpha: 0.14 + seededRandom(index + 57) * 0.42,
      drift: 0.45 + seededRandom(index + 89) * 0.8,
    }));
    const bars = new Float32Array(BARS);
    const pulses: Pulse[] = [];
    const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(pixels * dpr);
    canvas.height = Math.round(pixels * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let frame = 0;
    let last = performance.now();
    let elapsed = 0;
    let yaw = -0.32;
    let pitch = -0.1;
    let velocityX = 0;
    let velocityY = 0;
    let smoothedLevel = 0;
    let peak = 0;
    let smoothedEnergy = MOTION[stateRef.current].energy;
    let dragging = false;
    let pointerX = 0;
    let pointerY = 0;

    function readAudio(): UpdataVoiceOrbAudio {
      try {
        const live = audioRef.current?.();
        if (live && Number.isFinite(live.level)) return { ...live, level: Math.max(levelRef.current, Math.min(1, Math.max(0, live.level))) };
      } catch { /* a closed AudioContext: fall back to the coarse level */ }
      return { level: levelRef.current };
    }

    function draw(now: number) {
      const motionDisabled = reducedMotion || Boolean(media?.matches) || tiny;
      const delta = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      if (!motionDisabled) elapsed += delta;

      const current = stateRef.current;
      const profile = MOTION[current];
      const audio = readAudio();
      const conversational = current === 'speaking' || current === 'listening';
      const level = conversational ? audio.level : 0;
      smoothedLevel = mix(smoothedLevel, level, level > smoothedLevel ? 0.45 : 0.12);
      // A rising burst of speech (a syllable / word onset) sends out one pulse ring.
      if (!motionDisabled && current === 'speaking' && level > 0.18 && level > peak * 1.35 && pulses.length < 4) {
        pulses.push({ born: elapsed, strength: Math.min(1, level * 1.4) });
      }
      peak = mix(peak, level, 0.08);

      const targetEnergy = Math.min(1.4, profile.energy + smoothedLevel * (current === 'speaking' ? 0.7 : 0.3));
      smoothedEnergy = mix(smoothedEnergy, targetEnergy, 0.08);

      if (!motionDisabled) {
        yaw += delta * (profile.spin + smoothedLevel * 0.35) + velocityX * delta;
        pitch = Math.max(-0.82, Math.min(0.82, pitch + velocityY * delta));
        velocityX *= Math.pow(0.91, delta * 60);
        velocityY *= Math.pow(0.9, delta * 60);
      }

      const center = pixels / 2;
      // The sphere leaves room inside the canvas for the conversation ring and pulses.
      const radius = pixels * (tiny ? 0.34 : 0.285) * (1 + smoothedLevel * (current === 'speaking' ? 0.07 : 0.03));
      const breathe = motionDisabled ? 1 : 1 + Math.sin(elapsed * (0.82 + profile.speed * 0.2)) * (0.012 + smoothedEnergy * 0.008);
      const orbRadius = radius * breathe;
      const accent = RING[current];
      ctx.clearRect(0, 0, pixels, pixels);

      // Soft glow, tinted by who is talking.
      const bloom = ctx.createRadialGradient(center, center, orbRadius * 0.1, center, center, pixels * 0.5);
      bloom.addColorStop(0, `rgba(63,56,255,${0.14 + smoothedEnergy * 0.04})`);
      bloom.addColorStop(0.45, rgba(accent, 0.07 + smoothedEnergy * 0.05 + smoothedLevel * 0.08));
      bloom.addColorStop(1, 'rgba(2,6,23,0)');
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, pixels, pixels);

      // Expanding pulse rings (agent speech onsets).
      for (let i = pulses.length - 1; i >= 0; i -= 1) {
        const age = (elapsed - pulses[i].born) / 1.1;
        if (age >= 1) { pulses.splice(i, 1); continue; }
        ctx.strokeStyle = rgba(accent, (1 - age) * 0.45 * pulses[i].strength);
        ctx.lineWidth = (small ? 0.8 : 1.4) * (1 - age) + 0.3;
        ctx.beginPath();
        ctx.arc(center, center, orbRadius * (1.12 + age * 0.5), 0, TAU);
        ctx.stroke();
      }

      // Drifting dust around the sphere.
      for (const particle of dust) {
        const orbit = particle.angle + yaw * particle.drift + elapsed * profile.spin * 0.16;
        const shimmer = motionDisabled ? 0.86 : 0.72 + Math.sin(elapsed * 1.7 + particle.angle * 3) * 0.22;
        const px = center + Math.cos(orbit) * particle.distance * orbRadius;
        const py = center + Math.sin(orbit) * particle.distance * orbRadius * 0.8;
        ctx.fillStyle = pointColor((px - (center - orbRadius)) / (orbRadius * 2), particle.alpha * shimmer, smoothedEnergy);
        ctx.beginPath();
        ctx.arc(px, py, particle.size, 0, TAU);
        ctx.fill();
      }

      // The particle sphere: its surface ripples with the voice.
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      const cosPitch = Math.cos(pitch);
      const sinPitch = Math.sin(pitch);
      const time = elapsed * profile.speed;
      const distortion = profile.distortion * (1 + smoothedEnergy * 0.35) + smoothedLevel * (current === 'speaking' ? 0.065 : 0.03);
      const pointEvery = tiny ? 3 : 2;

      for (let line = 0; line < lineCount; line += 1) {
        const latitude = -Math.PI / 2 + ((line + 0.55) / lineCount) * Math.PI;
        const latitudeWave = Math.sin(time * 1.3 + line * 0.63) * distortion * 0.42;
        // Waves fade towards the poles, where latitude lines crowd together (no lumps).
        const poleDamp = 0.3 + 0.7 * Math.cos(latitude);
        let previous: { x: number; y: number; z: number; colorPosition: number } | null = null;
        for (let segment = 0; segment <= segmentCount; segment += 1) {
          const longitude = (segment / segmentCount) * TAU;
          const noise = Math.sin(longitude * 3 + latitude * 4.3 + time * 1.12) * distortion
            + Math.sin(longitude * 5.2 - latitude * 2.1 - time * 0.74) * distortion * 0.42
            + latitudeWave;
          const radial = 1 + noise * poleDamp;
          const latitudeOffset = latitude + Math.sin(longitude * 2.2 + time + line * 0.1) * distortion * 0.42 * poleDamp;
          const cosLatitude = Math.cos(latitudeOffset);
          const rawX = Math.cos(longitude) * cosLatitude * radial;
          const rawY = Math.sin(latitudeOffset) * radial;
          const rawZ = Math.sin(longitude) * cosLatitude * radial;
          const yawX = rawX * cosYaw + rawZ * sinYaw;
          const yawZ = -rawX * sinYaw + rawZ * cosYaw;
          const rotatedY = rawY * cosPitch - yawZ * sinPitch;
          const rotatedZ = rawY * sinPitch + yawZ * cosPitch;
          const perspective = 2.75 / (2.75 - rotatedZ * 0.2);
          const x = center + yawX * orbRadius * perspective;
          const y = center + rotatedY * orbRadius * perspective;
          const point = { x, y, z: rotatedZ, colorPosition: Math.max(0, Math.min(1, (x - center) / (orbRadius * 2) + 0.5)) };
          if (previous) {
            const depth = Math.max(0, Math.min(1, (previous.z + point.z + 2) / 4));
            ctx.strokeStyle = pointColor((previous.colorPosition + point.colorPosition) / 2, (0.075 + depth * 0.48) * (0.72 + smoothedEnergy * 0.45), smoothedEnergy);
            ctx.lineWidth = (small ? 0.46 : 0.62) + depth * (small ? 0.34 : 0.58) + smoothedLevel * 0.4;
            ctx.beginPath();
            ctx.moveTo(previous.x, previous.y);
            ctx.lineTo(point.x, point.y);
            ctx.stroke();
          }
          if (segment % pointEvery === 0) {
            const depth = Math.max(0, Math.min(1, (rotatedZ + 1) / 2));
            const twinkle = motionDisabled ? 0.9 : 0.72 + 0.28 * Math.sin(elapsed * (1.4 + smoothedEnergy) + line * 0.61 + segment * 0.24);
            const pointSize = (tiny ? 0.34 : small ? 0.42 : 0.52) + depth * (small ? 0.34 : 0.62) + smoothedLevel * 0.38;
            ctx.fillStyle = pointColor(point.colorPosition, (0.2 + depth * 0.72) * twinkle, smoothedEnergy);
            ctx.beginPath();
            ctx.arc(x, y, pointSize, 0, TAU);
            ctx.fill();
          }
          previous = point;
        }
      }

      if (!tiny) {
        // Conversation ring: a radial spectrum around the sphere that follows the
        // real voice (frequency bands when available, otherwise the level).
        const ringRadius = orbRadius * 1.16;
        const maxBar = pixels * 0.5 - ringRadius - 2;
        const bands = conversational ? audio.bands : undefined;
        for (let i = 0; i < BARS; i += 1) {
          // Mirror the spectrum so low frequencies sit at the top and bottom symmetrically.
          const half = BARS / 2;
          const k = i < half ? i : BARS - 1 - i;
          let target = 0;
          if (bands && bands.length) {
            const idx = Math.min(bands.length - 1, Math.floor((k / half) * bands.length * 0.7));
            target = (bands[idx] || 0) / 255;
          } else if (conversational) {
            target = smoothedLevel * (0.55 + 0.45 * Math.abs(Math.sin(i * 0.37 + elapsed * 3.1)));
          }
          bars[i] = mix(bars[i], target, target > bars[i] ? 0.5 : 0.14);
        }
        ctx.save();
        ctx.translate(center, center);
        ctx.rotate(-Math.PI / 2);
        ctx.lineCap = 'round';
        for (let i = 0; i < BARS; i += 1) {
          const angle = (i / BARS) * TAU;
          const length = 0.6 + bars[i] * maxBar * (current === 'speaking' ? 1 : 0.65);
          const alpha = conversational ? 0.18 + bars[i] * 0.75 : 0.1;
          ctx.strokeStyle = rgba(accent, alpha);
          ctx.lineWidth = small ? 1 : 1.6;
          ctx.beginPath();
          ctx.moveTo(Math.cos(angle) * ringRadius, Math.sin(angle) * ringRadius);
          ctx.lineTo(Math.cos(angle) * (ringRadius + length), Math.sin(angle) * (ringRadius + length));
          ctx.stroke();
        }
        ctx.restore();

        // Thin rim, with a rotating accent arc that shows the orb is alive.
        ctx.strokeStyle = rgba(accent, 0.18 + smoothedEnergy * 0.08);
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(center, center, orbRadius * 1.08, 0, TAU);
        ctx.stroke();

        const loading = current === 'connecting' || current === 'reconnecting';
        const arcStart = elapsed * (loading ? 3.2 : 0.6);
        const arcLength = loading ? Math.PI * (0.55 + 0.35 * Math.sin(elapsed * 2.4)) : Math.PI * 0.32;
        ctx.strokeStyle = rgba(accent, loading ? 0.85 : 0.45);
        ctx.lineWidth = loading ? (small ? 1.6 : 2.4) : 1.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(center, center, orbRadius * 1.08, arcStart, arcStart + arcLength);
        ctx.stroke();

        // Thinking: two dotted paths orbiting the sphere.
        if (current === 'processing') {
          for (const [tilt, speed] of [[0.35, 0.9], [-0.6, -0.7]] as const) {
            ctx.save();
            ctx.translate(center, center);
            ctx.rotate(tilt + elapsed * speed * 0.4);
            ctx.strokeStyle = rgba(accent, 0.35);
            ctx.lineWidth = 0.9;
            ctx.setLineDash([1.4, 5]);
            ctx.lineDashOffset = -elapsed * 18;
            ctx.beginPath();
            ctx.ellipse(0, 0, orbRadius * 1.3, orbRadius * 0.5, 0, 0, TAU);
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      if (!motionDisabled) frame = window.requestAnimationFrame(draw);
    }

    function restart() {
      window.cancelAnimationFrame(frame);
      last = performance.now();
      draw(last);
    }

    function onPointerDown(event: PointerEvent) {
      if (reducedMotion || media?.matches) return;
      dragging = true;
      pointerX = event.clientX;
      pointerY = event.clientY;
      surface.setPointerCapture?.(event.pointerId);
      surface.dataset.dragging = 'true';
    }

    function onPointerMove(event: PointerEvent) {
      if (!dragging) return;
      const dx = event.clientX - pointerX;
      const dy = event.clientY - pointerY;
      yaw += dx * 0.009;
      pitch = Math.max(-0.82, Math.min(0.82, pitch + dy * 0.007));
      velocityX = dx * 0.035;
      velocityY = dy * 0.02;
      pointerX = event.clientX;
      pointerY = event.clientY;
    }

    function endPointer() {
      dragging = false;
      delete surface.dataset.dragging;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft') yaw -= 0.14;
      if (event.key === 'ArrowRight') yaw += 0.14;
      if (event.key === 'ArrowUp') pitch = Math.max(-0.82, pitch - 0.1);
      if (event.key === 'ArrowDown') pitch = Math.min(0.82, pitch + 0.1);
      if (reducedMotion || media?.matches) draw(performance.now());
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);
    canvas.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('orb:state', restart);
    media?.addEventListener('change', restart);
    restart();

    return () => {
      window.cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endPointer);
      canvas.removeEventListener('pointercancel', endPointer);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('orb:state', restart);
      media?.removeEventListener('change', restart);
    };
  }, [pixels, reducedMotion]);

  // Reduced motion or a non-animated state: draw one still frame when the state changes.
  useEffect(() => {
    canvasRef.current?.dispatchEvent(new Event('orb:state'));
  }, [state]);

  return (
    <div
      role="img"
      aria-label={status}
      data-state={state}
      className={cn(
        'relative isolate inline-flex shrink-0 items-center justify-center transition-[opacity,filter] duration-300',
        (state === 'muted' || state === 'error') && 'opacity-60 grayscale-[.35]',
        className,
      )}
      style={{
        width: pixels,
        height: pixels,
        transform: `scale(${reactiveScale})`,
        transformOrigin: '50% 50%',
        transition: 'transform 140ms ease-out, opacity 280ms ease, filter 280ms ease',
      }}
    >
      <span className="sr-only">{status}</span>
      <canvas
        ref={canvasRef}
        aria-label={pixels >= 100 ? 'Drag or use arrow keys to rotate the voice visualization' : undefined}
        aria-hidden={pixels < 100 ? true : undefined}
        tabIndex={pixels >= 100 && !reducedMotion ? 0 : -1}
        className={cn(
          'block h-full w-full touch-none rounded-full outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/60 data-[dragging=true]:cursor-grabbing',
          pixels >= 100 && 'cursor-grab',
        )}
      />
    </div>
  );
}
