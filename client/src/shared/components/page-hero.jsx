import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HeroArt, HeroVeil } from './hero-art';

/**
 * Full-bleed dark page header with AI artwork (see HeroArt), used by the module landing pages
 * (leads, follow-ups, calling, SMS, automation…). Text sits on the veiled left side; actions on
 * the right; an optional KPI row (HeroStat tiles) underneath.
 *
 * @param {{
 *   art: string,                 // public path prefix, e.g. '/hero/leads' → /hero/leads-hero-1600.webp
 *   eyebrow?: React.ReactNode,
 *   title: React.ReactNode,
 *   subtitle?: React.ReactNode,
 *   icon?: React.ComponentType<{ className?: string }>,
 *   actions?: React.ReactNode,
 *   stats?: React.ReactNode,     // usually 3–5 <HeroStat/>
 *   back?: { href: string, label: string },
 *   status?: React.ReactNode,    // small pill next to the eyebrow (e.g. "AI answering is on")
 *   focus?: string,              // object-position class for the art
 *   id?: string,
 *   className?: string,
 *   children?: React.ReactNode,  // extra content under the stats (tabs, banners)
 * }} props
 */
export function PageHero({ art, eyebrow, title, subtitle, icon: Icon, actions, stats, back, status, focus, id = 'page-hero-title', className, children }) {
  return (
    <section
      aria-labelledby={id}
      data-slot="page-header"
      className={cn(
        'relative isolate overflow-hidden rounded-[28px] border border-white/10 bg-[#060c18] text-white shadow-[0_30px_80px_-40px_rgba(14,165,233,0.45)]',
        className,
      )}
    >
      <HeroArt base={`${art}-hero`} focus={focus} />
      <HeroVeil />

      <div className="relative flex flex-col gap-7 px-5 pb-5 pt-6 sm:px-8 sm:pb-7 sm:pt-8 lg:px-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-2xl">
            {back ? (
              <Link href={back.href} className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60">
                <ArrowLeft className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
                {back.label}
              </Link>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {eyebrow ? (
                <span className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-sky-200">
                  {Icon ? <Icon className="size-3.5 text-cyan-300" aria-hidden="true" /> : <span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_2px_rgba(103,232,249,0.6)]" aria-hidden="true" />}
                  {eyebrow}
                </span>
              ) : null}
              {status}
            </div>
            <h1 id={id} className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-[42px] lg:leading-[1.08]">
              {title}
            </h1>
            {subtitle ? <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-[15px]">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2.5 lg:max-w-[52%] lg:justify-end">{actions}</div> : null}
        </div>
        {stats ? <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:auto-cols-fr lg:grid-flow-col lg:grid-cols-none">{stats}</div> : null}
        {children}
      </div>
    </section>
  );
}

const base = 'inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-sm transition focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0';

/** Class names for buttons/links placed on a PageHero. */
export const heroButton = {
  primary: cn(base, 'bg-gradient-to-r from-sky-400 to-cyan-300 font-semibold text-slate-950 shadow-[0_10px_30px_-8px_rgba(56,189,248,0.7)] hover:brightness-110 focus-visible:ring-sky-200'),
  ghost: cn(base, 'border border-white/15 bg-white/[0.07] font-medium text-white backdrop-blur-md hover:border-sky-300/40 hover:bg-white/[0.12] focus-visible:ring-sky-300/60 [&_svg]:text-cyan-300'),
};

/** Small status pill for the eyebrow row ("AI answering is on", "Live"). */
export function HeroPill({ tone = 'ok', children, onClick, className }) {
  const tones = {
    ok: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200 [&_[data-dot]]:bg-emerald-300 [&_[data-dot]]:shadow-[0_0_10px_2px_rgba(110,231,183,0.55)]',
    warn: 'border-amber-300/25 bg-amber-400/10 text-amber-200 [&_[data-dot]]:bg-amber-300',
    off: 'border-white/15 bg-white/[0.06] text-slate-300 [&_[data-dot]]:bg-slate-400',
  };
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium tracking-wide transition', onClick && 'hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60', tones[tone], className)}
    >
      <span data-dot="" className="size-1.5 rounded-full" aria-hidden="true" />
      {children}
    </Tag>
  );
}

/** Segmented tab bar that sits under a PageHero (works with role="tab" + aria-selected, incl. Radix Tabs). */
export const pageTabs = {
  list: 'flex w-full gap-1 overflow-x-auto rounded-2xl border border-border/80 bg-card/90 p-1.5 shadow-[0_8px_30px_-18px_rgba(15,23,42,0.35)] backdrop-blur scrollbar-thin',
  tab: 'inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-selected:bg-gradient-to-r aria-selected:from-sky-500 aria-selected:to-cyan-500 aria-selected:text-white aria-selected:shadow-[0_8px_20px_-10px_rgba(14,165,233,0.8)] [&_svg]:size-4 [&_svg]:shrink-0',
  /** For link-based tab bars (aria-current="page"), apply alongside `tab` on the active link. */
  active: 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-[0_8px_20px_-10px_rgba(14,165,233,0.8)] hover:bg-transparent hover:text-white',
  badge: 'rounded-full bg-amber-500/15 px-1.5 text-xs font-semibold tabular-nums text-amber-700 dark:text-amber-300 [[aria-selected=true]_&]:bg-white/25 [[aria-selected=true]_&]:text-white',
};

/**
 * Slim image band for full-height workspaces (email, AI assistant, tasks, scheduling) where a tall
 * header would steal room from the work. Uses dedicated 4:1 art (`${art}-band-*`, composed so the
 * subject sits in the middle third) so a short, wide strip never crops it awkwardly.
 */
export function PageBand({ art, eyebrow, title, subtitle, icon: Icon, actions, chips, focus = 'object-[center_50%]', id = 'page-band-title', className }) {
  return (
    <section
      aria-labelledby={id}
      data-slot="page-header"
      className={cn('relative isolate flex min-h-[124px] shrink-0 items-center overflow-hidden rounded-[24px] border border-white/10 bg-[#060c18] text-white shadow-[0_24px_60px_-38px_rgba(14,165,233,0.55)] sm:min-h-[136px]', className)}
    >
      <HeroArt base={`${art}-band`} focus={focus} width={1600} height={400} />
      {/* Lighter veil than PageHero: deep only behind the text, clear over the art. */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#060c18_0%,rgba(6,12,24,0.9)_30%,rgba(6,12,24,0.35)_58%,rgba(6,12,24,0.05)_100%)] rtl:bg-[linear-gradient(270deg,#060c18_0%,rgba(6,12,24,0.9)_30%,rgba(6,12,24,0.35)_58%,rgba(6,12,24,0.05)_100%)]" />
      <div className="pointer-events-none absolute -start-16 -top-20 size-56 rounded-full bg-sky-500/15 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/50 to-transparent" />
      <div className="relative flex w-full flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div className="flex min-w-0 items-center gap-4">
          {Icon ? (
            <span className="hidden size-12 shrink-0 place-items-center rounded-2xl border border-white/15 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-md sm:grid">
              <Icon className="size-5 text-cyan-300" aria-hidden="true" />
            </span>
          ) : null}
          <div className="min-w-0 space-y-1">
            {eyebrow ? <p className="text-[10px] font-semibold uppercase leading-none tracking-[0.2em] text-sky-200/90">{eyebrow}</p> : null}
            <h1 id={id} className="truncate text-xl font-semibold leading-tight tracking-tight text-white sm:text-2xl">{title}</h1>
            {subtitle ? <p className="hidden truncate text-[13px] leading-snug text-slate-300 md:block">{subtitle}</p> : null}
          </div>
          {chips ? <div className="ms-3 hidden items-center gap-2 xl:flex">{chips}</div> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
      </div>
    </section>
  );
}

/** Compact glass figure for a PageBand ("12 unread"). */
export function BandChip({ icon: Icon, value, label, tone = 'text-cyan-300' }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.07] px-3 py-1.5 text-xs text-slate-200 backdrop-blur-md">
      {Icon ? <Icon className={cn('size-3.5', tone)} aria-hidden="true" /> : null}
      <strong className="font-semibold tabular-nums text-white">{value}</strong>
      <span className="text-slate-300">{label}</span>
    </span>
  );
}
