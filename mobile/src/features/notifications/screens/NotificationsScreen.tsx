import { BellOff, CheckCheck } from 'lucide-react-native';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { usePullRefresh } from '@/components/layout/usePullRefresh';
import { Appear } from '@/components/motion/Appear';
import { AppEmptyState } from '@/components/ui/AppEmptyState';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppIconButton } from '@/components/ui/AppIconButton';
import { LeadListSkeleton } from '@/features/leads/components/LeadListSkeleton';
import { useTheme } from '@/theme/ThemeProvider';
import type { MainTabScreenProps } from '@/navigation/navigationTypes';

import { NotificationItem } from '../components/NotificationItem';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationFeed,
  useUnreadCount,
} from '../hooks/useNotifications';
import { notificationTarget, type AppNotification } from '../types';

const RowGap = () => <View className="h-2" />;

export function NotificationsScreen({ navigation }: MainTabScreenProps<'Notifications'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const feed = useNotificationFeed();
  const unreadQuery = useUnreadCount();
  const unread = unreadQuery.data ?? 0;
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = useMemo(() => feed.data?.pages.flatMap((page) => page.items) ?? [], [feed.data]);
  const { mutate: markOneRead } = markRead;
  const open = useCallback(
    (notification: AppNotification) => {
      if (!notification.isRead) markOneRead(notification.id);
      const target = notificationTarget(notification);
      if (target) navigation.navigate(target.screen, target.params as never);
    },
    [markOneRead, navigation],
  );

  // Spinner only for a user pull; background refetches never flash the refresh disc.
  const pull = usePullRefresh(feed.isRefetching && !feed.isFetchingNextPage, () => {
    void feed.refetch();
    void unreadQuery.refetch();
  });

  const empty = feed.isPending ? (
    <LeadListSkeleton rows={5} />
  ) : feed.isError ? (
    <AppErrorState error={feed.error} retrying={feed.isRefetching} onRetry={() => void feed.refetch()} />
  ) : (
    <AppEmptyState
      icon={BellOff}
      title={t('notifications.emptyTitle')}
      description={t('notifications.emptyBody')}
    />
  );

  return (
    <Screen
      mode="static"
      header={{
        title: t('notifications.title'),
        right: (
          <AppIconButton
            icon={CheckCheck}
            accessibilityLabel={t('notifications.markAllRead')}
            variant="ghost"
            disabled={unread === 0}
            loading={markAllRead.isPending}
            onPress={() => markAllRead.mutate()}
          />
        ),
      }}
    >
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <Appear index={index} variant="fade">
            <NotificationItem
              notification={item}
              onPress={!item.isRead || notificationTarget(item) ? open : undefined}
            />
          </Appear>
        )}
        ListEmptyComponent={empty}
        ListFooterComponent={
          feed.isFetchingNextPage ? <ActivityIndicator className="py-4" color={colors.primary} /> : null
        }
        ItemSeparatorComponent={RowGap}
        contentContainerClassName="grow px-4 pb-8 pt-1"
        onEndReached={() => {
          if (feed.hasNextPage && !feed.isFetchingNextPage && !feed.isError) void feed.fetchNextPage();
        }}
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
      />
    </Screen>
  );
}
