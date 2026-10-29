'use client';

import { BatteryWarning, CheckCircle2, CircleSlash, RefreshCw, Signal, Smartphone, WifiOff, XCircle } from 'lucide-react';
import { LtrText } from '@/modules/leads/ui/ltr-text';
import { useSmsDevices, useSmsOpsMutations } from '../hooks/use-sms-ops';
import { deviceReason, formatDateTime, relativeTime } from '../sms-ops-domain';
import type { HealthStatus, SmsDevice } from '../types/sms-ops-types';
import { useSmsOpsLanguage } from './use-sms-ops-language';

const STATUS_STYLE: Record<HealthStatus, string> = {
  online: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:text-amber-400',
  offline: 'bg-destructive/10 text-destructive ring-destructive/30',
};
const SEVERITY_STYLE: Record<string, string> = {
  critical: 'text-destructive',
  warning: 'text-amber-700 dark:text-amber-400',
  info: 'text-muted-foreground',
};

const PERMISSIONS: { key: keyof SmsDevice['permissions']; fallback: string }[] = [
  { key: 'sendSms', fallback: 'Send SMS' },
  { key: 'receiveSms', fallback: 'Receive SMS' },
  { key: 'readPhoneState', fallback: 'Phone state / SIM list' },
  { key: 'postNotifications', fallback: 'Notifications' },
  { key: 'batteryOptimizationIgnored', fallback: 'Battery optimisation off' },
];

export function HealthBadge({ status }: { status: HealthStatus }) {
  const { t } = useSmsOpsLanguage();
  return (
    <span data-testid="health-badge" className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${STATUS_STYLE[status]}`}>
      {t(`smsOps.health.${status}`, status === 'online' ? 'Online' : status === 'warning' ? 'Needs attention' : 'Offline')}
    </span>
  );
}

function Gauge({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="tabular-nums font-semibold">{value}</span></div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={value}>
        <div className={`h-1.5 rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PermissionRow({ granted, label }: { granted: boolean | null | undefined; label: string }) {
  const { t } = useSmsOpsLanguage();
  const Icon = granted === true ? CheckCircle2 : granted === false ? XCircle : CircleSlash;
  const tone = granted === true ? 'text-emerald-600 dark:text-emerald-400' : granted === false ? 'text-destructive' : 'text-muted-foreground';
  return (
    <li className="flex items-center gap-2 text-sm">
      <Icon className={`h-4 w-4 shrink-0 ${tone}`} aria-hidden />
      <span>{label}</span>
      <span className="sr-only">{granted === true ? t('smsOps.devices.granted', 'granted') : granted === false ? t('smsOps.devices.denied', 'missing') : t('smsOps.devices.unknown', 'unknown')}</span>
    </li>
  );
}

export function DeviceCard({ device }: { device: SmsDevice }) {
  const { t, locale } = useSmsOpsLanguage();
  const m = useSmsOpsMutations();
  const q = device.queue || { pending: 0, attempting: 0, unknown: 0, failed: 0 };
  const total = Math.max(10, (q.pending || 0) + (q.attempting || 0) + (q.unknown || 0) + (q.failed || 0));
  const resyncPending = Boolean(device.resyncRequestedAt && (!device.resyncCompletedAt || device.resyncCompletedAt < device.resyncRequestedAt));
  const smsBuild = device.buildProfile === 'private' || device.permissions?.smsDeclared === true;
  const net = device.network || {};
  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm" aria-label={device.model || device.deviceId}>
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 ring-1 ring-brand-500/20"><Smartphone className="h-5 w-5 text-brand-500" /></div>
          <div className="min-w-0">
            <h3 className="truncate font-semibold" dir="auto">{[device.manufacturer, device.model].filter(Boolean).join(' ') || t('smsOps.devices.unnamed', 'Android phone')}</h3>
            <p className="text-xs text-muted-foreground">
              {t('smsOps.devices.android', 'Android')} <LtrText>{device.osVersion || '—'}</LtrText> · {t('smsOps.devices.app', 'App')} <LtrText>{device.appVersion || '—'}</LtrText>
              {device.buildProfile ? <> · {t(`smsOps.devices.build.${device.buildProfile}`, device.buildProfile)}</> : null}
            </p>
          </div>
        </div>
        <HealthBadge status={device.health?.status ?? 'offline'} />
      </header>

      <p className="text-xs text-muted-foreground">
        {t('smsOps.devices.lastSeen', 'Last seen')}: <time dateTime={device.lastHeartbeatAt ?? undefined} title={formatDateTime(device.lastHeartbeatAt, locale)}>{relativeTime(device.lastHeartbeatAt, locale)}</time>
      </p>

      {device.health?.reasons?.length ? (
        <ul className="space-y-1" aria-label={t('smsOps.devices.issues', 'Issues')}>
          {device.health.reasons.map((r) => (
            <li key={r.code} className={`flex items-start gap-2 text-sm ${SEVERITY_STYLE[r.severity] ?? ''}`}>
              {r.code === 'battery_optimization_on' ? <BatteryWarning className="mt-0.5 h-4 w-4 shrink-0" /> : r.code === 'network_offline' || r.code === 'offline' ? <WifiOff className="mt-0.5 h-4 w-4 shrink-0" /> : <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
              <span>{deviceReason(t, r.code)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('smsOps.devices.permissions', 'Permissions')}</h4>
          <ul className="space-y-1">
            {PERMISSIONS.filter((p) => p.key !== 'receiveSms' || smsBuild).map((p) => (
              <PermissionRow key={p.key} granted={device.permissions?.[p.key]} label={t(`smsOps.devices.perm.${p.key}`, p.fallback)} />
            ))}
          </ul>
        </section>
        <section>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('smsOps.devices.sims', 'SIM cards')}</h4>
          {device.sims?.length ? (
            <ul className="space-y-1.5">
              {device.sims.map((s) => (
                <li key={`${s.slotIndex}-${s.subscriptionId ?? ''}`} className="text-sm">
                  <span className="font-medium" dir="auto">{s.displayName || s.carrierName || t('smsOps.devices.sim', 'SIM')}</span>
                  {s.slotIndex >= 0 ? <span className="text-muted-foreground"> · {t('smsOps.devices.slot', 'Slot {n}', { n: s.slotIndex + 1 })}</span> : null}
                  {s.numberMasked ? <> · <LtrText className="tabular-nums">{s.numberMasked}</LtrText></> : null}
                  {s.selected ? <span className="ms-1.5 rounded bg-brand-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-brand-600 dark:text-brand-400">{t('smsOps.devices.sending', 'Sending SIM')}</span> : null}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">{t('smsOps.devices.noSims', 'No SIM reported')}</p>}
          <p className="mt-2 flex items-center gap-1.5 text-sm">
            <Signal className="h-4 w-4 text-muted-foreground" aria-hidden />
            {net.airplaneMode ? t('smsOps.devices.airplane', 'Airplane mode')
              : net.connected === false ? t('smsOps.devices.disconnected', 'No connection')
                : <>{t('smsOps.devices.connected', 'Connected')}{net.type ? <> · <LtrText>{net.type}</LtrText></> : null}</>}
          </p>
        </section>
      </div>

      <section>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('smsOps.devices.queue', 'Queue on the phone')}</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Gauge label={t('smsOps.devices.pending', 'Pending')} value={q.pending || 0} total={total} tone="bg-brand-500" />
          <Gauge label={t('smsOps.devices.attempting', 'Sending')} value={q.attempting || 0} total={total} tone="bg-cyan-500" />
          <Gauge label={t('smsOps.devices.unknownResults', 'Unknown')} value={q.unknown || 0} total={total} tone="bg-amber-500" />
          <Gauge label={t('smsOps.devices.failed', 'Failed')} value={q.failed || 0} total={total} tone="bg-destructive" />
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 text-xs text-muted-foreground sm:grid-cols-3">
          <div><dt className="inline">{t('smsOps.devices.lastSend', 'Last send')}: </dt><dd className="inline">{relativeTime(device.last?.sendAt, locale)}</dd></div>
          <div><dt className="inline">{t('smsOps.devices.lastInbound', 'Last reply')}: </dt><dd className="inline">{relativeTime(device.last?.inboundAt, locale)}</dd></div>
          <div><dt className="inline">{t('smsOps.devices.lastLease', 'Last lease')}: </dt><dd className="inline">{relativeTime(device.last?.leaseAt, locale)}</dd></div>
        </dl>
        {device.lastError?.code ? (
          <p className="mt-2 text-xs text-destructive">{t('smsOps.devices.lastError', 'Last error')}: <LtrText>{device.lastError.code}</LtrText>{device.lastError.message ? <span dir="auto"> — {device.lastError.message}</span> : null}</p>
        ) : null}
      </section>

      <section>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('smsOps.devices.campaigns', 'Campaigns using this phone')}</h4>
        {device.campaigns?.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {device.campaigns.map((c) => <li key={c.id} className="rounded-full bg-muted px-2.5 py-0.5 text-xs" dir="auto">{c.name}</li>)}
          </ul>
        ) : <p className="text-sm text-muted-foreground">{t('smsOps.devices.noCampaigns', 'None')}</p>}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">
          {resyncPending ? t('smsOps.devices.resyncPending', 'Resync requested {when}', { when: relativeTime(device.resyncRequestedAt, locale) }) : <LtrText className="font-mono">{device.deviceId}</LtrText>}
        </span>
        <button
          type="button"
          disabled={m.resync.isPending || resyncPending}
          onClick={() => m.resync.mutate(device.deviceId)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> {t('smsOps.devices.resync', 'Request resync')}
        </button>
      </footer>
    </article>
  );
}

export function DeviceDashboard() {
  const { t } = useSmsOpsLanguage();
  const { data, isLoading, isError, refetch } = useSmsDevices();
  if (isLoading) return <p className="text-sm text-muted-foreground">{t('smsOps.loading', 'Loading…')}</p>;
  if (isError) return <button type="button" className="text-sm text-brand-500" onClick={() => void refetch()}>{t('smsOps.loadError', 'Could not load. Retry')}</button>;
  if (!data?.length) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <Smartphone className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">{t('smsOps.devices.emptyTitle', 'No phones have reported yet')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('smsOps.devices.emptyHint', 'Open the Updata Android app and sign in; the SMS agent reports its health every few minutes.')}</p>
      </div>
    );
  }
  return <div className="grid gap-4 xl:grid-cols-2">{data.map((d) => <DeviceCard key={d.deviceId} device={d} />)}</div>;
}
