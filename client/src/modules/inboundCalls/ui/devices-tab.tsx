'use client';

import { Battery, Bluetooth, CheckCircle2, CircleAlert, Cpu, Signal, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useInboundDevices } from '../hooks/use-inbound-calls';
import { deviceSimLabel, enumLabel, formatDateTime, humanize, simName, type T } from '../inbound-domain';
import type { InboundDevice } from '../types/inbound-call-types';
import { ErrorState, Pill, SkeletonBlocks, cardClass, secondaryClass } from './inbound-primitives';
import { NoPhoneEmpty } from './live-monitor-tab';
import { useInboundLanguage } from './use-inbound-language';

export function DevicesTab({ onTab }: { onTab: (tab: string) => void }) {
  const { t, intlLocale } = useInboundLanguage();
  const devices = useInboundDevices();
  if (devices.isLoading) return <SkeletonBlocks count={2} className="h-48" label={t('inbound.common.loading', 'Loading…')} />;
  if (devices.isError && !devices.data) return <div className={cardClass}><ErrorState t={t} onRetry={() => devices.refetch()} /></div>;
  if (!devices.data?.length) return <div className={cardClass}><NoPhoneEmpty t={t} /></div>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {devices.data.map((d) => <DeviceCard key={d.id} d={d} t={t} locale={intlLocale} onSettings={() => onTab('settings')} />)}
    </div>
  );
}

const level = (v: number | null) => (v == null ? '—' : `${v}/5`);

function DeviceCard({ d, t, locale, onSettings }: { d: InboundDevice; t: T; locale: string; onSettings: () => void }) {
  const ready = d.aiAnswering.ready;
  const bt = d.bluetooth === 'slc' ? t('inbound.devices.btConnected', 'Connected (hands-free)') : t(`inbound.devices.bt.${d.bluetooth}`, humanize(d.bluetooth) || '—');
  return (
    <article aria-label={d.name} className={cn(cardClass, 'flex flex-col p-4')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl border border-sky-400/20 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 text-primary"><Smartphone className="size-5" /></span>
          <div className="min-w-0"><h3 className="truncate text-sm font-semibold">{d.name}</h3><p className="truncate text-[11px] text-muted-foreground">{d.phoneLabel || t('inbound.devices.lastSeen', 'Last seen {when}', { when: formatDateTime(d.lastHeartbeatAt, locale) })}</p></div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill tone={d.online ? 'success' : 'danger'}>{d.online ? t('inbound.devices.online', 'Online') : t('inbound.devices.offline', 'Offline')}</Pill>
          {d.inCall ? <Pill tone="live">{t('inbound.devices.inCall', 'In a call')}</Pill> : null}
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        <Fact icon={Bluetooth} label={t('inbound.devices.bluetooth', 'Bluetooth')} value={bt} ok={d.bluetooth === 'slc'} />
        <Fact icon={Cpu} label={t('inbound.devices.board', 'Gateway board')} value={d.boardConnected ? t('inbound.devices.connected', 'Connected') : t('inbound.devices.disconnected', 'Disconnected')} ok={d.boardConnected} />
        <Fact icon={CheckCircle2} label={t('inbound.devices.audio', 'Audio check')} value={d.audioVerified ? t('inbound.devices.verified', 'Verified') : t('inbound.devices.notVerified', 'Not verified')} ok={d.audioVerified} />
        <Fact icon={Signal} label={t('inbound.devices.signal', 'Signal')} value={level(d.signal)} />
        <Fact icon={Battery} label={t('inbound.devices.battery', 'Battery')} value={level(d.battery)} />
        <Fact label={t('inbound.devices.firmware', 'Firmware')} value={[d.firmware, d.gatewayVersion].filter(Boolean).join(' · ') || '—'} />
      </dl>
      <div className="mt-4 rounded-xl border border-border p-3 text-xs">
        <p className="flex items-center gap-2 font-medium">{ready ? <CheckCircle2 className="size-4 text-emerald-500" /> : <CircleAlert className="size-4 text-amber-500" />}{ready ? t('inbound.devices.ready', 'The AI can answer calls on this phone') : t('inbound.devices.notReady', 'The AI will not answer calls on this phone yet')}</p>
        {!ready ? <ul className="ms-6 mt-1.5 list-disc space-y-0.5 text-muted-foreground">{d.aiAnswering.reasons.map((r) => <li key={r}>{enumLabel(t, 'readiness', r)}</li>)}</ul> : null}
        <p className="mt-2 text-muted-foreground">{t('inbound.devices.agent', 'Agent')}: <span className="font-medium text-foreground">{d.agent?.name || t('inbound.settings.noAgent', 'No agent')}</span>
          {d.simAgents.filter((s) => s.simSlot != null).map((s) => <span key={s.simSlot} className="ms-2">· {deviceSimLabel([d], d.id, s.simSlot)}{s.aiEnabled ? '' : ` ${t('inbound.devices.aiOff', '(AI off)')}`}</span>)}
        </p>
        <p className="mt-2 text-muted-foreground">{t('inbound.sims.title', 'SIM cards')}: {d.sims?.length ? <span className="font-medium text-foreground">{d.sims.map(simName).join(' · ')}</span> : <span>{t('inbound.sims.unknownHint', 'Open the Updata app on this phone to detect its SIM cards.')}</span>}</p>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3 text-[11px] text-muted-foreground">
        <span>{t('inbound.devices.last24h', 'Last 24 h: {calls} calls · {ai} by AI', { calls: d.last24h.calls, ai: d.last24h.answeredByAi })}</span>
        <button type="button" className={`${secondaryClass} h-8 min-h-0 px-3 text-xs`} onClick={onSettings}>{t('inbound.devices.assign', 'Assign agent')}</button>
      </div>
    </article>
  );
}

function Fact({ icon: Icon, label, value, ok }: { icon?: typeof Signal; label: string; value: string; ok?: boolean }) {
  return <div className="min-w-0"><dt className="flex items-center gap-1 text-muted-foreground">{Icon ? <Icon className="size-3" /> : null}{label}</dt><dd className={cn('mt-0.5 truncate font-medium', ok === false && 'text-amber-700 dark:text-amber-300', ok === true && 'text-emerald-700 dark:text-emerald-300')}>{value}</dd></div>;
}
