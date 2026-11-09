'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * The live-voice orb: a shaded sphere of flowing light that breathes while it
 * listens, follows the voice while someone speaks, swirls while it thinks and
 * circles while it works.
 *
 * Rendered with a single WebGL fragment shader (no 3D library), driven every
 * frame by `getLevels()` so audio reactivity never re-renders React. Brand
 * palette only — sky blue to cyan; never purple.
 *
 * Falls back to a CSS orb when WebGL is unavailable and calms down for
 * prefers-reduced-motion.
 */

// Per-state targets the shader eases towards; easing lives in JS so a state
// change glides instead of snapping.
const STATE_TARGETS = {
  idle:          { swirl: 0.25, energy: 0.25, ring: 0.0, mute: 0.0, warm: 0.0, follow: 0.0 },
  connecting:    { swirl: 0.55, energy: 0.35, ring: 0.35, mute: 0.0, warm: 0.0, follow: 0.0 },
  listening:     { swirl: 0.35, energy: 0.45, ring: 0.0, mute: 0.0, warm: 0.0, follow: 1.0 },
  user_speaking: { swirl: 0.55, energy: 0.70, ring: 0.0, mute: 0.0, warm: 0.0, follow: 1.0 },
  thinking:      { swirl: 1.25, energy: 0.60, ring: 0.25, mute: 0.0, warm: 0.0, follow: 0.0 },
  working:       { swirl: 0.95, energy: 0.65, ring: 1.0, mute: 0.0, warm: 0.0, follow: 0.0 },
  speaking:      { swirl: 0.65, energy: 0.85, ring: 0.0, mute: 0.0, warm: 0.0, follow: 1.0 },
  muted:         { swirl: 0.18, energy: 0.22, ring: 0.0, mute: 1.0, warm: 0.0, follow: 0.0 },
  error:         { swirl: 0.20, energy: 0.30, ring: 0.0, mute: 0.4, warm: 1.0, follow: 0.0 },
  ended:         { swirl: 0.10, energy: 0.15, ring: 0.0, mute: 0.6, warm: 0.0, follow: 0.0 },
};

const VERTEX = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uLevel;
uniform float uSwirl;
uniform float uEnergy;
uniform float uRing;
uniform float uMute;
uniform float uWarm;
uniform float uDark;

// Simplex-ish value noise (cheap, smooth enough for plasma)
vec3 hash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0)), dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                 mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)), dot(hash3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
             mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)), dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                 mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)), dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
}
float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.02 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return v;
}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

void main() {
  vec2 p = (vUv - 0.5) * 2.0;           // -1..1
  float t = uTime;
  float lvl = clamp(uLevel, 0.0, 1.0);

  // Edge wobble: the silhouette itself moves with the voice.
  float ang = atan(p.y, p.x);
  float wob = noise(vec3(cos(ang) * 1.6, sin(ang) * 1.6, t * (0.6 + uSwirl * 0.6))) ;
  float radius = 0.60 + 0.025 * sin(t * 1.3) * (1.0 - lvl) + lvl * 0.075 + wob * (0.018 + lvl * 0.07);
  float d = length(p);

  // Palette — brand sky blue → cyan, deep navy core. Never purple.
  vec3 navy   = vec3(0.012, 0.067, 0.157);
  vec3 deep   = vec3(0.008, 0.360, 0.620);   // #025C9E
  vec3 blue   = vec3(0.055, 0.647, 0.914);   // #0EA5E9
  vec3 sky    = vec3(0.220, 0.741, 0.973);   // #38BDF8
  vec3 cyan   = vec3(0.133, 0.827, 0.933);   // #22D3EE
  vec3 ice    = vec3(0.878, 0.969, 1.000);
  vec3 amber  = vec3(0.984, 0.749, 0.141);
  vec3 slate  = vec3(0.392, 0.455, 0.545);

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  if (d < radius) {
    // Sphere shading
    vec2 sp = p / radius;
    float z = sqrt(max(0.0, 1.0 - dot(sp, sp)));
    vec3 n = normalize(vec3(sp, z));

    // Flowing plasma inside, sampled on the sphere surface and slowly rotated.
    vec3 q = n;
    q.xz *= rot(t * 0.12 * (0.5 + uSwirl));
    q.xy *= rot(t * 0.07 * uSwirl);
    float speed = 0.18 + uSwirl * 0.35 + lvl * 0.6;
    float f1 = fbm(q * 1.6 + vec3(0.0, 0.0, t * speed));
    float f2 = fbm(q * 2.8 + vec3(f1 * 2.2, t * speed * 0.7, -t * 0.1));
    float flow = smoothstep(-0.35, 0.65, f2 + f1 * 0.6);

    // Bands of light that swirl around the core.
    float swirlBands = sin((atan(sp.y, sp.x) + f1 * 3.0) * 3.0 + t * (0.6 + uSwirl * 1.8) - length(sp) * 5.0);
    float bands = smoothstep(0.55, 1.0, swirlBands) * (0.15 + uSwirl * 0.25);

    vec3 base = mix(deep, blue, flow);
    base = mix(base, sky, smoothstep(0.55, 0.95, flow));
    base = mix(base, cyan, bands + lvl * 0.35 * flow);
    base = mix(navy, base, 0.55 + 0.45 * z);

    // Light from top-left, specular highlight, soft fresnel rim.
    vec3 L = normalize(vec3(-0.45, 0.55, 0.75));
    float diff = clamp(dot(n, L), 0.0, 1.0);
    float spec = pow(clamp(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 28.0);
    float fres = pow(1.0 - z, 2.4);

    col = base * (0.55 + 0.6 * diff) * (0.75 + uEnergy * 0.55 + lvl * 0.5);
    col += cyan * fres * (0.65 + lvl * 0.9);
    col += ice * spec * 0.55;
    col += ice * pow(flow, 6.0) * (0.25 + lvl * 0.9);

    // Working: a bright arc travelling around the sphere.
    float arcAng = mod(atan(sp.y, sp.x) - t * 2.4, 6.2831853);
    float arc = smoothstep(1.2, 0.0, arcAng) * smoothstep(0.6, 0.95, length(sp));
    col += mix(cyan, ice, 0.4) * arc * uRing * 1.2;

    // Soft anti-aliased edge.
    alpha = smoothstep(radius, radius - 0.012, d);
  }

  // Outer halo (rendered outside and slightly over the edge).
  float halo = exp(-max(d - radius, 0.0) * (7.0 - lvl * 2.5)) * (0.35 + uEnergy * 0.35 + lvl * 0.6);
  halo *= smoothstep(radius - 0.05, radius + 0.02, d);
  vec3 haloCol = mix(blue, cyan, 0.5 + 0.5 * sin(t * 0.5 + ang));
  // Working ring: a thin orbit just outside the sphere.
  float ringD = abs(d - (radius + 0.09));
  float ring = smoothstep(0.012, 0.0, ringD) * uRing * (0.5 + 0.5 * sin(ang * 3.0 - t * 4.0));

  vec3 outside = haloCol * halo + cyan * ring;
  col = col * alpha + outside * (1.0 - alpha);
  float outAlpha = max(alpha, clamp(halo * 0.9 + ring, 0.0, 1.0));

  // Muted: desaturate towards slate. Error: warm amber tint.
  float g = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, mix(vec3(g), slate * (g * 2.2), 0.5), uMute * 0.8);
  col = mix(col, col * 0.5 + amber * g * 1.3, uWarm * 0.7);

  // On light backgrounds keep the halo from washing out.
  col *= mix(1.0, 1.08, uDark);
  gl_FragColor = vec4(col * outAlpha, outAlpha);
}`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(log || 'shader compile failed');
  }
  return shader;
}

function createProgram(gl) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || 'program link failed');
  }
  return program;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * @param {object} props
 * @param {keyof typeof STATE_TARGETS} props.state
 * @param {() => {input:number, output:number}} [props.getLevels] read every frame
 * @param {number} [props.size] CSS pixels
 */
export function VoiceOrb({ state = 'idle', getLevels, size = 280, className, label }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  const levelsRef = useRef(getLevels);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { levelsRef.current = getLevels; }, [getLevels]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let gl;
    try {
      gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: true });
    } catch { gl = null; }
    if (!gl) { setWebglFailed(true); return undefined; }

    let program;
    try {
      program = createProgram(gl);
    } catch {
      setWebglFailed(true);
      return undefined;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const u = Object.fromEntries(
      ['uTime', 'uLevel', 'uSwirl', 'uEnergy', 'uRing', 'uMute', 'uWarm', 'uDark']
        .map((name) => [name, gl.getUniformLocation(program, name)]),
    );

    const reduced = prefersReducedMotion();
    const current = { ...STATE_TARGETS.idle, level: 0 };
    let raf = 0;
    let last = performance.now();
    let time = Math.random() * 100;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const frame = (now) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      time += dt * (reduced ? 0.35 : 1);
      resize();

      const target = STATE_TARGETS[stateRef.current] || STATE_TARGETS.idle;
      const ease = 1 - Math.exp(-dt * 4);
      for (const key of ['swirl', 'energy', 'ring', 'mute', 'warm', 'follow']) {
        current[key] += (target[key] - current[key]) * ease;
      }

      let raw = 0;
      try {
        const lv = levelsRef.current?.() || { input: 0, output: 0 };
        const s = stateRef.current;
        raw = s === 'speaking' ? lv.output : (s === 'listening' || s === 'user_speaking') ? lv.input : Math.max(lv.output * 0.5, 0);
      } catch { raw = 0; }
      raw = Math.min(1, raw * current.follow * (reduced ? 0.4 : 1));
      // Fast attack, slow release: syllables pop, silence settles.
      const k = raw > current.level ? 1 - Math.exp(-dt * 22) : 1 - Math.exp(-dt * 5);
      current.level += (raw - current.level) * k;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uLevel, current.level);
      gl.uniform1f(u.uSwirl, current.swirl);
      gl.uniform1f(u.uEnergy, current.energy);
      gl.uniform1f(u.uRing, current.ring);
      gl.uniform1f(u.uMute, current.mute);
      gl.uniform1f(u.uWarm, current.warm);
      gl.uniform1f(u.uDark, document.documentElement.classList.contains('dark') ? 1 : 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onLost = (event) => { event.preventDefault(); cancelAnimationFrame(raf); setWebglFailed(true); };
    canvas.addEventListener('webglcontextlost', onLost);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('webglcontextlost', onLost);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <div
      className={cn('relative select-none', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
      data-testid="voice-orb"
      data-state={state}
    >
      {webglFailed ? (
        <div
          className={cn(
            'absolute inset-[12%] rounded-full',
            'bg-[radial-gradient(circle_at_35%_30%,#E0F7FF_0%,#38BDF8_22%,#0EA5E9_45%,#025C9E_75%,#031B34_100%)]',
            'shadow-[0_0_80px_20px_rgba(34,211,238,0.35)]',
            state === 'muted' && 'grayscale',
            ['thinking', 'working', 'connecting'].includes(state) ? 'animate-pulse' : 'motion-safe:animate-[pulse_3s_ease-in-out_infinite]',
          )}
        />
      ) : (
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      )}
    </div>
  );
}

export const ORB_STATES = Object.freeze(Object.keys(STATE_TARGETS));
