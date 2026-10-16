import { AlertCircle, CheckCircle2, Info, TriangleAlert, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import type { SemanticColors } from '@/theme/colors';
import { cn } from '@/utils/cn';

// client/src/components/ui/alert.jsx: rounded-xl, tinted surface, leading icon.
const TONES = {
  destructive: {
    box: 'border-destructive/25 bg-destructive/5',
    chip: 'bg-destructive/15',
    icon: AlertCircle,
    fg: 'destructive',
  },
  warning: {
    box: 'border-warning/35 bg-warning/5',
    chip: 'bg-warning/20',
    icon: TriangleAlert,
    fg: 'warning',
  },
  info: { box: 'border-info/25 bg-info/5', chip: 'bg-info/15', icon: Info, fg: 'info' },
  success: {
    box: 'border-success/25 bg-success/5',
    chip: 'bg-success/15',
    icon: CheckCircle2,
    fg: 'success',
  },
} as const satisfies Record<
  string,
  { box: string; chip: string; icon: LucideIcon; fg: keyof SemanticColors }
>;

export type AppAlertProps = {
  tone: keyof typeof TONES;
  title?: string;
  message: string;
  className?: string;
};

/** Inline, persistent feedback inside a form or section (toasts are for transient outcomes). */
export function AppAlert({ tone, title, message, className }: AppAlertProps) {
  const t = TONES[tone];
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={cn('flex-row items-start gap-3 rounded-2xl border p-3.5', t.box, className)}
    >
      <View className={cn('h-7 w-7 items-center justify-center rounded-full', t.chip)}>
        <Icon icon={t.icon} size="sm" color={t.fg} />
      </View>
      <View className="flex-1 justify-center gap-0.5 pt-1">
        {title ? (
          <AppText variant="label" className="font-geist-semibold">
            {title}
          </AppText>
        ) : null}
        <AppText variant="body">{message}</AppText>
      </View>
    </View>
  );
}
