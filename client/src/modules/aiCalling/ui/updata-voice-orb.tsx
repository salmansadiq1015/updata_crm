'use client';

import { useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore } from 'react';
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
  lg: 328,
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
type Pulse = { born: number; strength: number; x?: number; y?: number };

const TAU = Math.PI * 2;
const BARS = 72;
const MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const subscribeMotion = (notify: () => void) => {
  const query = window.matchMedia?.(MOTION_QUERY);
  query?.addEventListener('change', notify);
  return () => query?.removeEventListener('change', notify);
};
const getReducedMotion = () => window.matchMedia?.(MOTION_QUERY).matches ?? false;
const getServerMotion = () => false;

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
  interactive,
  className,
  label,
}: {
  state?: UpdataVoiceOrbState;
  audioLevel?: number;
  getAudio?: () => UpdataVoiceOrbAudio | null;
  size?: UpdataVoiceOrbSize | number;
  reducedMotion?: boolean;
  interactive?: boolean;
  className?: string;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const instructionsId = useId();
  const systemReducedMotion = useSyncExternalStore(subscribeMotion, getReducedMotion, getServerMotion);
  const motionDisabled = reducedMotion || systemReducedMotion;
  const stateRef = useRef(state);
  const levelRef = useRef(0);
  const audioRef = useRef(getAudio);
  const pixels = typeof size === 'number' ? size : SIZE[size];
  const level = Math.max(0, Math.min(1, Number.isFinite(audioLevel) ? audioLevel : 0));
  const canInteract = (interactive ?? pixels >= 100) && !motionDisabled;
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
    const element = surfaceRef.current;
    if (!element) return undefined;
    const surface = element;

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
    const lineCount = Math.round(44 * density);
    const segmentCount = Math.round(88 * density);
    const dust: DustParticle[] = Array.from({ length: Math.round(76 * density) }, (_, index) => ({
      angle: seededRandom(index + 4) * TAU,
      distance: 1.08 + seededRandom(index + 17) * 0.36,
      size: 0.35 + seededRandom(index + 31) * (small ? 0.6 : 1.05),
      alpha: 0.14 + seededRandom(index + 57) * 0.42,
      drift: 0.45 + seededRandom(index + 89) * 0.8,
    }));
    const bars = new Float32Array(BARS);
    const pulses: Pulse[] = [];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(pixels * dpr);
    canvas.height = Math.round(pixels * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Cap the mesh redraw at ~30fps. Each frame issues thousands of canvas draw
    // calls (44×88 mesh + ribbons + spectrum); at 60fps on a live WebRTC test that
    // saturates the renderer and the agent's audio stutters word-by-word. The
    // physics below is delta-time based, so fewer frames keep the same motion.
    const minFrameMs = 1000 / 30;

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
    let pointerId: number | null = null;
    let hoverX = 0;
    let hoverY = 0;
    let hoverAmount = 0;
    let hovering = false;
    let moved = 0;
    let visible = true;
    let lastPulse = -1;
    let accent = [...RING[stateRef.current]] as [number, number, number];

    function readAudio(): UpdataVoiceOrbAudio {
      try {
        const live = audioRef.current?.();
        if (live && Number.isFinite(live.level)) return { ...live, level: Math.min(1, Math.max(0, live.level)) };
      } catch { /* a closed AudioContext: fall back to the coarse level */ }
      return { level: levelRef.current };
    }

    function draw(now: number) {
      const still = motionDisabled || tiny;
      // Throttle the animated redraw to ~30fps: keep polling rAF but skip the heavy
      // frame until minFrameMs has passed, so spare renderer time goes to audio. A
      // still frame (reduced motion / tiny) renders once, immediately, as before.
      if (!still && now - last < minFrameMs) {
        if (visible && !document.hidden) frame = window.requestAnimationFrame(draw);
        return;
      }
      const delta = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      if (!still) elapsed += delta;

      const current = stateRef.current;
      const profile = MOTION[current];
      const audio = readAudio();
      const conversational = current === 'speaking' || current === 'listening';
      const level = conversational ? audio.level : 0;
      smoothedLevel = mix(smoothedLevel, level, level > smoothedLevel ? 0.45 : 0.12);
      // A rising burst of speech (a syllable / word onset) sends out one pulse ring.
      if (!still && current === 'speaking' && level > 0.18 && level > peak * 1.35 && elapsed - lastPulse > 0.22 && pulses.length < 4) {
        pulses.push({ born: elapsed, strength: Math.min(1, level * 1.4) });
        lastPulse = elapsed;
      }
      peak = mix(peak, level, 0.08);

      const targetEnergy = Math.min(1.4, profile.energy + smoothedLevel * (current === 'speaking' ? 0.7 : 0.3));
      smoothedEnergy = mix(smoothedEnergy, targetEnergy, 0.08);

      if (!still) {
        yaw += delta * (profile.spin + smoothedLevel * 0.35) + velocityX * delta;
        pitch = Math.max(-0.82, Math.min(0.82, pitch + velocityY * delta));
        velocityX *= Math.pow(0.91, delta * 60);
        velocityY *= Math.pow(0.9, delta * 60);
      }
      hoverAmount = mix(hoverAmount, hovering ? 1 : 0, 1 - Math.exp(-delta * 7));

      const center = pixels / 2;
      // The sphere leaves room inside the canvas for the conversation ring and pulses.
      const radius = pixels * (tiny ? 0.36 : 0.318) * (1 + (still ? 0 : smoothedLevel) * (current === 'speaking' ? 0.07 : 0.03));
      const breathe = still ? 1 : 1 + Math.sin(elapsed * (0.82 + profile.speed * 0.2)) * (0.012 + smoothedEnergy * 0.008);
      const orbRadius = radius * breathe;
      const targetAccent = conversational && audio.source === 'user' ? RING.listening : RING[current];
      accent = accent.map((channel, index) => mix(channel, targetAccent[index], still ? 1 : 0.08)) as [number, number, number];
      ctx.clearRect(0, 0, pixels, pixels);

      // Soft glow, tinted by who is talking.
      const bloom = ctx.createRadialGradient(center, center, orbRadius * 0.1, center, center, pixels * 0.5);
      bloom.addColorStop(0, `rgba(63,56,255,${0.14 + smoothedEnergy * 0.04})`);
      bloom.addColorStop(0.45, rgba(accent, 0.07 + smoothedEnergy * 0.05 + smoothedLevel * 0.08));
      bloom.addColorStop(1, 'rgba(2,6,23,0)');
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, pixels, pixels);

      // A translucent body gives the fine surface filaments volume and depth.
      const body = ctx.createRadialGradient(center - orbRadius * 0.32, center - orbRadius * 0.36, 0, center, center, orbRadius * 1.04);
      body.addColorStop(0, 'rgba(67,202,255,0.13)');
      body.addColorStop(0.48, 'rgba(75,63,214,0.12)');
      body.addColorStop(0.84, 'rgba(97,44,207,0.08)');
      body.addColorStop(1, 'rgba(80,150,255,0)');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(center, center, orbRadius * 1.04, 0, TAU);
      ctx.fill();

      // Expanding pulse rings (agent speech onsets).
      for (let i = pulses.length - 1; i >= 0; i -= 1) {
        const age = (elapsed - pulses[i].born) / 1.1;
        if (age >= 1) { pulses.splice(i, 1); continue; }
        ctx.strokeStyle = rgba(accent, (1 - age) * 0.45 * pulses[i].strength);
        ctx.lineWidth = (small ? 0.8 : 1.4) * (1 - age) + 0.3;
        ctx.beginPath();
        ctx.arc(pulses[i].x ?? center, pulses[i].y ?? center, orbRadius * (0.85 + age * 0.65), 0, TAU);
        ctx.stroke();
      }

      // Drifting dust around the sphere.
      for (const particle of dust) {
        const orbit = particle.angle + yaw * particle.drift + elapsed * profile.spin * 0.16;
        const shimmer = still ? 0.86 : 0.72 + Math.sin(elapsed * 1.7 + particle.angle * 3) * 0.22;
        const px = center + Math.cos(orbit) * particle.distance * orbRadius;
        const py = center + Math.sin(orbit) * particle.distance * orbRadius * 0.8;
        ctx.fillStyle = pointColor((px - (center - orbRadius)) / (orbRadius * 2), particle.alpha * shimmer, smoothedEnergy);
        ctx.beginPath();
        ctx.arc(px, py, particle.size, 0, TAU);
        ctx.fill();
      }

      // The particle sphere: its surface ripples with the voice.
      const cosYaw = Math.cos(yaw + hoverX * hoverAmount * 0.3);
      const sinYaw = Math.sin(yaw + hoverX * hoverAmount * 0.3);
      const cosPitch = Math.cos(pitch + hoverY * hoverAmount * 0.22);
      const sinPitch = Math.sin(pitch + hoverY * hoverAmount * 0.22);
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
          const magnet = hoverAmount * Math.max(0, rotatedZ) * 0.045;
          const x = center + (yawX + hoverX * magnet) * orbRadius * perspective;
          const y = center + (rotatedY + hoverY * magnet) * orbRadius * perspective;
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
            const twinkle = still ? 0.9 : 0.72 + 0.28 * Math.sin(elapsed * (1.4 + smoothedEnergy) + line * 0.61 + segment * 0.24);
            const pointSize = (tiny ? 0.34 : small ? 0.42 : 0.52) + depth * (small ? 0.34 : 0.62) + smoothedLevel * 0.38;
            ctx.fillStyle = pointColor(point.colorPosition, (0.2 + depth * 0.72) * twinkle, smoothedEnergy);
            ctx.beginPath();
            ctx.arc(x, y, pointSize, 0, TAU);
            ctx.fill();
          }
          previous = point;
        }
      }

      // Aurora ribbons flow through the glassy volume, separately from the mesh.
      // Each ribbon is one path, keeping the glow inexpensive at large sizes.
      if (!small) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(center, center, orbRadius * 0.98, 0, TAU);
        ctx.clip();
        ctx.globalCompositeOperation = 'screen';
        const ribbonGradient = ctx.createLinearGradient(center - orbRadius, center, center + orbRadius, center);
        ribbonGradient.addColorStop(0, 'rgba(34,211,238,0.65)');
        ribbonGradient.addColorStop(0.45, 'rgba(99,102,241,0.45)');
        ribbonGradient.addColorStop(1, 'rgba(232,121,249,0.65)');
        for (let ribbon = 0; ribbon < 7; ribbon += 1) {
          ctx.beginPath();
          for (let step = 0; step <= 64; step += 1) {
            const u = step / 64;
            const x = (u * 2 - 1) * orbRadius;
            const envelope = Math.sin(u * Math.PI);
            const wave = Math.sin(u * 5.8 + time * 0.65 + ribbon * 0.27 + yaw * 0.4);
            const y = (wave * (0.23 + smoothedLevel * 0.12) + (ribbon - 3) * 0.07) * orbRadius * envelope;
            const px = center + x;
            const py = center + y + hoverY * hoverAmount * orbRadius * 0.08;
            if (step === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.strokeStyle = ribbonGradient;
          ctx.globalAlpha = 0.3 + smoothedEnergy * 0.24;
          ctx.lineWidth = 1 + (ribbon % 3) * 0.65;
          ctx.shadowColor = ribbon < 3 ? '#22d3ee' : '#a78bfa';
          ctx.shadowBlur = 9 + smoothedLevel * 10;
          ctx.stroke();
        }
        ctx.restore();

        // A fine edge highlight and soft cursor light make the orb feel tangible.
        const rim = ctx.createLinearGradient(center - orbRadius, center - orbRadius, center + orbRadius, center + orbRadius);
        rim.addColorStop(0, 'rgba(103,232,249,0.55)');
        rim.addColorStop(0.4, 'rgba(129,140,248,0.06)');
        rim.addColorStop(0.75, 'rgba(232,121,249,0.36)');
        rim.addColorStop(1, 'rgba(129,140,248,0.08)');
        ctx.strokeStyle = rim;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(center, center, orbRadius * 1.025, 0, TAU);
        ctx.stroke();
        if (hoverAmount > 0.01) {
          const lightX = center + hoverX * orbRadius * 0.65;
          const lightY = center + hoverY * orbRadius * 0.65;
          const light = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, orbRadius * 0.85);
          light.addColorStop(0, `rgba(165,243,252,${hoverAmount * 0.13})`);
          light.addColorStop(1, 'rgba(165,243,252,0)');
          ctx.fillStyle = light;
          ctx.beginPath();
          ctx.arc(center, center, orbRadius, 0, TAU);
          ctx.fill();
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
            const value = bands[idx];
            target = Number.isFinite(value) ? Math.max(0, Math.min(1, value / 255)) : 0;
          } else if (conversational) {
            target = smoothedLevel * (0.55 + 0.45 * Math.abs(Math.sin(i * 0.37 + elapsed * 3.1)));
          }
          bars[i] = mix(bars[i], target, still ? 1 : target > bars[i] ? 0.5 : 0.14);
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
        if (current === 'processing' || (!small && current !== 'muted' && current !== 'error')) {
          for (const [tilt, speed] of [[0.35, 0.9], [-0.6, -0.7]] as const) {
            ctx.save();
            ctx.translate(center, center);
            ctx.rotate(tilt + elapsed * speed * 0.4);
            ctx.strokeStyle = rgba(accent, current === 'processing' ? 0.38 : 0.12);
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

      if (!still && visible && !document.hidden) frame = window.requestAnimationFrame(draw);
    }

    function restart() {
      window.cancelAnimationFrame(frame);
      last = performance.now();
      if (visible && !document.hidden) draw(last);
    }

    function onPointerDown(event: PointerEvent) {
      if (!canInteract || !event.isPrimary || event.button !== 0) return;
      dragging = true;
      moved = 0;
      pointerId = event.pointerId;
      pointerX = event.clientX;
      pointerY = event.clientY;
      surface.setPointerCapture?.(event.pointerId);
      surface.dataset.dragging = 'true';
    }

    function onPointerMove(event: PointerEvent) {
      if (!canInteract) return;
      const rect = surface!.getBoundingClientRect();
      hoverX = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
      hoverY = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
      hovering = true;
      if (!dragging || event.pointerId !== pointerId) return;
      const dx = event.clientX - pointerX;
      const dy = event.clientY - pointerY;
      moved += Math.abs(dx) + Math.abs(dy);
      yaw += dx * 0.009;
      pitch = Math.max(-0.82, Math.min(0.82, pitch + dy * 0.007));
      velocityX = dx * 0.035;
      velocityY = dy * 0.02;
      pointerX = event.clientX;
      pointerY = event.clientY;
    }

    function endPointer(event: PointerEvent) {
      if (event.pointerId !== pointerId) return;
      if (event.type === 'pointerup' && moved < 6 && canInteract) {
        pulses.push({ born: elapsed, strength: 0.8, x: pixels / 2 + hoverX * pixels * 0.08, y: pixels / 2 + hoverY * pixels * 0.08 });
        if (pulses.length > 4) pulses.shift();
      }
      dragging = false;
      const captured = pointerId;
      pointerId = null;
      if (captured !== null && surface.hasPointerCapture?.(captured)) surface.releasePointerCapture(captured);
      if (event.pointerType === 'touch') hovering = false;
      delete surface.dataset.dragging;
    }

    function onPointerLeave() { hovering = false; }

    function reset() {
      yaw = -0.32;
      pitch = -0.1;
      velocityX = 0;
      velocityY = 0;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (!canInteract || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' ', 'Home'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'ArrowLeft') yaw -= 0.14;
      if (event.key === 'ArrowRight') yaw += 0.14;
      if (event.key === 'ArrowUp') pitch = Math.max(-0.82, pitch - 0.1);
      if (event.key === 'ArrowDown') pitch = Math.min(0.82, pitch + 0.1);
      if (event.key === 'Home') reset();
      if (event.key === 'Enter' || event.key === ' ') {
        pulses.push({ born: elapsed, strength: 0.8 });
        if (pulses.length > 4) pulses.shift();
      }
    }

    surface.addEventListener('pointerdown', onPointerDown);
    surface.addEventListener('pointermove', onPointerMove);
    surface.addEventListener('pointerleave', onPointerLeave);
    surface.addEventListener('pointerup', endPointer);
    surface.addEventListener('pointercancel', endPointer);
    surface.addEventListener('lostpointercapture', endPointer);
    surface.addEventListener('dblclick', reset);
    surface.addEventListener('keydown', onKeyDown);
    canvas.addEventListener('orb:state', restart);
    document.addEventListener('visibilitychange', restart);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      restart();
    });
    observer?.observe(surface);
    restart();

    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      surface.removeEventListener('pointerdown', onPointerDown);
      surface.removeEventListener('pointermove', onPointerMove);
      surface.removeEventListener('pointerleave', onPointerLeave);
      surface.removeEventListener('pointerup', endPointer);
      surface.removeEventListener('pointercancel', endPointer);
      surface.removeEventListener('lostpointercapture', endPointer);
      surface.removeEventListener('dblclick', reset);
      surface.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('orb:state', restart);
      document.removeEventListener('visibilitychange', restart);
    };
  }, [pixels, motionDisabled, canInteract]);

  // Reduced motion or a non-animated state: draw one still frame when the state changes.
  useEffect(() => {
    canvasRef.current?.dispatchEvent(new Event('orb:state'));
  }, [state, level]);

  return (
    <div
      ref={surfaceRef}
      role="img"
      aria-label={status}
      aria-describedby={canInteract ? instructionsId : undefined}
      aria-keyshortcuts={canInteract ? 'ArrowLeft ArrowRight ArrowUp ArrowDown Enter Space Home' : undefined}
      tabIndex={canInteract ? 0 : undefined}
      data-state={state}
      data-motion={motionDisabled ? 'reduced' : 'full'}
      data-interactive={canInteract}
      className={cn(
        'relative isolate inline-flex max-w-full shrink-0 select-none items-center justify-center rounded-full outline-none transition-[opacity,filter] duration-300 focus-visible:ring-1 focus-visible:ring-cyan-300/60',
        canInteract && 'cursor-grab data-[dragging=true]:cursor-grabbing',
        (state === 'muted' || state === 'error') && 'opacity-60 grayscale-[.35]',
        className,
      )}
      style={{
        width: pixels,
        aspectRatio: '1',
        touchAction: canInteract ? 'pan-y' : 'auto',
      }}
    >
      {canInteract ? <span id={instructionsId} className="sr-only">Move your pointer to explore. Drag or use arrow keys to rotate. Click, Enter or Space to ripple. Double-click or Home to reset the view.</span> : null}
      <span aria-hidden="true" className="pointer-events-none absolute inset-[18%] -z-10 rounded-full bg-[radial-gradient(ellipse_at_30%_30%,rgba(34,211,238,.12),rgba(99,102,241,.1)_45%,rgba(217,70,239,.08)_75%,transparent)]" />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none block h-full w-full rounded-full"
      />
    </div>
  );
}
