import { CalendarCheck } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, SectionList, View } from 'react-native';

import { OfflineBanner } from '@/components/feedback/OfflineBanner';
import { usePullRefresh } from '@/components/layout/usePullRefresh';
import { AppEmptyState } from '@/components/ui/AppEmptyState';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppRadioGroup } from '@/components/ui/AppRadioGroup';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { useTheme } from '@/theme/ThemeProvider';

import { FOLLOW_UP_WINDOW_DAYS } from '../api/followUpsApi';
import { FollowUpRow } from '../components/FollowUpRow';
import { useFollowUps } from '../hooks/useFollowUps';
import type { FollowUp, FollowUpScope } from '../types';
import { groupFollowUps, type FollowUpGroups } from '../utils/grouping';

type SectionKey = keyof FollowUpGroups;
const SECTION_ORDER: SectionKey[] = ['overdue', 'today', 'upcoming'];

/** Overdue / Today / Upcoming follow-ups across leads; tap opens the lead, Call starts a SIM call. */
export function FollowUpsScreen({ navigation }: RootScreenProps<'FollowUps'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [scope, setScope] = useState<FollowUpScope>('mine');
  const query = useFollowUps(scope);
  const pull = usePullRefresh(query.isRefetching, () => void query.refetch());

  const sections = useMemo(() => {
    const groups = groupFollowUps(query.data ?? []);
    return SECTION_ORDER.filter((key) => groups[key].length > 0).map((key) => ({
      key,
      title: t(`followUps.sections.${key}`),
      data: groups[key],
    }));
  }, [query.data, t]);

  const open = useCallback(
    (item: FollowUp) => navigation.navigate('LeadDetail', { leadId: item.leadId }),
    [navigation],
  );
  const call = useCallback(
    (item: FollowUp) => navigation.navigate('CallSession', { leadId: item.leadId }),
    [navigation],
  );

  const header = (
    <View className="gap-2 pb-2 pt-3">
      <AppRadioGroup
        appearance="segmented"
        accessibilityLabel={t('followUps.scopeLabel')}
        value={scope}
        onChange={setScope}
        options={[
          { value: 'mine', label: t('followUps.scope.mine') },
          { value: 'all', label: t('followUps.scope.all') },
        ]}
      />
      <AppText variant="caption" tone="muted" className="px-1">
        {t('followUps.windowHint', {
          past: FOLLOW_UP_WINDOW_DAYS.past,
          future: FOLLOW_UP_WINDOW_DAYS.future,
        })}
      </AppText>
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <OfflineBanner />
      {query.isPending ? (
        <View className="gap-2 px-4">
          {header}
          {Array.from({ length: 4 }, (_, index) => (
            <AppSkeleton key={index} className="h-20 w-full rounded-2xl" />
          ))}
        </View>
      ) : query.isError && !query.data ? (
        <AppErrorState
          error={query.error}
          retrying={query.isRefetching}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.contactLogId}
          contentContainerClassName="grow gap-2 px-4 pb-8"
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <AppEmptyState
              icon={CalendarCheck}
              title={t('followUps.emptyTitle')}
              description={t('followUps.emptyBody')}
            />
          }
          renderSectionHeader={({ section }) => (
            <AppText
              variant="overline"
              tone={section.key === 'overdue' ? 'destructive' : 'muted'}
              accessibilityRole="header"
              className="px-1 pt-3"
            >
              {`${section.title} · ${section.data.length}`}
            </AppText>
          )}
          renderItem={({ item, section }) => (
            <FollowUpRow item={item} overdue={section.key === 'overdue'} onOpen={open} onCall={call} />
          )}
          refreshControl={
            pull.onRefresh ? (
              <RefreshControl
                refreshing={pull.refreshing}
                onRefresh={pull.onRefresh}
                colors={[colors.primary]}
                tintColor={colors.primary}
                progressBackgroundColor={colors.card}
              />
            ) : undefined
          }
        />
      )}
    </View>
  );
}
