import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Bell, LayoutDashboard, Settings, Users, type LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CallAgentHomeScreen } from '@/features/callAgent/screens/CallAgentHomeScreen';
import { useCallQueueRuntime } from '@/features/callQueue/hooks/useCallQueueRuntime';
import { useCommunicationRuntime } from '@/features/communication/hooks/useCommunicationRuntime';
import { DashboardScreen } from '@/features/dashboard/screens/DashboardScreen';
import { LeadsScreen } from '@/features/leads/screens/LeadsScreen';
import { useUnreadCount } from '@/features/notifications/hooks/useNotifications';
import { NotificationsScreen } from '@/features/notifications/screens/NotificationsScreen';
import { SettingsScreen } from '@/features/settings/screens/SettingsScreen';
import { useTheme } from '@/theme/ThemeProvider';
import { cn } from '@/utils/cn';

import { AgentTabButton } from './AgentTabButton';
import type { MainTabParamList } from './navigationTypes';

const Tab = createBottomTabNavigator<MainTabParamList>();

// Active tab: icon sits in a tinted pill (Material 3 style) and draws a bolder stroke,
// so the state reads by shape as well as colour; the label is announced by the tab itself.
function tabIcon(Glyph: LucideIcon) {
  function TabIcon({ color, focused }: { color: string; size: number; focused: boolean }) {
    return (
      <View
        className={cn(
          'h-8 w-14 items-center justify-center rounded-full',
          focused ? 'bg-primary/10' : 'bg-transparent',
        )}
      >
        <Glyph color={color} size={22} strokeWidth={focused ? 2.4 : 1.9} />
      </View>
    );
  }
  return TabIcon;
}

const MAX_BADGE = 99;

export function MainNavigator() {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const unread = useUnreadCount().data ?? 0;
  useCommunicationRuntime();
  useCallQueueRuntime();

  return (
    <Tab.Navigator
      backBehavior="initialRoute"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        // Shrink a long label (e.g. "Notifications" on 360dp phones) instead of cutting it off.
        tabBarLabel: ({ color, children }) => (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            maxFontSizeMultiplier={1.3}
            style={{ fontFamily: 'Geist-SemiBold', fontSize: 11, marginTop: 2, color }}
          >
            {children}
          </Text>
        ),
        tabBarItemStyle: { paddingTop: 8 },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 66 + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
          // Upward, very soft lift off the content (light only; dark relies on the border).
          boxShadow: scheme === 'dark' ? undefined : '0px -6px 20px rgba(16, 42, 86, 0.06)',
          elevation: 0,
        },
        tabBarBadgeStyle: {
          backgroundColor: colors.destructive,
          color: colors.destructiveForeground,
          fontFamily: 'Geist-SemiBold',
          fontSize: 10,
          borderWidth: 2,
          borderColor: colors.card,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ title: t('tabs.dashboard'), tabBarIcon: tabIcon(LayoutDashboard) }}
      />
      <Tab.Screen
        name="Leads"
        component={LeadsScreen}
        options={{ title: t('tabs.leads'), tabBarIcon: tabIcon(Users) }}
      />
      {/* Centre, highlighted: the AI calling agent hub. */}
      <Tab.Screen
        name="CallAgent"
        component={CallAgentHomeScreen}
        options={{
          title: t('tabs.callAgent'),
          tabBarAccessibilityLabel: t('tabs.callAgentA11y'),
          tabBarButton: (props) => (
            <AgentTabButton {...props} label={t('tabs.callAgent')} a11yLabel={t('tabs.callAgentA11y')} />
          ),
        }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: t('tabs.notifications'),
          tabBarIcon: tabIcon(Bell),
          tabBarBadge: unread > 0 ? (unread > MAX_BADGE ? `${MAX_BADGE}+` : unread) : undefined,
          tabBarAccessibilityLabel:
            unread > 0
              ? `${t('tabs.notifications')}, ${t('dashboard.unreadNotifications', { count: unread })}`
              : t('tabs.notifications'),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: t('tabs.settings'), tabBarIcon: tabIcon(Settings) }}
      />
    </Tab.Navigator>
  );
}
