import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import { IconContainer, type IconContainerTone } from '@/components/ui/IconContainer';
import { useTheme } from '@/theme/ThemeProvider';
import { cn } from '@/utils/cn';

type Props = {
  label: string;
  value: number | undefined;
  icon: LucideIcon;
  loading?: boolean;
  /** Tint of the icon tile; tiles in a grid each get their own. */
  tone?: IconContainerTone;
  className?: string;
};

/**
 * One KPI cell: small tinted icon + label on one line, the value under it in
 * tabular figures. Cells sit inside a StatGrid (one card, hairline dividers).
 */
export function StatTile({ label, value, icon, loading, tone = 'accent', className }: Props) {
  return (
    <View
      className={cn('flex-1 gap-2 px-3.5 py-3', className)}
      accessible
      accessibilityLabel={`${label}: ${value ?? '…'}`}
    >
      <View className="flex-row items-center gap-2">
        <IconContainer icon={icon} tone={tone} size="sm" className="h-7 w-7 rounded-lg" />
        <AppText variant="caption" tone="muted" numberOfLines={1} className="flex-1">
          {label}
        </AppText>
      </View>
      {loading || value === undefined ? (
        <AppSkeleton className="h-7 w-14 rounded-md" />
      ) : (
        <AppText
          variant="display"
          accessibilityRole="text"
          style={{ fontVariant: ['tabular-nums'] }}
          className="text-[24px] leading-7"
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value.toLocaleString()}
        </AppText>
      )}
    </View>
  );
}

/** 2×2 KPI block: one card, cells divided by hairlines (no per-tile shadows or padding stacks). */
export function StatGrid({ children }: { children: [ReactNode, ReactNode, ReactNode, ReactNode] }) {
  const { shadows } = useTheme();
  const [a, b, c, d] = children;
  return (
    <View style={shadows.sm} className="overflow-hidden rounded-2xl border border-border bg-card">
      <View className="flex-row">
        {a}
        <View className="w-px bg-border" />
        {b}
      </View>
      <View className="h-px bg-border" />
      <View className="flex-row">
        {c}
        <View className="w-px bg-border" />
        {d}
      </View>
    </View>
  );
}
