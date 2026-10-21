import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Info,
  Loader,
  type LucideIcon,
  PhoneCall,
  RefreshCw,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import type { RootScreenProps } from '@/navigation/navigationTypes';

import type { ItemState, ReadinessItem, ReadinessKey } from '../domain/mobileReadiness';
import { useMobileReadiness } from '../hooks/useMobileReadiness';

const STATE_ICON: Record<
  ItemState,
  { icon: LucideIcon; color: 'success' | 'warning' | 'destructive' | 'mutedForeground' }
> = {
  ok: { icon: CheckCircle2, color: 'success' },
  action: { icon: AlertTriangle, color: 'warning' },
  blocked: { icon: CircleSlash, color: 'destructive' },
  info: { icon: Info, color: 'mutedForeground' },
  checking: { icon: Loader, color: 'mutedForeground' },
};

const SECTIONS: { title: 'phone' | 'server' | 'limits' | 'optional'; keys: ReadinessKey[] }[] = [
  { title: 'phone', keys: ['sim', 'phone', 'sms', 'notifications', 'background', 'microphone'] },
  { title: 'server', keys: ['server', 'ai'] },
  { title: 'limits', keys: ['callAudio'] },
  { title: 'optional', keys: ['cloudCalling'] },
];

/**
 * Mobile Calling Readiness: what this phone and the CRM need for calling and texting from the
 * phone's own SIM. Replaces the old "no phone trunk" dead end; cloud calling is shown as optional.
 */
export function MobileReadinessScreen({ navigation }: RootScreenProps<'MobileReadiness'>) {
  const { t } = useTranslation();
  const { items, summary, run, refresh, checking } = useMobileReadiness();
  const act = useSingleFlight(run);
  const byKey = new Map(items.map((item) => [item.key, item]));

  return (
    <Screen refreshing={checking} onRefresh={() => void refresh()} contentClassName="gap-5 pt-1 pb-10">
      <AppCard className="gap-2">
        <AppText variant="title">
          {t(`readiness.summary.${summary.state}`, { count: summary.attention })}
        </AppText>
        <AppText tone="muted">{t('readiness.intro')}</AppText>
        <View className="flex-row flex-wrap gap-2 pt-1">
          {summary.canCall ? (
            <AppButton
              title={t('callCampaign.action.title')}
              leftIcon={PhoneCall}
              onPress={() => navigation.navigate('CallCampaigns')}
            />
          ) : null}
          <AppButton
            title={t('readiness.checkAgain')}
            leftIcon={RefreshCw}
            variant="outline"
            loading={checking}
            onPress={() => void refresh()}
          />
        </View>
      </AppCard>

      {SECTIONS.map((section) => {
        const rows = section.keys
          .map((key) => byKey.get(key))
          .filter((item): item is ReadinessItem => !!item);
        if (!rows.length) return null;
        return (
          <View key={section.title} className="gap-2">
            <SectionHeader title={t(`readiness.sections.${section.title}`)} />
            {rows.map((item) => (
              <ReadinessRow
                key={item.key}
                item={item}
                onAction={() => item.action && void act(item.action)}
              />
            ))}
          </View>
        );
      })}
    </Screen>
  );
}

function ReadinessRow({ item, onAction }: { item: ReadinessItem; onAction: () => void }) {
  const { t } = useTranslation();
  const look = STATE_ICON[item.state];
  return (
    <AppCard className="gap-2">
      <View
        className="flex-row items-start gap-3"
        accessible
        accessibilityLabel={`${t(`readiness.items.${item.key}`)}: ${t(`readiness.reasons.${item.reason}` as never, item.values)}`}
      >
        <Icon icon={look.icon} color={look.color} size="sm" />
        <View className="flex-1 gap-1">
          <AppText variant="label">{t(`readiness.items.${item.key}`)}</AppText>
          <AppText tone="muted">{t(`readiness.reasons.${item.reason}` as never, item.values)}</AppText>
        </View>
      </View>
      {item.action ? (
        <AppButton
          title={t(`readiness.actions.${item.action}`)}
          variant={item.state === 'info' ? 'ghost' : 'soft'}
          size="sm"
          onPress={onAction}
        />
      ) : null}
    </AppCard>
  );
}
