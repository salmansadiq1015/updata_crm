'use client';

import { useState } from 'react';
import { CalendarClock, ClipboardCheck, Inbox, LifeBuoy, ShieldCheck, Smartphone } from 'lucide-react';
import { useRecoveryCounts, useReviewCounts, useSmsOpsRealtime } from '../hooks/use-sms-ops';
import { AnswerReviewQueue } from './answer-review-queue';
import { ContactPolicySettingsForm } from './contact-policy-settings';
import { DeviceDashboard } from './device-dashboard';
import { RecoveryInbox } from './recovery-inbox';
import { SmsCallbacksList } from './sms-callbacks-list';
import { useSmsOpsLanguage } from './use-sms-ops-language';

export type SmsOpsTab = 'devices' | 'recovery' | 'reviews' | 'callbacks' | 'policy';
const TABS: { id: SmsOpsTab; icon: typeof Smartphone; fallback: string }[] = [
  { id: 'devices', icon: Smartphone, fallback: 'Phones' },
  { id: 'recovery', icon: Inbox, fallback: 'Recovery inbox' },
  { id: 'reviews', icon: ClipboardCheck, fallback: 'Answer reviews' },
  { id: 'callbacks', icon: CalendarClock, fallback: 'Callbacks' },
  { id: 'policy', icon: ShieldCheck, fallback: 'Contact limits' },
];

/** SMS operations: the Android phones that send SIM SMS, what needs a human, and the contact limits. */
export function SmsOpsWorkspace({ initialTab = 'devices' }: { initialTab?: SmsOpsTab }) {
  const { t } = useSmsOpsLanguage();
  const [tab, setTab] = useState<SmsOpsTab>(initialTab);
  useSmsOpsRealtime();
  const recovery = useRecoveryCounts();
  const reviews = useReviewCounts();
  const badge = (id: SmsOpsTab) => (id === 'recovery' ? recovery.data?.open : id === 'reviews' ? reviews.data?.pending : 0) || 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500/10 ring-1 ring-brand-500/20"><LifeBuoy className="h-5 w-5 text-brand-500" /></div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">{t('smsOps.title', 'SMS operations')}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{t('smsOps.subtitle', 'Health of the phones that send SIM SMS, messages that need a human decision, and the contact limits shared by calls and messages.')}</p>
        </div>
      </div>

      <div role="tablist" aria-label={t('smsOps.title', 'SMS operations')} className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map(({ id, icon: Icon, fallback }) => {
          const n = badge(id);
          return (
            <button
              key={id} type="button" role="tab" id={`sms-ops-tab-${id}`} aria-selected={tab === id} aria-controls={`sms-ops-panel-${id}`}
              onClick={() => setTab(id)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium ${tab === id ? 'border-brand-500 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {t(`smsOps.tabs.${id}`, fallback)}
              {n ? <span className="rounded-full bg-amber-500/15 px-1.5 text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-400">{n}</span> : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`sms-ops-panel-${tab}`} aria-labelledby={`sms-ops-tab-${tab}`}>
        {tab === 'devices' ? <DeviceDashboard /> : null}
        {tab === 'recovery' ? <RecoveryInbox /> : null}
        {tab === 'reviews' ? <AnswerReviewQueue /> : null}
        {tab === 'callbacks' ? <SmsCallbacksList /> : null}
        {tab === 'policy' ? <ContactPolicySettingsForm /> : null}
      </div>
    </div>
  );
}
