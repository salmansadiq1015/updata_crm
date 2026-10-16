import { Bell, Briefcase, ChevronRight, ClipboardList, FileText, Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Screen } from '@/components/layout/Screen';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { Appear } from '@/components/motion/Appear';
import { usePressScale } from '@/components/motion/usePressScale';
import { AppAvatar } from '@/components/ui/AppAvatar';
import { AppButton } from '@/components/ui/AppButton';
import { AppEmptyState } from '@/components/ui/AppEmptyState';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppText } from '@/components/ui/AppText';
import { GradientSurface } from '@/components/ui/GradientSurface';
import { Icon } from '@/components/ui/Icon';
import { IconContainer } from '@/components/ui/IconContainer';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import { LeadListItem } from '@/features/leads/components/LeadListItem';
import { LeadListSkeleton } from '@/features/leads/components/LeadListSkeleton';
import { useRecentLeads } from '@/features/leads/hooks/useLeads';
import { useUnreadCount } from '@/features/notifications/hooks/useNotifications';
import type { MainTabScreenProps } from '@/navigation/navigationTypes';

import { StatTile } from '../components/StatTile';
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

  const press = usePressScale();

  return (
    <Screen refreshing={refreshing} onRefresh={refresh} contentClassName="gap-6 pt-3">
      {/* Brand hero: greeting, and the unread-notifications shortcut when there is something new. */}
      <Appear>
        <GradientSurface className="rounded-4xl p-5">
          <View className="flex-row items-center gap-4">
            <View className="flex-1 gap-1">
              <AppText variant="h1" className="text-white" numberOfLines={2}>
                {t('dashboard.greeting', { name: user?.firstName ?? user?.fullName ?? '' })}
              </AppText>
              <AppText className="text-white/75">{t('dashboard.subtitle')}</AppText>
            </View>
            {user ? <AppAvatar name={user.fullName} imageUrl={user.avatarUrl} size="lg" ring /> : null}
          </View>

          {unread.data ? (
            <Animated.View style={[press.style, { marginTop: 20 }]}>
              <Pressable
                accessibilityRole="button"
                onPress={() => navigation.navigate('Notifications')}
                onPressIn={press.onPressIn}
                onPressOut={press.onPressOut}
                accessibilityLabel={t('dashboard.unreadNotifications', { count: unread.data })}
                className="min-h-12 flex-row items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-3 py-2.5 active:bg-white/20"
              >
                <IconContainer icon={Bell} tone="inverse" size="sm" round />
                <AppText variant="label" className="flex-1 text-white">
                  {t('dashboard.unreadNotifications', { count: unread.data })}
                </AppText>
                <Icon icon={ChevronRight} size="sm" color="primaryForeground" flipRtl />
              </Pressable>
            </Animated.View>
          ) : null}
        </GradientSurface>
      </Appear>

      {stats.isError && !stats.data ? (
        <AppErrorState
          error={stats.error}
          retrying={stats.isRefetching}
          onRetry={() => void stats.refetch()}
        />
      ) : (
        <Appear index={1}>
          <View className="flex-row flex-wrap gap-3">
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
          </View>
        </Appear>
      )}

      <Appear index={2}>
        <View className="gap-3">
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
            />
          ) : recent.data.length === 0 ? (
            <AppEmptyState icon={Users} title={t('dashboard.noLeads')} className="py-6" />
          ) : (
            <View className="gap-3">
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
