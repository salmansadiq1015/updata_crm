import { View } from 'react-native';

import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { useTheme } from '@/theme/ThemeProvider';

/** Placeholder rows shaped like LeadListItem (card, icon tile, two text lines, status pill). */
export function LeadListSkeleton({ rows = 6 }: { rows?: number }) {
  const { shadows } = useTheme();
  return (
    <View className="gap-3" accessibilityLabel="Loading" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, index) => (
        <View
          key={index}
          style={shadows.sm}
          className="flex-row items-start gap-3 rounded-2xl border border-border bg-card p-4"
        >
          <AppSkeleton className="h-10 w-10 rounded-xl" />
          <View className="flex-1 gap-2.5 pt-0.5">
            <AppSkeleton className="h-4 w-3/5 rounded-md" />
            <View className="flex-row gap-2">
              <AppSkeleton className="h-3 w-16 rounded-md" />
              <AppSkeleton className="h-3 w-24 rounded-md" />
            </View>
          </View>
          <AppSkeleton className="h-6 w-20 rounded-full" />
        </View>
      ))}
    </View>
  );
}
