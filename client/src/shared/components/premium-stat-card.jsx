import { cn } from '@/lib/utils';

const ACCENT_THEMES = {
  violet: {
    glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(139_92_246_/_0.25),transparent_60%)]',
    iconBg: 'bg-violet-500/10',
    iconRing: 'ring-violet-500/20',
    iconColor: 'text-violet-500',
    valueGlow: 'text-violet-500 dark:text-violet-400',
    bar: 'from-violet-500 to-transparent',
  },
  emerald: {
    glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(16_185_129_/_0.25),transparent_60%)]',
    iconBg: 'bg-emerald-500/10',
    iconRing: 'ring-emerald-500/20',
    iconColor: 'text-emerald-500',
    valueGlow: 'text-emerald-600 dark:text-emerald-400',
    bar: 'from-emerald-500 to-transparent',
  },
  amber: {
    glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(245_158_11_/_0.25),transparent_60%)]',
    iconBg: 'bg-amber-500/10',
    iconRing: 'ring-amber-500/20',
    iconColor: 'text-amber-500',
    valueGlow: 'text-amber-600 dark:text-amber-400',
    bar: 'from-amber-500 to-transparent',
  },
  blue: {
    glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(59_130_246_/_0.25),transparent_60%)]',
    iconBg: 'bg-blue-500/10',
    iconRing: 'ring-blue-500/20',
    iconColor: 'text-blue-500',
    valueGlow: 'text-blue-600 dark:text-blue-400',
    bar: 'from-blue-500 to-transparent',
  },
  rose: {
    glow: 'bg-[radial-gradient(ellipse_at_top_right,rgb(244_63_94_/_0.25),transparent_60%)]',
    iconBg: 'bg-rose-500/10',
    iconRing: 'ring-rose-500/20',
    iconColor: 'text-rose-500',
    valueGlow: 'text-rose-600 dark:text-rose-400',
    bar: 'from-rose-500 to-transparent',
  },
};

/**
 * Premium stat card with gradient glow, used across module dashboards.
 * Keep visual identity consistent between Customers, Maintenance, Sites, Installations.
 */
export function PremiumStatCard({ label, value, icon: Icon, accent = 'violet', suffix }) {
  const theme = ACCENT_THEMES[accent] || ACCENT_THEMES.violet;
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-theme-sm transition-all duration-300 hover:shadow-theme-md hover:-translate-y-0.5">
      <div className={cn('absolute left-0 right-0 top-0 h-px bg-linear-to-r', theme.bar)} />
      <div className={cn('pointer-events-none absolute inset-0 opacity-60 transition-opacity group-hover:opacity-100', theme.glow)} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className={cn('text-3xl font-bold tracking-tight leading-none mt-2', theme.valueGlow)}>
            {value}
            {suffix ? <span className="ml-1 text-sm font-medium text-muted-foreground">{suffix}</span> : null}
          </p>
        </div>
        {Icon && (
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform group-hover:scale-110', theme.iconBg, theme.iconRing)}>
            <Icon className={cn('h-5 w-5', theme.iconColor)} />
          </div>
        )}
      </div>
    </div>
  );
}
