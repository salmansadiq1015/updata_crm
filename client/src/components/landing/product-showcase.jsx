'use client';

import { useRef, useState } from 'react';
import { AnimatePresence, motion, useInView, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';
import { Bot, CheckSquare2, ContactRound, FolderKanban, LayoutDashboard, LockKeyhole, Radar, Users } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { AiVisual, CustomerVisual, DashboardVisual, LeadGenerationVisual, LeadsVisual, OperationsVisual, TasksVisual } from './landing-visuals';
import { DemoLabel, SectionIntro } from './motion-primitives';
import { cn } from '@/lib/utils';
import styles from './product-showcase.module.css';

const tabs = [
  ['overview', DashboardVisual, LayoutDashboard], ['leads', LeadsVisual, ContactRound],
  ['leadgen', LeadGenerationVisual, Radar], ['customers', CustomerVisual, Users],
  ['projects', OperationsVisual, FolderKanban], ['ai', AiVisual, Bot], ['tasks', TasksVisual, CheckSquare2],
];

export function ProductShowcase() {
  const { t, dir } = useLanguage();
  const [active, setActive] = useState('overview');
  const stageRef = useRef(null);
  const isInView = useInView(stageRef, { amount: 0.15 });
  const reducedMotion = useReducedMotion();
  const tiltX = useMotionValue(0);
  const tiltY = useMotionValue(0);
  const rotateX = useSpring(tiltX, { stiffness: 100, damping: 25 });
  const rotateY = useSpring(tiltY, { stiffness: 100, damping: 25 });
  const activeIndex = tabs.findIndex(([key]) => key === active);
  const [, ActiveVisual, ActiveIcon] = tabs[activeIndex];

  function handleTabKey(event) {
    let next;
    const direction = dir === 'rtl' ? -1 : 1;
    if (event.key === 'ArrowRight') next = (activeIndex + direction + tabs.length) % tabs.length;
    if (event.key === 'ArrowLeft') next = (activeIndex - direction + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      setActive(tabs[next][0]);
      const tab = document.getElementById(`showcase-tab-${tabs[next][0]}`);
      tab?.focus({ preventScroll: true });
      tab?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }

  function handlePointerMove(event) {
    if (reducedMotion || event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    tiltX.set((0.5 - (event.clientY - bounds.top) / bounds.height) * 3);
    tiltY.set(((event.clientX - bounds.left) / bounds.width - 0.5) * 3);
  }

  return (
    <section id="showcase" className={cn(styles.section, 'relative overflow-hidden py-24 sm:py-32 lg:py-36')}>
      <div className={styles.ambient} aria-hidden="true" />
      <div className="relative mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <SectionIntro eyebrow={t('landing.showcase.eyebrow')} title={t('landing.showcase.title')} description={t('landing.showcase.description')} className="relative z-10 lg:max-w-[780px]" />
          <div className={styles.sculpture} aria-hidden="true"><div className={styles.orbit} /><div className={styles.cube}><span /><span /><span /></div><div className={styles.satellite} /></div>
        </div>
        <motion.div initial={false} className="relative z-10 mt-10 sm:mt-12">
          <div role="tablist" aria-label={t('landing.showcase.title')} onKeyDown={handleTabKey} className={cn(styles.tabs, 'scrollbar-hide')}>
            {tabs.map(([key, , Icon]) => (
              <button id={`showcase-tab-${key}`} key={key} type="button" role="tab" tabIndex={active === key ? 0 : -1} aria-selected={active === key} aria-controls={`showcase-panel-${key}`} onClick={() => setActive(key)} className={cn(styles.tab, active === key && styles.selected)}>
                {active === key && <motion.span layoutId="showcase-tab" className={styles.tabSurface} transition={{ type: 'spring', stiffness: 350, damping: 32 }} />}
                <Icon className="relative size-4 shrink-0" aria-hidden="true" /><span className="relative">{t(`landing.showcase.${key}`)}</span>
              </button>
            ))}
          </div>
        </motion.div>
        <div ref={stageRef} className={styles.stage} data-visible={isInView}>
          <motion.div initial={false} animate={{ y: reducedMotion || isInView ? 0 : 30 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            <motion.div onPointerMove={handlePointerMove} onPointerLeave={() => { tiltX.set(0); tiltY.set(0); }} style={{ rotateX: reducedMotion ? 0 : rotateX, rotateY: reducedMotion ? 0 : rotateY }} className={styles.frame}>
              <div className={styles.windowBar}>
                <div className={styles.windowDots} aria-hidden="true"><i /><i /><i /></div>
                <div className={styles.address}><LockKeyhole className="size-3" aria-hidden="true" /><span>app.updata.ai</span><span className="text-slate-600">/</span><span className="truncate text-slate-300">{t(`landing.showcase.${active}`)}</span></div>
                <span className={styles.live}><span />{t('experience.preview.live')}</span>
              </div>
              <div className={styles.workspace}>
                <AnimatePresence mode="wait" initial={false}>
                  <motion.div id={`showcase-panel-${active}`} role="tabpanel" aria-labelledby={`showcase-tab-${active}`} tabIndex={0} key={active} initial={{ opacity: 0, y: reducedMotion ? 0 : 14, filter: reducedMotion ? 'none' : 'blur(5px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} exit={{ opacity: 0, y: reducedMotion ? 0 : -8, filter: reducedMotion ? 'none' : 'blur(4px)' }} transition={{ duration: reducedMotion ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }} className={styles.preview}>
                    <ActiveVisual framed={false} />
                  </motion.div>
                </AnimatePresence>
              </div>
              <div className={styles.caption}>
                <div className="flex min-w-0 items-center gap-3"><span className={styles.captionIcon}><ActiveIcon className="size-4" aria-hidden="true" /></span><p className="text-xs leading-5 text-slate-400 sm:text-sm">{t(`landing.showcase.desc.${active}`)}</p></div>
                <div className={styles.pagination} aria-hidden="true"><span>0{activeIndex + 1}</span><span className={styles.paginationLine}><motion.span animate={{ width: `${((activeIndex + 1) / tabs.length) * 100}%` }} /></span><span>0{tabs.length}</span></div>
              </div>
            </motion.div>
          </motion.div>
          <div className={styles.underlay} aria-hidden="true" />
        </div>
        <div className="mt-7 flex justify-center"><DemoLabel>{t('landing.showcase.demo')}</DemoLabel></div>
      </div>
    </section>
  );
}
