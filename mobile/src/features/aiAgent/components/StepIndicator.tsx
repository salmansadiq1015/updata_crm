import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { cn } from '@/utils/cn';

export function StepIndicator({ steps, current }: { steps: readonly string[]; current: number }) {
  const { t } = useTranslation();
  return (
    <View
      className="gap-2"
      accessibilityRole="progressbar"
      accessibilityLabel={t('aiAgent.steps.progress', {
        current: current + 1,
        total: steps.length,
        name: steps[current] ?? '',
      })}
    >
      <View className="flex-row gap-1.5">
        {steps.map((step, index) => (
          <View
            key={step}
            className={cn('h-1.5 flex-1 rounded-full', index <= current ? 'bg-primary' : 'bg-muted')}
          />
        ))}
      </View>
      <AppText variant="caption" tone="muted">
        {t('aiAgent.steps.progress', {
          current: current + 1,
          total: steps.length,
          name: steps[current] ?? '',
        })}
      </AppText>
    </View>
  );
}
