import { ChevronRight, Users } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/layout/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { AppChip } from '@/components/ui/AppChip';
import { AppEmptyState } from '@/components/ui/AppEmptyState';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppSearchInput } from '@/components/ui/AppSearchInput';
import { AppText } from '@/components/ui/AppText';
import { LeadListItem } from '@/features/leads/components/LeadListItem';
import { useLeadList } from '@/features/leads/hooks/useLeads';
import { LEAD_STATUSES, type Lead, type LeadStatus } from '@/features/leads/types';
import { useDebouncedValue } from '@/hooks/useDebounce';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { useTheme } from '@/theme/ThemeProvider';

import { toggleSelection, selectAllVisible } from '../domain/leadSelection';

const Gap = () => <View className="h-3" />;

/**
 * Server-side lead search (GET /crm/leads with q/status, cursor pages) with explicit
 * multi-select. Continues to the AI agent launch flow with exactly the chosen ids;
 * for a test, exactly one lead is chosen for the test draft.
 */
export function CallAgentLeadPickerScreen({ route, navigation }: RootScreenProps<'CallAgentLeadPicker'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const purpose = route.params?.purpose ?? 'call';
  const single = purpose === 'test';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LeadStatus | undefined>(undefined);
  const q = useDebouncedValue(search.trim(), 350);
  const filters = useMemo(() => ({ q: q || undefined, status }), [q, status]);
  const query = useLeadList(filters);
  const leads = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);

  // Ordered, so the launch flow receives leads in the order they were picked.
  const [selected, setSelected] = useState<string[]>([]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const onToggle = useCallback(
    (lead: Lead) => setSelected((current) => toggleSelection(current, lead.id, single)),
    [single],
  );
  const shownIds = leads.map((lead) => lead.id);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selectedSet.has(id));

  const loadMore = () => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isError) void query.fetchNextPage();
  };

  const proceed = () => {
    if (selected.length === 0) return;
    if (purpose === 'test') navigation.replace('CallAgentTest', { leadId: selected[0]! });
    else navigation.navigate('AiAgentLaunch', { leadIds: selected, initialChannel: purpose });
  };

  const header = (
    <View className="gap-3 pb-3">
      <AppText tone="muted">{t(`callAgent.picker.intro.${purpose}`)}</AppText>
      <AppSearchInput
        value={search}
        onChangeText={setSearch}
        placeholder={t('callAgent.picker.search')}
        accessibilityLabel={t('callAgent.picker.search')}
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-4"
        contentContainerClassName="gap-2 px-4"
      >
        <AppChip label={t('leads.all')} selected={!status} onPress={() => setStatus(undefined)} />
        {LEAD_STATUSES.map((value) => (
          <AppChip
            key={value}
            label={t(`leads.status.${value}`)}
            selected={status === value}
            onPress={() => setStatus(status === value ? undefined : value)}
          />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <Screen mode="static" edges={[]}>
      <FlatList
        data={leads}
        keyExtractor={(lead) => lead.id}
        ItemSeparatorComponent={Gap}
        ListHeaderComponent={header}
        contentContainerClassName="grow px-4 pt-4 pb-6"
        keyboardShouldPersistTaps="handled"
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        renderItem={({ item }) => (
          <LeadListItem lead={item} onPress={onToggle} selectionMode selected={selectedSet.has(item.id)} />
        )}
        ListEmptyComponent={
          query.isPending ? (
            <View className="items-center py-10">
              <ActivityIndicator color={colors.primary} accessibilityLabel={t('common.loading')} />
            </View>
          ) : query.isError ? (
            <AppErrorState
              error={query.error}
              retrying={query.isRefetching}
              onRetry={() => void query.refetch()}
            />
          ) : (
            <AppEmptyState
              icon={Users}
              title={t('callAgent.picker.empty')}
              description={t('callAgent.picker.emptyBody')}
            />
          )
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <View className="items-center py-4">
              <ActivityIndicator
                color={colors.primary}
                accessibilityLabel={t('callAgent.picker.loadingMore')}
              />
            </View>
          ) : null
        }
      />
      <View
        className="gap-2 border-t border-border bg-card px-4 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <View className="flex-row items-center gap-2">
          <AppText variant="label" className="flex-1" accessibilityLiveRegion="polite">
            {t('callAgent.picker.selected', { count: selected.length })}
          </AppText>
          {!single && !allShownSelected && shownIds.length > 0 ? (
            <AppButton
              title={t('callAgent.picker.selectShown')}
              variant="ghost"
              size="sm"
              onPress={() => setSelected((current) => selectAllVisible(current, shownIds))}
            />
          ) : null}
          {selected.length > 0 ? (
            <AppButton
              title={t('callAgent.picker.clear')}
              variant="ghost"
              size="sm"
              onPress={() => setSelected([])}
            />
          ) : null}
        </View>
        <AppButton
          title={
            single
              ? t('callAgent.picker.continueTest')
              : t('callAgent.picker.continue', { count: selected.length })
          }
          rightIcon={ChevronRight}
          disabled={selected.length === 0}
          onPress={proceed}
          fullWidth
        />
      </View>
    </Screen>
  );
}
