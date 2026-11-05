'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useInView } from 'framer-motion';
import { Building2, Check, CheckCheck, FileText, FolderKanban, Link2, MessageSquare, Pause, PhoneCall, Play, RotateCcw, Send, UserPlus } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { DemoLabel } from './motion-primitives';
import styles from './communication-demo.module.css';

const chain = [
  ['customer', Building2, '104 167 255'],
  ['conversation', MessageSquare, '141 153 255'],
  ['lead', UserPlus, '92 211 203'],
  ['quote', FileText, '226 182 117'],
  ['project', FolderKanban, '164 147 255'],
  ['followup', PhoneCall, '96 205 163'],
];

function subscribeToMotionPreference(onChange) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const getMotionPreference = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const getServerMotionPreference = () => false;

function subscribeToPageVisibility(onChange) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

const getPageVisibility = () => !document.hidden;
const getServerPageVisibility = () => true;

export function CommunicationDemo() {
  const { t } = useLanguage();
  const root = useRef(null);
  const inView = useInView(root, { amount: .25 });
  const reducedMotion = useSyncExternalStore(subscribeToMotionPreference, getMotionPreference, getServerMotionPreference);
  const pageVisible = useSyncExternalStore(subscribeToPageVisibility, getPageVisibility, getServerPageVisibility);
  const [paused, setPaused] = useState(false);
  const [step, setStep] = useState(0);
  const [replay, setReplay] = useState(0);
  const phase = reducedMotion ? 7 : step;
  const running = inView && pageVisible && !paused && !reducedMotion;

  useEffect(() => {
    if (!running) return;
    const timer = setTimeout(() => setStep(value => (value + 1) % 8), step === 7 ? 4200 : 1800);
    return () => clearTimeout(timer);
  }, [running, step, replay]);

  return (
    <div ref={root} className={styles.demo} data-communication-demo data-running={Boolean(running)} data-phase={phase}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarTitle}><span className={styles.appIcon}><MessageSquare aria-hidden="true" /></span>{t('landing.communication.eyebrow')}</div>
        {!reducedMotion && <div className={styles.controls}>
          <button type="button" data-demo-toggle aria-label={t(paused ? 'experience.communication.resume' : 'experience.communication.pause')} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}</button>
          <button type="button" data-demo-replay aria-label={t('experience.communication.replay')} onClick={() => { setStep(0); setPaused(false); setReplay(value => value + 1); }}><RotateCcw aria-hidden="true" /></button>
        </div>}
      </div>
      <div className={styles.workspace}>
        <div className={styles.conversation}>
          <div className={styles.conversationHeader}>
            <span className={styles.avatar}>SK<span /></span>
            <div className={styles.projectTitle}><h3>{t('experience.preview.project')}</h3><p>{t('experience.preview.online')}</p></div>
            <div className={styles.team} aria-hidden="true"><span>SK</span><span>JM</span><span>AL</span></div>
          </div>
          <div className={styles.messages}>
            <div className={styles.messageRow}>
              <span className={styles.senderAvatar}>SK</span>
              <div className={styles.incoming}><p>{t('landing.communication.message1')}</p><div className={styles.messageMeta}><span>09:24 · Sarah</span></div></div>
            </div>
            <div className={styles.replySlot}>
              <div className={styles.typing} data-visible={phase === 0} aria-hidden="true"><span /><span /><span /></div>
              <div className={styles.outgoing} data-visible={phase >= 1}><p>{t('landing.communication.message2')}</p><div className={styles.messageMeta}><span>{t('experience.preview.you')}</span><CheckCheck aria-hidden="true" /></div></div>
            </div>
            <div className={styles.linkEvent} data-visible={phase >= 2} aria-hidden={phase < 2}><span><Link2 aria-hidden="true" /></span><p>{t('experience.communication.linked')}</p><Check aria-hidden="true" /></div>
          </div>
          <div className={styles.composer} aria-hidden="true"><MessageSquare /><span>{t('experience.preview.write')}</span><span className={styles.send}><Send className="rtl:rotate-180" /></span></div>
        </div>
        <div className={styles.context}>
          <div className={styles.contextHeading}><div><span className={styles.eyebrow}>{t('experience.preview.context')}</span><p>{t(reducedMotion ? 'experience.communication.oneThread' : 'experience.communication.inspect')}</p></div><span className={styles.contextIcon}><Link2 aria-hidden="true" /></span></div>
          <div className={styles.chain}>
            {chain.map(([key, Icon, tint], index) => {
              const connected = phase >= index + 2;
              return <button key={key} type="button" className={styles.contextRow} data-connected={connected} data-active={phase === index + 2} aria-pressed={phase === index + 2} disabled={reducedMotion} onClick={() => { setStep(index + 2); setPaused(true); }} style={{ '--tint': tint }}>
                <span className={styles.recordIcon}><Icon aria-hidden="true" /></span>
                <span className={styles.recordName}>{t(`landing.communication.${key}`)}</span>
                <span className={styles.recordState}>{connected ? <Check aria-hidden="true" /> : <span />}</span>
              </button>;
            })}
          </div>
          <div className={styles.syncStatus}><span className={styles.syncDot} data-complete={phase === 7} /><span>{t(phase === 7 ? 'experience.communication.complete' : 'experience.communication.connecting')}</span><div className={styles.progress} aria-hidden="true"><span style={{ width: `${Math.max(0, phase - 1) / 6 * 100}%` }} /></div></div>
        </div>
      </div>
      <div className={styles.demoFooter}><span className={styles.footerLine} /><DemoLabel>{t('landing.showcase.demo')}</DemoLabel></div>
    </div>
  );
}
