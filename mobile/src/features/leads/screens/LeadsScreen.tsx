import { Bot, CheckSquare, FilterX, Plus, SlidersHorizontal, Users } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, BackHandler, FlatList, RefreshControl, ScrollView, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { usePullRefresh } from '@/components/layout/usePullRefresh';
import { AppButton } from '@/components/ui/AppButton';
import { AppChip } from '@/components/ui/AppChip';
import { AppEmptyState } from '@/components/ui/AppEmptyState';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppIconButton } from '@/components/ui/AppIconButton';
import { AppSearchInput } from '@/components/ui/AppSearchInput';
import { AppText } from '@/components/ui/AppText';
import { LeadSelectionBar } from '@/features/aiAgent/components/LeadSelectionBar';
import { useStartAiAgent } from '@/features/aiAgent/hooks/useAiAgent';
import { ActiveQueueBanner } from '@/features/callQueue/components/ActiveQueueBanner';
import { useStartCallQueue } from '@/features/callQueue/hooks/useCallQueue';
import { useDebouncedValue } from '@/hooks/useDebounce';
import type { MainTabScreenProps } from '@/navigation/navigationTypes';
import { useTheme } from '@/theme/ThemeProvider';

import { LeadFiltersModal } from '../components/LeadFiltersModal';
import { LeadBulkActionsSheet } from '../components/LeadBulkActionsSheet';
import { LeadListItem } from '../components/LeadListItem';
import { LeadListSkeleton } from '../components/LeadListSkeleton';
import { useLeadList } from '../hooks/useLeads';
import { countAdvanced, useLeadFiltersStore } from '../store/leadFiltersStore';
import { LEAD_STATUSES, type Lead } from '../types';

const RowGap = () => <View className="h-2" />;

export function LeadsScreen({ navigation }: MainTabScreenProps<'Leads'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { search, status, advanced, setSearch, setStatus, setAdvanced, reset } = useLeadFiltersStore();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const q = useDebouncedValue(search.trim());
  const filters = useMemo(
    () => ({
      q: q || undefined,
      status,
      source: advanced.source,
      type: advanced.type,
      assignedTo: advanced.assignedTo,
      sortBy: advanced.sortBy,
      sortOrder: advanced.sortOrder,
    }),
    [q, status, advanced],
  );
  const advancedCount = countAdvanced(advanced);
  const query = useLeadList(filters);

  const leads = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const total = query.data?.pages[0]?.pagination.total;
  const filtered = Boolean(filters.q || filters.status || advancedCount > 0);

  // Multi-select (hand leads to the AI agent). `null` = not selecting. Only explicit,
  // visible rows are ever selected; the server re-validates each id at start.
  const [selection, setSelection] = useState<ReadonlySet<string> | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const selecting = selection !== null;
  const startAiAgent = useStartAiAgent();
  const toggle = useCallback(
    (lead: Lead) =>
      setSelection((current) => {
        const next = new Set(current ?? []);
        if (next.has(lead.id)) next.delete(lead.id);
        else next.add(lead.id);
        return next;
      }),
    [setSelection],
  );
  const openLead = useCallback(
    (lead: Lead) => navigation.navigate('LeadDetail', { leadId: lead.id }),
    [navigation],
  );
  // Android back leaves selection mode before it leaves the screen.
  useEffect(() => {
    if (!selecting) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelection(null);
      return true;
    });
    return () => subscription.remove();
  }, [selecting]);
  const openQueue = useCallback(() => navigation.navigate('CallQueue'), [navigation]);
  const callQueue = useStartCallQueue(openQueue);
  // Same explicit selection, in the order shown, called one by one from the user's SIM.
  const callOneByOne = () => {
    const chosen = leads
      .filter((lead) => selection?.has(lead.id))
      .map((lead) => ({ id: lead.id, name: lead.name }));
    if (chosen.length === 0) return;
    setSelection(null);
    callQueue.start(chosen);
  };
  const giveToAgent = () => {
    const ids = leads.filter((lead) => selection?.has(lead.id)).map((lead) => lead.id);
    if (ids.length === 0) return;
    setSelection(null);
    startAiAgent(ids);
  };
  const selectedLeads = useMemo(() => leads.filter((lead) => selection?.has(lead.id)), [leads, selection]);
  // Spinner only for a user pull; background refetches never flash the refresh disc.
  const pull = usePullRefresh(query.isRefetching && !query.isFetchingNextPage, () => void query.refetch());
  const loadMore = () => {
    if (query.hasNextPage && !query.isFetchingNextPage && !query.isError) void query.fetchNextPage();
  };

  const header = (
    <View className="gap-2.5 pb-3">
      <ActiveQueueBanner onPress={openQueue} />
      <View className="flex-row items-center gap-2">
        <View className="flex-1">
          <AppSearchInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('leads.searchPlaceholder')}
          />
        </View>
        <View>
          <AppIconButton
            icon={SlidersHorizontal}
            variant={advancedCount > 0 ? 'primary' : 'outline'}
            accessibilityLabel={t('leads.filters.openA11y', { count: advancedCount })}
            onPress={() => setFiltersOpen(true)}
            className="rounded-xl"
          />
          {advancedCount > 0 ? (
            <View
              pointerEvents="none"
              className="absolute -end-1 -top-1 h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-foreground px-1"
            >
              <AppText
                variant="caption"
                style={{ includeFontPadding: false }}
                className="font-geist-bold text-[10px] leading-3 text-background"
              >
                {advancedCount}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
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
      {typeof total === 'number' ? (
        <AppText variant="caption" tone="muted" accessibilityLiveRegion="polite">
          {t('leads.total', { count: total })}
        </AppText>
      ) : null}
    </View>
  );

  const empty = query.isPending ? (
    <LeadListSkeleton />
  ) : query.isError ? (
    <AppErrorState error={query.error} retrying={query.isRefetching} onRetry={() => void query.refetch()} />
  ) : filtered ? (
    <AppEmptyState
      icon={FilterX}
      title={t('leads.noMatchesTitle')}
      description={t('leads.noMatchesBody')}
      action={<AppButton title={t('leads.clearFilters')} variant="outline" onPress={reset} />}
    />
  ) : (
    <AppEmptyState icon={Users} title={t('leads.emptyTitle')} description={t('leads.emptyBody')} />
  );

  return (
    <Screen
      mode="static"
      header={{
        title: t('leads.title'),
        right: (
          <View className="flex-row items-center gap-1">
            {selecting ? null : (
              // A labelled button, not only an icon, placed first: easy to find and not
              // hidden under the dev tools overlay in the top-right corner of dev builds.
              <AppButton
                title={t('aiAgent.selection.select')}
                leftIcon={CheckSquare}
                variant="soft"
                size="sm"
                accessibilityLabel={t('aiAgent.selection.selectA11y')}
                onPress={() => setSelection(new Set())}
              />
            )}
            <AppIconButton
              icon={Bot}
              accessibilityLabel={t('aiAgent.campaignsA11y')}
              onPress={() => navigation.navigate('AiAgentCampaigns')}
            />
            {selecting ? null : (
              <AppIconButton
                icon={Plus}
                variant="primary"
                accessibilityLabel={t('leadForm.createTitle')}
                onPress={() => navigation.navigate('LeadForm')}
              />
            )}
          </View>
        ),
      }}
    >
      {filtersOpen ? (
        <LeadFiltersModal
          visible
          value={advanced}
          onClose={() => setFiltersOpen(false)}
          onApply={(next) => {
            setAdvanced(next);
            setFiltersOpen(false);
          }}
        />
      ) : null}
      <FlatList
        data={leads}
        keyExtractor={(lead) => lead.id}
        extraData={selection}
        renderItem={({ item }) => (
          <LeadListItem
            lead={item}
            onPress={selecting ? toggle : openLead}
            onLongPress={selecting ? undefined : toggle}
            selectionMode={selecting}
            selected={selection?.has(item.id) ?? false}
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          query.isFetchingNextPage ? <ActivityIndicator className="py-4" color={colors.primary} /> : null
        }
        ItemSeparatorComponent={RowGap}
        contentContainerClassName="grow px-4 pb-8"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={pull.refreshing}
            onRefresh={pull.onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
            progressBackgroundColor={colors.card}
          />
        }
        removeClippedSubviews
        windowSize={11}
      />
      {selecting ? (
        <LeadSelectionBar
          count={leads.filter((lead) => selection.has(lead.id)).length}
          shownCount={leads.length}
          onSelectShown={() => setSelection(new Set(leads.map((lead) => lead.id)))}
          onClear={() => setSelection(new Set())}
          onDone={() => setSelection(null)}
          onGiveToAgent={giveToAgent}
          onCallOneByOne={callOneByOne}
          onManage={() => setBulkOpen(true)}
        />
      ) : null}
      {bulkOpen ? (
        <LeadBulkActionsSheet
          visible
          leads={selectedLeads}
          onClose={() => setBulkOpen(false)}
          onComplete={(failedIds) => {
            setBulkOpen(false);
            setSelection(failedIds.length > 0 ? new Set(failedIds) : null);
          }}
        />
      ) : null}
      {callQueue.dialog}
    </Screen>
  );
}
