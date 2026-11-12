import type { ComponentType, ReactElement, ReactNode } from 'react';

export function PageHero(props: {
  art: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  actions?: ReactNode;
  stats?: ReactNode;
  back?: { href: string; label: string };
  status?: ReactNode;
  focus?: string;
  id?: string;
  className?: string;
  children?: ReactNode;
}): ReactElement;

export const heroButton: { primary: string; ghost: string };

export function HeroPill(props: { tone?: 'ok' | 'warn' | 'off'; children?: ReactNode; onClick?: () => void; className?: string }): ReactElement;

export const pageTabs: { list: string; tab: string; active: string; badge: string };

export function PageBand(props: {
  art: string; eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode;
  icon?: ComponentType<{ className?: string }>; actions?: ReactNode; chips?: ReactNode;
  focus?: string; id?: string; className?: string;
}): ReactElement;

export function BandChip(props: { icon?: ComponentType<{ className?: string }>; value: ReactNode; label: ReactNode; tone?: string }): ReactElement;
