import { useState } from 'react';
import { Image, View } from 'react-native';

import { cn } from '@/utils/cn';

import { AppText } from './AppText';

const SIZES = {
  sm: { box: 'h-8 w-8', text: 'text-xs' },
  md: { box: 'h-10 w-10', text: 'text-sm' },
  lg: { box: 'h-14 w-14', text: 'text-xl' },
  xl: { box: 'h-20 w-20', text: 'text-3xl' },
} as const;

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

export type AppAvatarProps = {
  name: string;
  imageUrl?: string | null;
  size?: keyof typeof SIZES;
  /** Light outline that separates the avatar from busy or gradient backgrounds. */
  ring?: boolean;
  className?: string;
};

/** Photo when one loads, otherwise initials. Decorative: the name is always shown beside it. */
export function AppAvatar({ name, imageUrl, size = 'md', ring, className }: AppAvatarProps) {
  const [failed, setFailed] = useState(false);
  const s = SIZES[size];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn(
        'items-center justify-center overflow-hidden rounded-full bg-accent',
        ring && 'border-2 border-white/70',
        s.box,
        className,
      )}
    >
      {imageUrl && !failed ? (
        <Image source={{ uri: imageUrl }} className="h-full w-full" onError={() => setFailed(true)} />
      ) : (
        <AppText className={cn('font-geist-semibold text-accent-foreground', s.text)}>
          {initialsOf(name)}
        </AppText>
      )}
    </View>
  );
}
