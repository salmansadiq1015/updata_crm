'use client';

import Link from 'next/link';
import { ArrowRight, GitBranch, Mail, PhoneCall } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { Reveal } from './motion-primitives';
import { WorkflowAutomationDemo } from './workflow-automation-demo';
import styles from './workflow-automation.module.css';

export function WorkflowAutomationSection() {
  const { t } = useLanguage();
  return <section id="workflow-automation" className={styles.landingSection} aria-labelledby="automation-section-title">
    <div className={styles.container}>
      <Reveal className={styles.sectionHeading}>
        <div><p className={styles.eyebrow}>{t('landing.automation.eyebrow', 'WORKFLOW AUTOMATION')}</p><h2 id="automation-section-title">{t('landing.automation.title', 'Your best process.')}<br /><span className={styles.gradientText}>{t('landing.automation.accent', 'Already in motion.')}</span></h2></div>
        <div className={styles.headingAside}><p>{t('landing.automation.description', 'Connect AI calls, email, SMS and CRM actions in a visual workflow. Give every lead a next step, and your team more room for the work that needs them.')}</p><Link href="/workflow-automation" className={styles.textLink}>{t('landing.automation.explore', 'Explore more')}<ArrowRight aria-hidden="true" /></Link></div>
      </Reveal>
      <Reveal className={styles.demoWrap}><WorkflowAutomationDemo /></Reveal>
      <div className={styles.capabilityRow}>{[[PhoneCall, t('landing.automation.calls', 'AI calls with a clear purpose')], [Mail, t('landing.automation.email', 'Email connected to the next step')], [GitBranch, t('landing.automation.routing', 'Different outcomes. Thoughtful paths.')]].map(([Icon, label]) => <span key={label}><Icon aria-hidden="true" />{label}</span>)}</div>
    </div>
  </section>;
}
