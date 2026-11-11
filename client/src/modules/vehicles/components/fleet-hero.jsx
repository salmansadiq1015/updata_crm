'use client';

import { Plus, Sparkles, Gauge, CircleCheck, Route, TriangleAlert, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { useFleetFormat } from '../lib/fleet-meta';

const HERO_SIZES = '(min-width: 1536px) 1600px, 100vw';
const srcSet = (ext) => [960, 1600, 2560].map((w) => `/fleet/fleet-hero-${w}.${ext} ${w}w`).join(', ');

/**
 * The art is pre-encoded AVIF (12–54 KB) with WebP fallback (21–88 KB) at
 * three widths, so the header costs about as much as an icon set. It is a
 * decorative background: empty alt, eager, high fetch priority (LCP element).
 */
export function FleetHeroArt({ className, focus = 'object-[70%_50%]' }) {
  return (
    <picture className={cn('pointer-events-none absolute inset-0', className)}>
      <source type="image/avif" srcSet={srcSet('avif')} sizes={HERO_SIZES} />
      <source type="image/webp" srcSet={srcSet('webp')} sizes={HERO_SIZES} />
      {/* eslint-disable-next-line @next/next/no-img-element -- art-directed <picture> with AVIF/WebP sources */}
      <img
        src="/fleet/fleet-hero-1600.webp"
        alt=""
        width={1600}
        height={896}
        fetchPriority="high"
        decoding="async"
        className={cn('h-full w-full object-cover', focus)}
      />
    </picture>
  );
}

function HeroStat({ icon: Icon, label, value, hint, tone = 'text-sky-200', loading }) {
  return (
    <div className="group relative min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 backdrop-blur-xl transition-colors hover:border-sky-300/30 hover:bg-white/[0.09] sm:p-4">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-300/80">
        <Icon className={cn('size-3.5', tone)} aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      {loading ? (
        <div className="mt-2 h-7 w-16 animate-pulse rounded-md bg-white/10" />
      ) : (
        <p className="mt-1.5 truncate text-2xl font-semibold tabular-nums tracking-tight text-white">{value}</p>
      )}
      {hint ? <p className="mt-0.5 truncate text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function FleetHero({ stats, loading, canWrite, onAdd, onAskAi, onShowAttention }) {
  const { t } = useLanguage();
  const f = useFleetFormat();
  const cost = stats?.costYtd?.[0];
  const types = Object.keys(stats?.byType || {}).length;

  return (
    <section
      aria-labelledby="fleet-hero-title"
      className="relative isolate overflow-hidden rounded-[28px] border border-white/10 bg-[#060c18] text-white shadow-[0_30px_80px_-40px_rgba(14,165,233,0.45)]"
    >
      <FleetHeroArt />
      {/* Legibility: deep navy from the text side, fading into the art. */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#060c18_0%,rgba(6,12,24,0.92)_32%,rgba(6,12,24,0.35)_62%,rgba(6,12,24,0.15)_100%)] rtl:bg-[linear-gradient(270deg,#060c18_0%,rgba(6,12,24,0.92)_32%,rgba(6,12,24,0.35)_62%,rgba(6,12,24,0.15)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#060c18] via-[#060c18]/70 to-transparent" />
      <div className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-sky-500/20 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/50 to-transparent" />

      <div className="relative flex flex-col gap-8 px-5 pb-5 pt-7 sm:px-8 sm:pb-7 sm:pt-10 lg:px-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-sky-200">
              <span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_2px_rgba(103,232,249,0.6)]" aria-hidden="true" />
              {t('fleet.hero.eyebrow', 'Fleet & assets')}
            </span>
            <h1 id="fleet-hero-title" className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-[44px] lg:leading-[1.08]">
              {t('fleet.hero.title', 'Every vehicle. One command center.')}
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-slate-300 sm:text-[15px]">
              {t('fleet.hero.subtitle', 'Cars, vans, trucks, machinery and boats — drivers, service, compliance, costs and bookings in one place, for every team.')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onAskAi}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-5 text-sm font-medium text-white backdrop-blur-md transition hover:border-sky-300/40 hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
            >
              <Sparkles className="size-4 text-cyan-300" aria-hidden="true" />
              {t('fleet.hero.askAi', 'Ask AI')}
            </button>
            {canWrite ? (
              <button
                type="button"
                onClick={onAdd}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-gradient-to-r from-sky-400 to-cyan-300 px-5 text-sm font-semibold text-slate-950 shadow-[0_10px_30px_-8px_rgba(56,189,248,0.7)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
              >
                <Plus className="size-4" aria-hidden="true" />
                {t('fleet.add', 'Add vehicle')}
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5">
          <HeroStat icon={Gauge} label={t('fleet.kpi.total', 'Active fleet')} value={f.number(stats?.total ?? 0)} hint={t('fleet.kpi.types', '{count} asset types', { count: types })} loading={loading} />
          <HeroStat icon={CircleCheck} tone="text-emerald-300" label={t('fleet.status.available', 'Available')} value={f.number(stats?.byStatus?.available ?? 0)} hint={t('fleet.kpi.readyNow', 'Ready to go')} loading={loading} />
          <HeroStat icon={Route} label={t('fleet.status.in_use', 'In use')} value={f.number(stats?.byStatus?.in_use ?? 0)} hint={t('fleet.kpi.utilization', '{value}% utilization', { value: stats?.utilization ?? 0 })} loading={loading} />
          <button type="button" onClick={onShowAttention} className="text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50 rounded-2xl">
            <HeroStat
              icon={TriangleAlert}
              tone={stats?.overdue ? 'text-rose-300' : 'text-amber-300'}
              label={t('fleet.kpi.attention', 'Needs attention')}
              value={f.number(stats?.attention ?? 0)}
              hint={stats?.overdue ? t('fleet.kpi.overdue', '{count} overdue', { count: stats.overdue }) : t('fleet.kpi.next30', 'Next 30 days')}
              loading={loading}
            />
          </button>
          <div className="col-span-2 lg:col-span-1">
            <HeroStat
              icon={Wallet}
              tone="text-cyan-300"
              label={t('fleet.kpi.costYtd', 'Costs this year')}
              value={cost ? f.money(cost.amount, cost.currency) : f.money(0, 'CHF')}
              hint={stats?.costYtd?.length > 1 ? t('fleet.kpi.moreCurrencies', '+{count} other currencies', { count: stats.costYtd.length - 1 }) : t('fleet.kpi.costHint', 'Fuel, service & running costs')}
              loading={loading}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
