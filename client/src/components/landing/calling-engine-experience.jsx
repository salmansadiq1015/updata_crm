'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, AudioLines, Check, CircleUserRound, Pause, Phone, PhoneIncoming, Play, RotateCcw } from 'lucide-react';
import styles from './calling-engine-experience.module.css';

// Fibonacci sphere: evenly distributed points rotated and projected in real time.
export function CallingParticleOrb() {
  const canvasRef = useRef(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!context) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const points = Array.from({ length: 1100 }, (_, index) => {
      const y = 1 - (index / 1099) * 2;
      const radius = Math.sqrt(1 - y * y);
      const angle = Math.PI * (3 - Math.sqrt(5)) * index;
      return [Math.cos(angle) * radius, y, Math.sin(angle) * radius];
    });
    let frame;
    let visible = true;
    let inView = true;
    let phase = 0;
    let previous = 0;
    let width = 0;
    let height = 0;
    const draw = (time = 0) => {
      const delta = previous ? Math.min(time - previous, 50) : 0;
      previous = time;
      if (!paused && !reduced.matches) phase += delta * 0.00012;
      context.clearRect(0, 0, width, height);
      const radius = Math.min(width, height) * 0.31;
      const projected = points.map(([x, y, z], index) => {
        const wave = 1 + Math.sin(y * 7 + phase * 4) * 0.035;
        const rx = (x * Math.cos(phase) + z * Math.sin(phase)) * wave;
        const rz = -x * Math.sin(phase) + z * Math.cos(phase);
        const ry = y * Math.cos(-0.28) - rz * Math.sin(-0.28);
        const depth = y * Math.sin(-0.28) + rz * Math.cos(-0.28);
        const perspective = 3.7 / (3.7 - depth);
        return { x: width / 2 + rx * radius * perspective, y: height / 2 + ry * radius * perspective, depth, index, perspective };
      }).sort((a, b) => a.depth - b.depth);
      for (const point of projected) {
        const alpha = 0.15 + (point.depth + 1) * 0.36;
        context.fillStyle = point.index % 5 === 0 ? `rgba(182,156,255,${alpha})` : `rgba(112,210,255,${alpha})`;
        context.beginPath();
        context.arc(point.x, point.y, (point.index % 11 === 0 ? 1.8 : 1.05) * point.perspective, 0, Math.PI * 2);
        context.fill();
      }
      if (!paused && !reduced.matches && visible && inView) frame = requestAnimationFrame(draw);
    };
    const restart = () => { cancelAnimationFrame(frame); previous = 0; draw(); };
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width;
      height = entry.contentRect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      restart();
    });
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; restart(); });
    const onVisibility = () => { visible = !document.hidden; restart(); };
    resize.observe(canvas);
    observer.observe(canvas);
    reduced.addEventListener('change', restart);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); observer.disconnect(); reduced.removeEventListener('change', restart); document.removeEventListener('visibilitychange', onVisibility); };
  }, [paused]);

  return <div className={styles.orbStage} data-paused={paused}>
    <div className={styles.stageTop}><span><i /> VOICE ENGINE</span><span>INBOUND + OUTBOUND</span></div>
    <div className={styles.orbGlow} aria-hidden="true" />
    <div className={styles.orbit} aria-hidden="true" /><div className={styles.orbitTwo} aria-hidden="true" />
    <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
    <div className={styles.orbCore} aria-hidden="true"><AudioLines strokeWidth={1} /></div>
    <div className={`${styles.floatingLabel} ${styles.inboundLabel}`}><span><ArrowDownLeft /></span><div>Incoming call<small>Answered with context</small></div></div>
    <div className={`${styles.floatingLabel} ${styles.outboundLabel}`}><span><ArrowUpRight /></span><div>Next opportunity<small>A conversation away</small></div></div>
    <div className={styles.stageBottom}><span><i /> One intelligent voice. Both directions.</span><button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? 'Resume particle animation' : 'Pause particle animation'} aria-pressed={paused}>{paused ? <Play /> : <Pause />}</button></div>
  </div>;
}

const stages = [
  { status: 'Incoming call', title: 'A new conversation is calling.', text: 'Your connected business number receives a call. Your answering rules decide what happens next.', action: 'Let the AI answer', speaker: 'CALLER', message: 'Incoming call to your business number', detail: 'Caller identification · Answering rules checked' },
  { status: 'AI agent connected', title: 'A warm welcome. A useful answer.', text: 'Your agent introduces itself, understands the request and responds using your approved business knowledge.', action: 'See the call outcome', speaker: 'AI RECEPTIONIST', message: '“Thanks for calling. I’m your AI assistant. How can I help you today?”', detail: 'Language preferences · Relevant questions · Captured answers' },
  { status: 'Conversation complete', title: 'The call ends. The context stays.', text: 'A transcript, captured details and a clear next step come together in your CRM for the right person to follow up.', action: 'Replay the preview', speaker: 'CALL SUMMARY', message: 'Caller requested more information and a callback from the sales team.', detail: 'Customer linked · Interest captured · Follow-up suggested' },
];

export function IncomingCallPreview() {
  const [step, setStep] = useState(0);
  const stage = stages[step];
  return <div className={styles.callPreview}>
    <div className={styles.previewHeader}><span><PhoneIncoming /> AI receptionist</span><small>INTERACTIVE PREVIEW</small></div>
    <div className={styles.progress} aria-label={`Step ${step + 1} of 3`}>{['Receive', 'Answer', 'Follow through'].map((label, index) => <span key={label} data-active={index <= step}><b>{index < step ? <Check /> : `0${index + 1}`}</b>{label}</span>)}</div>
    <div className={styles.previewContent} aria-live="polite" aria-atomic="true">
      <div className={styles.callerIcon}>{step === 2 ? <Check /> : step === 1 ? <AudioLines /> : <Phone />}</div>
      <p className={styles.callStatus}>{stage.status}</p><h3>{stage.title}</h3><p className={styles.callDescription}>{stage.text}</p>
      <div className={styles.transcript}><span>{stage.speaker}</span><p>{stage.message}</p><small>{stage.detail}</small></div>
    </div>
    <button type="button" className={styles.previewAction} onClick={() => setStep(value => (value + 1) % stages.length)}>{step === 2 ? <RotateCcw /> : <PhoneIncoming />}{stage.action}{step !== 2 && <ArrowUpRight />}</button>
    <p className={styles.previewNote}><CircleUserRound /> Illustrative demo · No real call is placed</p>
  </div>;
}
