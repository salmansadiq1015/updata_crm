import { cn } from '@/lib/utils';

const WIDTHS = [960, 1600, 2560];
const SIZES = '(min-width: 1536px) 1600px, 100vw';
const srcSet = (base, ext) => WIDTHS.map((w) => `${base}-${w}.${ext} ${w}w`).join(', ');

/**
 * Decorative page-header artwork, pre-encoded as AVIF with a WebP fallback at
 * 960/1600/2560 px (`${base}-${width}.{avif,webp}`), so a full-bleed header
 * costs tens of kilobytes. Empty alt, high fetch priority: it is the LCP image.
 */
export function HeroArt({ base, className, focus = 'object-[70%_50%]', width = 1600, height = 896 }) {
  return (
    <picture className={cn('pointer-events-none absolute inset-0', className)}>
      <source type="image/avif" srcSet={srcSet(base, 'avif')} sizes={SIZES} />
      <source type="image/webp" srcSet={srcSet(base, 'webp')} sizes={SIZES} />
      <img
        src={`${base}-1600.webp`}
        alt=""
        width={width}
        height={height}
        fetchPriority="high"
        decoding="async"
        className={cn('h-full w-full object-cover', focus)}
      />
    </picture>
  );
}

/** Navy legibility veil over header art: deep on the text side, clear over the image. */
export function HeroVeil() {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,#060c18_0%,rgba(6,12,24,0.92)_32%,rgba(6,12,24,0.35)_62%,rgba(6,12,24,0.15)_100%)] rtl:bg-[linear-gradient(270deg,#060c18_0%,rgba(6,12,24,0.92)_32%,rgba(6,12,24,0.35)_62%,rgba(6,12,24,0.15)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#060c18] via-[#060c18]/70 to-transparent" />
      <div className="pointer-events-none absolute -left-24 -top-24 size-72 rounded-full bg-sky-500/20 blur-3xl" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/50 to-transparent" />
    </>
  );
}

/** Glass KPI tile used on dark page headers. */
export function HeroStat({ icon: Icon, label, value, hint, tone = 'text-sky-200', loading, className }) {
  return (
    <div className={cn('group relative min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 backdrop-blur-xl transition-colors hover:border-sky-300/30 hover:bg-white/[0.09] sm:p-4', className)}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-300/80">
        {Icon ? <Icon className={cn('size-3.5 shrink-0', tone)} aria-hidden="true" /> : null}
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
