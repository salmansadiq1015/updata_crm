'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Bell, BrainCircuit, Check, ChevronLeft, ChevronRight, Clock3, ListTodo, Mail, MessageSquare, Pause, PhoneCall, PhoneMissed, Play, RotateCcw, Sparkles, Tag, UserRoundPlus, Workflow } from 'lucide-react';
import { workflowScenarios } from './workflow-marketing-content';
import styles from './workflow-automation.module.css';

const icons = { bell: Bell, brain: BrainCircuit, check: Check, clock: Clock3, task: ListTodo, mail: Mail, message: MessageSquare, call: PhoneCall, missed: PhoneMissed, tag: Tag, lead: UserRoundPlus };
const motionQuery = '(prefers-reduced-motion: reduce)';
function subscribeToMotion(listener) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
const getMotionSnapshot = () => window.matchMedia(motionQuery).matches;
const getServerMotionSnapshot = () => false;
const positions = ['trigger', 'action', 'decision', 'branchLeft', 'branchRight', 'outcome'];
const edges = [
  { show: 1, path: 'M500 72V100' },
  { show: 2, path: 'M500 172V200' },
  { show: 3, path: 'M500 272V286Q500 290 490 290H260Q250 290 250 300' },
  { show: 4, path: 'M500 272V286Q500 290 510 290H740Q750 290 750 300' },
  { show: 5, path: 'M250 372V382Q250 386 260 386H490Q500 386 500 400' },
  { show: 5, path: 'M750 372V382Q750 386 740 386H510Q500 386 500 400' },
];

export function WorkflowAutomationDemo() {
  const id = useId();
  const rootRef = useRef(null);
  // Keep server HTML and the initial client render identical. Reading the
  // media preference directly during hydration changes the playback controls.
  const reducedMotion = useSyncExternalStore(subscribeToMotion, getMotionSnapshot, getServerMotionSnapshot);
  const [scenarioIndex, setScenarioIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  const scenario = workflowScenarios[scenarioIndex];
  const autoPlaying = playing && !reducedMotion;
  const running = autoPlaying && visible && tabVisible;

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.15 });
    if (rootRef.current) observer.observe(rootRef.current);
    const onVisibility = () => setTabVisible(!document.hidden);
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  useEffect(() => {
    if (!running) return;
    // The completed graph stays on screen long enough to inspect before looping.
    const timer = window.setTimeout(() => setStep(value => (value + 1) % scenario.steps.length), step === 6 ? 6500 : 3300);
    return () => window.clearTimeout(timer);
  }, [running, step, scenario]);

  function goToStep(next) {
    setPlaying(false);
    setStep(Math.max(0, Math.min(next, scenario.steps.length - 1)));
  }

  function selectScenario(index) {
    setScenarioIndex(index);
    setStep(0);
  }

  function handleTabKey(event, index) {
    const direction = getComputedStyle(event.currentTarget).direction === 'rtl' ? -1 : 1;
    let next;
    if (event.key === 'ArrowRight') next = (index + direction + workflowScenarios.length) % workflowScenarios.length;
    else if (event.key === 'ArrowLeft') next = (index - direction + workflowScenarios.length) % workflowScenarios.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = workflowScenarios.length - 1;
    else return;
    event.preventDefault();
    selectScenario(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  }

  return <div ref={rootRef} className={styles.demo} data-running={running} data-testid="workflow-demo">
    <div className={styles.demoHeader}>
      <div className={styles.demoHeading}><span className={styles.demoMark}><Workflow aria-hidden="true" /></span><div><h3>Build a workflow. Watch it work.</h3><p>Three real use cases. One connected canvas.</p></div></div>
      <span className={styles.previewBadge}><span />Interactive preview</span>
    </div>
    <div role="tablist" aria-label="Workflow examples" className={styles.scenarioTabs}>
      {workflowScenarios.map((item, index) => {
        const Icon = icons[item.icon];
        return <button type="button" role="tab" id={`${id}-tab-${index}`} aria-controls={`${id}-panel`} aria-selected={scenarioIndex === index} tabIndex={scenarioIndex === index ? 0 : -1} key={item.id} onKeyDown={event => handleTabKey(event, index)} onClick={() => selectScenario(index)}><Icon aria-hidden="true" /><span>{item.label}</span></button>;
      })}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${scenarioIndex}`} tabIndex={0} className={styles.demoBody}>
      <aside className={styles.blockPalette} aria-label="Workflow building blocks"><p>BUILDING BLOCKS</p><ol>{scenario.nodes.map((node, index) => {
        const Icon = icons[node.icon];
        return <li key={`${scenario.id}-${index}`}><button type="button" onClick={() => goToStep(index)} aria-label={`Show step ${index + 1}: ${node.title}`} aria-current={step === index ? 'step' : undefined} data-added={index <= step}><span className={styles.blockIcon} data-tone={node.tone}><Icon aria-hidden="true" /></span><span>{node.title}</span>{index <= step && <Check aria-hidden="true" className={styles.blockCheck} />}</button></li>;
      })}</ol><div className={styles.paletteNote}><Sparkles aria-hidden="true" /><p>Start with a template.<br />Make the process yours.</p></div></aside>
      <div className={styles.canvasArea}>
        <div className={styles.canvasTopline}><span><i />{step === 6 ? 'Ready to review' : 'Building your workflow'}</span><span>ILLUSTRATIVE DEMO</span></div>
        <div className={styles.diagram} aria-label={`${scenario.label}: ${scenario.nodes.slice(0, Math.min(step + 1, 6)).map(node => node.title).join(', ')}`}>
          <svg className={styles.connections} viewBox="0 0 1000 472" preserveAspectRatio="none" fill="none" aria-hidden="true">{edges.map((edge, index) => <g key={index} data-visible={step >= edge.show}><path d={edge.path} className={styles.edgeBase} /><path d={edge.path} className={styles.edgeSignal} /></g>)}</svg>
          {scenario.nodes.map((node, index) => {
            const Icon = icons[node.icon];
            return <div key={`${scenario.id}-${index}`} className={`${styles.flowNode} ${styles[positions[index]]}`} data-visible={step >= index} data-current={step === index || step === 6} data-tone={node.tone} aria-hidden={step < index}>
              <span className={styles.nodePort} /><span className={styles.blockIcon} data-tone={node.tone}><Icon aria-hidden="true" /></span><div className={styles.nodeText}><strong>{node.title}</strong><small>{node.detail}</small></div>{step > index && <Check className={styles.nodeCheck} aria-hidden="true" />}
              {index === 3 || index === 4 ? <span className={styles.branchLabel}>{scenario.branches[index - 3]}</span> : null}
            </div>;
          })}
        </div>
        <div className={styles.stepCaption} aria-live={autoPlaying ? 'off' : 'polite'} aria-atomic="true"><span className={styles.stepNumber}>0{step + 1}</span><div><h4>{scenario.steps[step][0]}</h4><p>{scenario.steps[step][1]}</p></div></div>
      </div>
    </div>
    <div className={styles.demoControls}>
      <div className={styles.playback}><button type="button" onClick={() => goToStep(0)} aria-label="Restart workflow preview"><RotateCcw /></button><button type="button" onClick={() => goToStep(step - 1)} disabled={step === 0} aria-label="Previous workflow step"><ChevronLeft /></button>{!reducedMotion && <button type="button" className={styles.playButton} onClick={() => setPlaying(value => !value)} aria-label={playing ? 'Pause workflow animation' : 'Play workflow animation'} aria-pressed={playing}>{playing ? <Pause /> : <Play />}</button>}<button type="button" onClick={() => goToStep(step + 1)} disabled={step === scenario.steps.length - 1} aria-label="Next workflow step"><ChevronRight /></button></div>
      <div className={styles.stepProgress} aria-label={`Step ${step + 1} of ${scenario.steps.length}`}>{scenario.steps.map(([title], index) => <button type="button" key={title} onClick={() => goToStep(index)} aria-label={`Step ${index + 1}: ${title}`} aria-current={step === index ? 'step' : undefined} data-complete={index <= step} />)}</div>
      <span className={styles.stepCount}>{step + 1} / {scenario.steps.length}</span>
    </div>
    <p className={styles.demoDisclaimer}>Explore the process here. Configure, test and publish it in your workspace. No calls or messages are sent by this preview.</p>
  </div>;
}
