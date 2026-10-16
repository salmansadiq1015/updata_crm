import { Bell, Briefcase, ClipboardList, FileText, Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { Appear } from '@/components/motion/Appear';
import { AppAvatar } from '@/components/ui/AppAvatar';
import { AppButton } from '@/components/ui/AppButton';
import { AppEmptyState } from '@/components/ui/AppEmptyState';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppText } from '@/components/ui/AppText';
import { GradientSurface } from '@/components/ui/GradientSurface';
import { AppIconButton } from '@/components/ui/AppIconButton';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import { LeadListItem } from '@/features/leads/components/LeadListItem';
import { LeadListSkeleton } from '@/features/leads/components/LeadListSkeleton';
import { useRecentLeads } from '@/features/leads/hooks/useLeads';
import { useUnreadCount } from '@/features/notifications/hooks/useNotifications';
import type { MainTabScreenProps } from '@/navigation/navigationTypes';

import { StatGrid, StatTile } from '../components/StatTile';
import { useDashboardStats } from '../hooks/useDashboardStats';

export function DashboardScreen({ navigation }: MainTabScreenProps<'Dashboard'>) {
  const { t } = useTranslation();
  const user = useSessionStore((state) => state.user);
  const stats = useDashboardStats();
  const recent = useRecentLeads();
  const unread = useUnreadCount();

  const refreshing = stats.isRefetching || recent.isRefetching;
  const refresh = () => {
    void stats.refetch();
    void recent.refetch();
    void unread.refetch();
  };

  const unreadCount = unread.data ?? 0;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} contentClassName="gap-5 pt-2">
      {/* Compact brand hero: who is signed in, and a bell that carries the unread count. */}
      <Appear>
        <GradientSurface className="rounded-3xl px-4 py-3.5">
          <View className="flex-row items-center gap-3">
            {user ? <AppAvatar name={user.fullName} imageUrl={user.avatarUrl} size="md" ring /> : null}
            <View className="flex-1 gap-0.5">
              <AppText variant="h2" className="text-white" numberOfLines={1}>
                {t('dashboard.greeting', { name: user?.firstName ?? user?.fullName ?? '' })}
              </AppText>
              <AppText variant="label" className="font-geist text-white/70" numberOfLines={1}>
                {t('dashboard.subtitle')}
              </AppText>
            </View>
            <View>
              <AppIconButton
                icon={Bell}
                variant="inverse"
                accessibilityLabel={
                  unreadCount > 0
                    ? t('dashboard.unreadNotifications', { count: unreadCount })
                    : t('notifications.title')
                }
                onPress={() => navigation.navigate('Notifications')}
                className="h-11 w-11 rounded-xl"
                hitSlop={2}
              />
              {unreadCount > 0 ? (
                <View
                  pointerEvents="none"
                  className="absolute -end-1 -top-1 h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1"
                >
                  <AppText
                    variant="caption"
                    style={{ includeFontPadding: false, fontVariant: ['tabular-nums'] }}
                    className="text-[10px] leading-3 font-geist-bold text-white"
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </AppText>
                </View>
              ) : null}
            </View>
          </View>
        </GradientSurface>
      </Appear>

      {stats.isError && !stats.data ? (
        <AppErrorState
          error={stats.error}
          retrying={stats.isRefetching}
          onRetry={() => void stats.refetch()}
          size="inline"
        />
      ) : (
        <Appear index={1}>
          <StatGrid>
            <StatTile
              label={t('dashboard.customers')}
              value={stats.data?.customers}
              icon={Users}
              tone="primary"
              loading={stats.isPending}
            />
            <StatTile
              label={t('dashboard.projects')}
              value={stats.data?.projects}
              icon={Briefcase}
              tone="info"
              loading={stats.isPending}
            />
            <StatTile
              label={t('dashboard.openQuotes')}
              value={stats.data?.openQuotes}
              icon={FileText}
              tone="warning"
              loading={stats.isPending}
            />
            <StatTile
              label={t('dashboard.todayTasks')}
              value={stats.data?.todayTasks}
              icon={ClipboardList}
              tone="success"
              loading={stats.isPending}
            />
          </StatGrid>
        </Appear>
      )}

      <Appear index={2}>
        <View className="gap-2">
          <SectionHeader
            title={t('dashboard.recentLeads')}
            right={
              <AppButton
                title={t('dashboard.viewAll')}
                variant="link"
                size="sm"
                onPress={() => navigation.navigate('Leads')}
              />
            }
          />
          {recent.isPending ? (
            <LeadListSkeleton rows={3} />
          ) : recent.isError ? (
            <AppErrorState
              error={recent.error}
              retrying={recent.isRefetching}
              onRetry={() => void recent.refetch()}
              size="inline"
            />
          ) : recent.data.length === 0 ? (
            <AppEmptyState icon={Users} title={t('dashboard.noLeads')} size="inline" />
          ) : (
            <View className="gap-2">
              {recent.data.map((lead, index) => (
                <Appear key={lead.id} index={index} variant="fade">
                  <LeadListItem
                    lead={lead}
                    onPress={(item) => navigation.navigate('LeadDetail', { leadId: item.id })}
                  />
                </Appear>
              ))}
            </View>
          )}
        </View>
      </Appear>
    </Screen>
  );
}
