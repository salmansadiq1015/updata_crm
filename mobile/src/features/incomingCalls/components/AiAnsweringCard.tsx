import { PhoneIncoming } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Switch, View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { AppCard } from '@/components/ui/AppCard';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import { IconContainer } from '@/components/ui/IconContainer';
import { useTheme } from '@/theme/ThemeProvider';

import { useInboundSettings, useSetAiAnswering } from '../hooks/useIncomingCalls';

/**
 * Master switch for AI answering (InboundSettings.enabled), shared with the website. The body
 * says plainly how calls are answered: by the bridge, not by this app.
 */
export function AiAnsweringCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const settings = useInboundSettings();
  const toggle = useSetAiAnswering();

  if (settings.isPending) return <AppSkeleton className="h-36 rounded-2xl" />;
  if (settings.isError || !settings.data) {
    return <AppAlert tone="warning" message={t('incomingCalls.settings.loadFailed')} />;
  }
  // While saving, show the requested position so the switch does not jump back.
  const enabled =
    toggle.isPending && toggle.variables !== undefined ? toggle.variables : settings.data.enabled;

  return (
    <AppCard className="gap-3">
      <View className="flex-row items-center gap-3">
        <IconContainer icon={PhoneIncoming} tone="primary" size="md" />
        <AppText variant="title" className="flex-1">
          {t('incomingCalls.settings.title')}
        </AppText>
        <Switch
          accessibilityLabel={t('incomingCalls.settings.title')}
          accessibilityState={{ checked: enabled, busy: toggle.isPending }}
          value={enabled}
          disabled={toggle.isPending || settings.isRefetching}
          onValueChange={(next) => toggle.mutate(next)}
          trackColor={{ true: colors.primary, false: colors.border }}
          thumbColor={colors.card}
        />
      </View>
      <AppText tone={enabled ? 'default' : 'muted'}>
        {enabled ? t('incomingCalls.settings.on') : t('incomingCalls.settings.off')}
      </AppText>
      <AppText variant="caption" tone="muted">
        {t('incomingCalls.settings.how')}
      </AppText>
    </AppCard>
  );
}
