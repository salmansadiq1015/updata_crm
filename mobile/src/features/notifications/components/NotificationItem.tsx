import { AlertTriangle, Bell } from 'lucide-react-native';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressScale } from '@/components/motion/usePressScale';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppText } from '@/components/ui/AppText';
import { IconContainer } from '@/components/ui/IconContainer';
import { useTheme } from '@/theme/ThemeProvider';
import { motion } from '@/theme/tokens';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/date';

import type { AppNotification } from '../types';

type Props = { notification: AppNotification; onPress: (notification: AppNotification) => void };

export const NotificationItem = memo(function NotificationItem({ notification, onPress }: Props) {
  const { t, i18n } = useTranslation();
  const when = formatRelative(notification.sentAt, i18n.language);
  const urgent = notification.priority === 'HIGH' || notification.priority === 'CRITICAL';
  const { shadows } = useTheme();
  const press = usePressScale(motion.pressScale.card);

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[
          !notification.isRead && t('notifications.unread'),
          notification.title,
          notification.body,
          when,
        ]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint={notification.isRead ? undefined : t('notifications.markRead')}
        onPress={() => onPress(notification)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={notification.isRead ? undefined : shadows.md}
        className={cn(
          'flex-row gap-3 rounded-2xl border p-4 active:bg-muted/60',
          notification.isRead ? 'border-border bg-card' : 'border-primary/25 bg-card',
        )}
      >
        {/* Icon tile; unread adds a dot on its corner (shape cue, not colour alone). */}
        <View>
          <IconContainer
            icon={urgent ? AlertTriangle : Bell}
            tone={urgent ? 'destructive' : notification.isRead ? 'muted' : 'primary'}
            size="md"
            round
          />
          {notification.isRead ? null : (
            <View className="absolute -end-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />
          )}
        </View>
        <View className="flex-1 gap-1">
          <View className="flex-row items-start gap-2">
            <AppText
              variant="label"
              className={cn('flex-1', notification.isRead ? 'font-geist-medium' : 'font-geist-semibold')}
              numberOfLines={2}
            >
              {notification.title}
            </AppText>
            {urgent ? (
              <AppBadge
                label={t(
                  `notifications.priority.${notification.priority === 'CRITICAL' ? 'critical' : 'high'}`,
                )}
                variant="destructive"
                size="sm"
              />
            ) : null}
          </View>
          {notification.body ? (
            <AppText tone="muted" numberOfLines={3}>
              {notification.body}
            </AppText>
          ) : null}
          {when ? (
            <AppText variant="caption" tone="muted">
              {when}
            </AppText>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
});
