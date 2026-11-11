'use client';

import { useState } from 'react';
import { CalendarClock, ClipboardCheck, Inbox, MessageSquareText, Send, ShieldCheck, Smartphone } from 'lucide-react';
import { intlLocaleFor } from '@/lib/i18n/locale-config';
import { HeroStat } from '@/shared/components/hero-art';
import { HeroPill, PageHero, heroButton, pageTabs } from '@/shared/components/page-hero';
import { useRecoveryCounts, useReviewCounts, useSmsCallbacks, useSmsDevices, useSmsOpsRealtime } from '../hooks/use-sms-ops';
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
  const { t, locale } = useSmsOpsLanguage();
  const [tab, setTab] = useState<SmsOpsTab>(initialTab);
  useSmsOpsRealtime();
  const recovery = useRecoveryCounts();
  const reviews = useReviewCounts();
  const badge = (id: SmsOpsTab) => (id === 'recovery' ? recovery.data?.open : id === 'reviews' ? reviews.data?.pending : 0) || 0;

  const devices = useSmsDevices();
  const callbacks = useSmsCallbacks();
  const list = devices.data ?? [];
  const online = list.filter((d) => d.health.status === 'online').length;
  const attention = list.filter((d) => d.health.status !== 'online').length;
  const queued = list.reduce((sum, d) => sum + (d.queue?.pending ?? 0) + (d.queue?.attempting ?? 0), 0);
  const failed = list.reduce((sum, d) => sum + (d.queue?.failed ?? 0), 0);
  const nf = new Intl.NumberFormat(intlLocaleFor(locale));
  const n = (v: number | undefined) => (v == null ? '—' : nf.format(v));

  return (
    <div className="flex flex-col gap-5">
      <PageHero
        id="sms-ops-title"
        art="/hero/smsops"
        icon={MessageSquareText}
        eyebrow={t('smsOps.title', 'SMS operations')}
        title={t('hero.sms.title', 'Every message, delivered with care.')}
        subtitle={t('smsOps.subtitle', 'Health of the phones that send SIM SMS, messages that need a human decision, and the contact limits shared by calls and messages.')}
        status={devices.data ? (
          <HeroPill tone={!list.length ? 'off' : attention ? 'warn' : 'ok'} onClick={() => setTab('devices')}>
            {!list.length ? t('hero.sms.noPhones', 'No phones connected') : attention ? t('hero.sms.attention', '{count} phone(s) need attention', { count: attention }) : t('hero.sms.allOnline', 'All phones online')}
          </HeroPill>
        ) : null}
        actions={<>
          <button type="button" className={heroButton.ghost} onClick={() => setTab('policy')}><ShieldCheck aria-hidden="true" />{t('smsOps.tabs.policy', 'Contact limits')}</button>
          <button type="button" className={heroButton.primary} onClick={() => setTab('recovery')}><Inbox aria-hidden="true" />{t('smsOps.tabs.recovery', 'Recovery inbox')}</button>
        </>}
        stats={<>
          <HeroStat icon={Smartphone} label={t('hero.sms.phonesOnline', 'Phones online')} value={devices.data ? `${n(online)} / ${n(list.length)}` : '—'} hint={t('hero.sms.phonesHint', 'Android phones sending SIM SMS')} loading={devices.isLoading} />
          <HeroStat icon={Send} tone="text-cyan-300" label={t('hero.sms.queued', 'In the send queue')} value={n(devices.data ? queued : undefined)} hint={failed ? t('hero.sms.failed', '{count} failed on the phone', { count: nf.format(failed) }) : t('hero.sms.queuedHint', 'Waiting or being sent now')} loading={devices.isLoading} />
          <button type="button" onClick={() => setTab('recovery')} className="rounded-2xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50">
            <HeroStat icon={Inbox} tone="text-amber-300" label={t('smsOps.tabs.recovery', 'Recovery inbox')} value={n(recovery.data?.open)} hint={t('hero.sms.recoveryHint', 'Messages that need a decision')} loading={recovery.isLoading} />
          </button>
          <button type="button" onClick={() => setTab('reviews')} className="rounded-2xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/50">
            <HeroStat icon={ClipboardCheck} label={t('smsOps.tabs.reviews', 'Answer reviews')} value={n(reviews.data?.pending)} hint={t('hero.sms.reviewsHint', 'AI answers awaiting a check')} loading={reviews.isLoading} />
          </button>
          <button type="button" onClick={() => setTab('callbacks')} className="col-span-2 rounded-2xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50 lg:col-span-1">
            <HeroStat icon={CalendarClock} tone="text-emerald-300" label={t('smsOps.tabs.callbacks', 'Callbacks')} value={n(callbacks.data?.length)} hint={t('hero.sms.callbacksHint', 'Promised by SMS')} loading={callbacks.isLoading} />
          </button>
        </>}
      />

      <div role="tablist" aria-label={t('smsOps.title', 'SMS operations')} className={pageTabs.list}>
        {TABS.map(({ id, icon: Icon, fallback }) => {
          const count = badge(id);
          return (
            <button
              key={id} type="button" role="tab" id={`sms-ops-tab-${id}`} aria-selected={tab === id} aria-controls={`sms-ops-panel-${id}`}
              onClick={() => setTab(id)}
              className={pageTabs.tab}
            >
              <Icon aria-hidden />
              {t(`smsOps.tabs.${id}`, fallback)}
              {count ? <span className={pageTabs.badge}>{count}</span> : null}
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
