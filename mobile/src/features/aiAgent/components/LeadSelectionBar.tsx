import { Bot, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppIconButton } from '@/components/ui/AppIconButton';
import { AppText } from '@/components/ui/AppText';

type Props = {
  count: number;
  shownCount: number;
  onSelectShown: () => void;
  onClear: () => void;
  onDone: () => void;
  onGiveToAgent: () => void;
};

/** Bottom action bar of the leads multi-select mode. Counts only explicit, visible selections. */
export function LeadSelectionBar({
  count,
  shownCount,
  onSelectShown,
  onClear,
  onDone,
  onGiveToAgent,
}: Props) {
  const { t } = useTranslation();
  // Sits directly above the tab bar, which already clears the system navigation area.
  return (
    <View className="gap-2 border-t border-border bg-card px-4 pb-3 pt-2">
      <View className="flex-row items-center gap-2">
        <AppText variant="label" className="flex-1 font-geist-semibold" accessibilityLiveRegion="polite">
          {t('aiAgent.selection.selected', { count })}
        </AppText>
        {count < shownCount ? (
          <AppButton
            title={t('aiAgent.selection.selectShown')}
            variant="ghost"
            size="sm"
            onPress={onSelectShown}
          />
        ) : null}
        {count > 0 ? (
          <AppButton title={t('aiAgent.selection.clear')} variant="ghost" size="sm" onPress={onClear} />
        ) : null}
        <AppIconButton icon={X} accessibilityLabel={t('aiAgent.selection.done')} onPress={onDone} />
      </View>
      <AppButton
        title={t('aiAgent.selection.giveToAgent', { count })}
        leftIcon={Bot}
        disabled={count === 0}
        onPress={onGiveToAgent}
        fullWidth
      />
    </View>
  );
}
