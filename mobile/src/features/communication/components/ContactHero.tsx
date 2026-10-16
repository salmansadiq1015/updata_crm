import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Appear } from '@/components/motion/Appear';
import { AppAvatar } from '@/components/ui/AppAvatar';
import { AppText } from '@/components/ui/AppText';
import { GradientSurface } from '@/components/ui/GradientSurface';

/**
 * Compact brand header for the call and SMS flows (same look as the lead hero):
 * who is being contacted and, in one muted line, how.
 */
export function ContactHero({
  name,
  subtitle,
  children,
}: {
  name: string;
  subtitle?: string | null;
  /** Extra content inside the hero, below the identity row. */
  children?: ReactNode;
}) {
  return (
    <Appear>
      <GradientSurface className="gap-3 rounded-3xl p-4">
        <View className="flex-row items-center gap-3">
          <AppAvatar name={name} size="md" ring />
          <View className="flex-1 gap-0.5">
            <AppText variant="h3" className="text-white" numberOfLines={2}>
              {name}
            </AppText>
            {subtitle ? (
              <AppText
                variant="label"
                className="font-geist text-white/75"
                style={{ fontVariant: ['tabular-nums'] }}
                numberOfLines={2}
                accessibilityLiveRegion="polite"
              >
                {subtitle}
              </AppText>
            ) : null}
          </View>
        </View>
        {children}
      </GradientSurface>
    </Appear>
  );
}
