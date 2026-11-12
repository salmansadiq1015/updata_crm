import type { ComponentType, ReactElement, ReactNode } from 'react';

export function HeroArt(props: { base: string; className?: string; focus?: string; width?: number; height?: number }): ReactElement;
export function HeroVeil(): ReactElement;
export function HeroStat(props: {
  icon?: ComponentType<{ className?: string }>;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: string;
  loading?: boolean;
  className?: string;
}): ReactElement;
