import { Text, type TextProps } from 'react-native';

import { cn } from '@/utils/cn';

// Mobile type scale (tightened from the web CRM): large title 28/34, section 20/28,
// card title 17/24, row title 15/20, body 14/20, label 13/18, caption 12/16.
const VARIANTS = {
  /** Hero numbers (KPIs). Pair with `tabular-nums` where digits change. */
  display: 'text-[28px] leading-[34px] font-geist-bold tracking-tight',
  /** Large title of a top-level screen. */
  h1: 'text-[28px] leading-[34px] font-geist-bold tracking-tight',
  h2: 'text-xl font-geist-semibold tracking-tight',
  h3: 'text-[17px] leading-6 font-geist-semibold tracking-tight',
  title: 'text-[15px] leading-5 font-geist-semibold',
  bodyLg: 'text-lg font-geist',
  body: 'text-base font-geist',
  label: 'text-sm font-geist-medium',
  caption: 'text-xs font-geist-medium',
  /** Small uppercase section label ("eyebrow"). */
  overline: 'text-2xs font-geist-semibold uppercase tracking-wider',
} as const;

const TONES = {
  default: 'text-foreground',
  muted: 'text-muted-foreground',
  primary: 'text-primary',
  destructive: 'text-destructive',
  success: 'text-success',
  warning: 'text-warning',
  inverse: 'text-primary-foreground',
} as const;

export type AppTextVariant = keyof typeof VARIANTS;
export type AppTextTone = keyof typeof TONES;

export type AppTextProps = TextProps & {
  variant?: AppTextVariant;
  tone?: AppTextTone;
  className?: string;
};

const HEADINGS: AppTextVariant[] = ['h1', 'h2', 'h3'];
// `display` is often a number (KPI); it is not announced as a heading.

export function AppText({ variant = 'body', tone = 'default', className, ...props }: AppTextProps) {
  return (
    <Text
      accessibilityRole={HEADINGS.includes(variant) ? 'header' : undefined}
      maxFontSizeMultiplier={1.6}
      className={cn(VARIANTS[variant], TONES[tone], className)}
      {...props}
    />
  );
}
