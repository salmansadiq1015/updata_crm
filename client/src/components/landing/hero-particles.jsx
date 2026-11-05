'use client';

import { useState } from 'react';
import { ChartNoAxesCombined, MessageCircle, Pause, PhoneCall, Play, Radar, Users, Workflow } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import styles from './hero-particles.module.css';

const objects = [
  { Icon: Radar, x: '8%', y: '22%', color: '105 166 255', delay: '-2s', rotate: '-18deg' },
  { Icon: PhoneCall, x: '86%', y: '25%', color: '163 137 255', delay: '-6s', rotate: '16deg' },
  { Icon: Users, x: '10%', y: '60%', color: '79 217 214', delay: '-4s', rotate: '-12deg' },
  { Icon: Workflow, x: '91%', y: '65%', color: '112 169 255', delay: '-9s', rotate: '22deg' },
  { Icon: MessageCircle, x: '3%', y: '80%', color: '181 141 255', delay: '-7s', rotate: '-20deg' },
  { Icon: ChartNoAxesCombined, x: '88%', y: '85%', color: '244 181 115', delay: '-1s', rotate: '12deg' },
];

export function HeroParticles() {
  const [paused, setPaused] = useState(false);
  const { t } = useLanguage();

  return (
    <>
      <div className={styles.field} data-paused={paused} data-hero-particles aria-hidden="true">
        <div className={styles.halo} />
        <div className={styles.arc} />
        <div className={styles.arcSecondary} />
        {objects.map(({ Icon, x, y, color, delay, rotate }, index) => (
          <div key={index} className={styles.object} style={{ '--x': x, '--y': y, '--tint': color, '--delay': delay, '--tilt': rotate }}>
            <div className={styles.tile}><Icon strokeWidth={1.3} /></div>
          </div>
        ))}
        <div className={styles.streams}>
          {Array.from({ length: 24 }, (_, index) => (
            <div key={index} className={styles.traveler} style={{
              '--y': `${10 + (index * 37 % 82)}%`,
              '--duration': `${26 + index % 7 * 4}s`,
              '--delay': `${-index * 3.7}s`,
              '--size': `${3 + index % 4 * 2}px`,
              '--tint': objects[index % objects.length].color,
              animationDirection: index % 2 ? 'reverse' : 'normal',
            }}><span /></div>
          ))}
        </div>
        <div className={styles.orb} />
        <div className={styles.orbSmall} />
        <div className={styles.ring} />
      </div>
      <button type="button" className={styles.motionToggle}
        aria-label={t(paused ? 'experience.hero.resumeMotion' : 'experience.hero.pauseMotion')}
        aria-pressed={paused} onClick={() => setPaused(value => !value)}>
        {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
      </button>
    </>
  );
}
