import { Text, type TextProps } from 'react-native';

import { cn } from '@/utils/cn';

// Type scale from the web CRM (globals.css): h1 32/40 bold … xs 12/16 medium.
const VARIANTS = {
  /** Hero numbers and large titles. */
  display: 'text-4xl font-geist-bold tracking-tight',
  h1: 'text-3xl font-geist-bold tracking-tight',
  h2: 'text-2xl font-geist-semibold tracking-tight',
  h3: 'text-xl font-geist-semibold',
  title: 'text-lg font-geist-semibold',
  bodyLg: 'text-lg font-geist',
  body: 'text-base font-geist',
  label: 'text-sm font-geist-medium',
  caption: 'text-xs font-geist-medium',
  /** Small uppercase section label ("eyebrow"). */
  overline: 'text-2xs font-geist-semibold uppercase',
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
