import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const ACCENT_STYLES = {
  emerald: {
    icon: 'bg-emerald-400/12 text-emerald-300 ring-emerald-300/20',
    glow: 'from-emerald-400/18 via-cyan-400/8 to-transparent',
    value: 'text-emerald-100',
    bar: 'bg-emerald-400',
  },
  sky: {
    icon: 'bg-sky-400/12 text-sky-300 ring-sky-300/20',
    glow: 'from-sky-400/18 via-cyan-400/8 to-transparent',
    value: 'text-sky-100',
    bar: 'bg-sky-400',
  },
  cyan: {
    icon: 'bg-cyan-400/12 text-cyan-300 ring-cyan-300/20',
    glow: 'from-cyan-400/18 via-emerald-400/8 to-transparent',
    value: 'text-cyan-100',
    bar: 'bg-cyan-400',
  },
  amber: {
    icon: 'bg-amber-400/12 text-amber-300 ring-amber-300/20',
    glow: 'from-amber-400/18 via-orange-400/8 to-transparent',
    value: 'text-amber-100',
    bar: 'bg-amber-400',
  },
  rose: {
    icon: 'bg-rose-400/12 text-rose-300 ring-rose-300/20',
    glow: 'from-rose-400/18 via-red-400/8 to-transparent',
    value: 'text-rose-100',
    bar: 'bg-rose-400',
  },
  violet: {
    icon: 'bg-brand-400/12 text-brand-300 ring-brand-300/20',
    glow: 'from-brand-400/18 via-brand-400/8 to-transparent',
    value: 'text-brand-100',
    bar: 'bg-brand-400',
  },
  lime: {
    icon: 'bg-lime-400/12 text-lime-300 ring-lime-300/20',
    glow: 'from-lime-400/18 via-emerald-400/8 to-transparent',
    value: 'text-lime-100',
    bar: 'bg-lime-400',
  },
  slate: {
    icon: 'bg-muted text-muted-foreground ring-border',
    glow: 'from-white/12 via-slate-300/6 to-transparent',
    value: 'text-foreground',
    bar: 'bg-slate-300',
  },
};

function getAccent(accent) {
  return ACCENT_STYLES[accent] || ACCENT_STYLES.violet;
}

export function AccountingHero({ eyebrow, title, description, chips = [], children }) {
  return (
    <section className="accounting-hero-panel">
      <div className="relative z-10 min-w-0">
        <div className="mb-3 flex flex-wrap gap-2">
          {eyebrow && <span className="accounting-kicker">{eyebrow}</span>}
          {chips.map((chip) => (
            <span key={chip} className="accounting-chip">
              {chip}
            </span>
          ))}
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
      </div>
      {children && <div className="relative z-10">{children}</div>}
    </section>
  );
}

export function AccountingHeroSignal({ label, value, sub, icon: Icon, accent = 'cyan' }) {
  const styles = getAccent(accent);

  return (
    <div className="accounting-hero-signal">
      <div className="flex items-center justify-between gap-4">
        <span className="text-xs font-semibold uppercase text-muted-foreground">{label}</span>
        {Icon && (
          <span className={cn('flex size-10 items-center justify-center rounded-xl ring-1', styles.icon)}>
            <Icon className="size-5" />
          </span>
        )}
      </div>
      <p className="mt-5 text-3xl font-bold tabular-nums text-foreground">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function AccountingStatCard({
  label,
  value,
  sub,
  icon: Icon,
  accent = 'violet',
  href,
  danger = false,
}) {
  const styles = danger ? getAccent('rose') : getAccent(accent);
  const content = (
    <div className="accounting-card accounting-stat-card group">
      <div className={cn('accounting-card-glow bg-gradient-to-br', styles.glow)} />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <span className="text-xs font-bold uppercase text-muted-foreground">{label}</span>
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl ring-1', styles.icon)}>
          <Icon className="size-5" />
        </span>
      </div>
      <div className="relative z-10 mt-6">
        <p className={cn('text-3xl font-bold tabular-nums text-foreground', danger && 'text-rose-100')}>{value}</p>
        {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
      </div>
      <span className={cn('relative z-10 mt-5 block h-1 rounded-full opacity-70', styles.bar)} />
    </div>
  );

  return href ? (
    <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
      {content}
    </Link>
  ) : (
    content
  );
}

export function AccountingAgingPanel({ buckets, label, rows, totalLabel, format }) {
  if (!buckets) return null;

  const total = rows.reduce((sum, row) => sum + (buckets[row.key] ?? 0), 0);

  return (
    <section className="accounting-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{label}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{totalLabel}</p>
        </div>
        <span className="text-sm font-semibold tabular-nums text-muted-foreground">{format(total)}</span>
      </div>
      <div className="mt-6 flex h-2.5 overflow-hidden rounded-full bg-muted">
        {rows.map((row) => (
          <span
            key={row.key}
            className={row.color}
            style={{ width: `${((buckets[row.key] ?? 0) / (total || 1)) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-5 grid gap-3">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-4 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn('size-2 rounded-full shadow-[0_0_12px_currentColor]', row.color)} />
              <span className="truncate text-muted-foreground">{row.label}</span>
            </div>
            <span className="font-semibold tabular-nums text-foreground">{format(buckets[row.key] ?? 0)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function AccountingSectionTitle({ children }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
      {children}
    </h2>
  );
}

export function AccountingWorkspaceCard({ href, label, description, metric, icon: Icon, accent = 'violet' }) {
  const styles = getAccent(accent);

  return (
    <Link href={href} className="accounting-card accounting-workspace-card group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70">
      <div className={cn('accounting-card-glow bg-gradient-to-br', styles.glow)} />
      <span className={cn('relative z-10 flex size-11 items-center justify-center rounded-xl ring-1', styles.icon)}>
        <Icon className="size-5" />
      </span>
      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex items-center gap-3">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{label}</h3>
          <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      {metric && (
        <div className="relative z-10 mt-3 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          {metric}
        </div>
      )}
    </Link>
  );
}
