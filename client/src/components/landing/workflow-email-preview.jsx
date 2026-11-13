'use client';

import { useState } from 'react';
import { Check, Clock3, Mail, ShieldCheck } from 'lucide-react';
import styles from './workflow-automation.module.css';

const stages = [
  { label: '01 · Draft', icon: Mail, subject: 'A useful next step for your team', body: 'Hi Jordan,\n\nThanks for getting in touch. I’ve put together the information we discussed, with a clear next step for your team.\n\nWould a short conversation next week be helpful?', status: 'AI-assisted draft · Ready for a person to review. Nothing has been sent.' },
  { label: '02 · Review', icon: ShieldCheck, subject: 'Your message. Your final say.', body: 'Check the recipient, sending account and wording. Make the message sound like your team, then approve it when it is ready.', status: 'Human review · Confirm the content and account before authorizing a send.' },
  { label: '03 · Follow up', icon: Clock3, subject: 'Keep the next conversation in view', body: 'In a configured workflow, a reply or engagement signal can move the lead to the next branch. A timeout gives the workflow a path when no signal arrives.', status: 'Connected workflow · Follow up according to your published rules and permissions.' },
];

export function WorkflowEmailPreview() {
  const [stage, setStage] = useState(0);
  const current = stages[stage];
  const Icon = current.icon;
  return <div className={styles.emailPreview}>
    <div className={styles.emailTop}><span><Mail aria-hidden="true" />Your email workspace</span><small>INTERACTIVE PREVIEW</small></div>
    <div className={styles.emailTabs} role="group" aria-label="Email preview stages">{stages.map((item, index) => <button type="button" key={item.label} onClick={() => setStage(index)} aria-pressed={stage === index}>{item.label}</button>)}</div>
    <div className={styles.emailMessage} aria-live="polite" aria-atomic="true"><div className={styles.emailRecipient}><span aria-hidden="true">JT</span><div><p>Jordan Taylor</p><small>Example CRM contact</small></div></div><h3 className={styles.emailSubject}>{current.subject}</h3><p className={styles.emailBody}>{current.body}</p><p className={styles.emailStatus}><Icon aria-hidden="true" />{current.status}</p></div>
    <p className={styles.emailFooter}><Check aria-hidden="true" className="me-1 inline size-3" />Illustrative example. Email review and published workflow actions have separate controls.</p>
  </div>;
}
