import { cn } from '@/lib/utils';

/**
 * Colored bullet used inside filter Select options.
 * Keeps every "All ..." option on muted grey and gives each concrete value
 * a semantic color. Add new tones here so they stay consistent across pages.
 */
const TONE_CLASS = {
  muted: 'bg-muted-foreground/40',
  emerald: 'bg-emerald-500',
  rose: 'bg-rose-500',
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  blue: 'bg-blue-500',
  sky: 'bg-sky-500',
  violet: 'bg-brand-500',
  purple: 'bg-violet-500',
  orange: 'bg-orange-500',
  slate: 'bg-slate-500',
  indigo: 'bg-indigo-500',
};

export function FilterDot({ tone = 'muted', className }) {
  return (
    <span
      className={cn('h-2 w-2 rounded-full shrink-0', TONE_CLASS[tone] || TONE_CLASS.muted, className)}
      aria-hidden
    />
  );
}

/**
 * Convenience wrapper: renders a <SelectItem>'s label content with a leading dot.
 * Use inside <SelectItem value="...">  {dotLabel(tone, label)}  </SelectItem>.
 */
export function DotLabel({ tone = 'muted', children }) {
  return (
    <span className="flex items-center gap-2">
      <FilterDot tone={tone} />
      {children}
    </span>
  );
}
