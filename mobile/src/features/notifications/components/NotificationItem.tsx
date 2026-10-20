import { AlertTriangle, Bell } from 'lucide-react-native';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressScale } from '@/components/motion/usePressScale';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppText } from '@/components/ui/AppText';
import { IconContainer } from '@/components/ui/IconContainer';
import { motion } from '@/theme/tokens';
import { cn } from '@/utils/cn';
import { formatRelative } from '@/utils/date';

import type { AppNotification } from '../types';

type Props = { notification: AppNotification; onPress?: (notification: AppNotification) => void };

export const NotificationItem = memo(function NotificationItem({ notification, onPress }: Props) {
  const { t, i18n } = useTranslation();
  const when = formatRelative(notification.sentAt, i18n.language);
  const urgent = notification.priority === 'HIGH' || notification.priority === 'CRITICAL';
  const press = usePressScale(motion.pressScale.card);

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole={onPress ? 'button' : 'text'}
        accessibilityLabel={[
          !notification.isRead && t('notifications.unread'),
          notification.title,
          notification.body,
          when,
        ]
          .filter(Boolean)
          .join(', ')}
        accessibilityHint={!notification.isRead && onPress ? t('notifications.markRead') : undefined}
        disabled={!onPress}
        onPress={() => onPress?.(notification)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        className={cn(
          'flex-row gap-3 rounded-2xl border px-3.5 py-3',
          notification.isRead ? 'border-border bg-card' : 'border-primary/25 bg-primary/5',
          onPress && 'active:bg-muted/60',
        )}
      >
        {/* Icon tile; unread adds a dot on its corner (shape cue, not colour alone). */}
        <View>
          <IconContainer
            icon={urgent ? AlertTriangle : Bell}
            tone={urgent ? 'destructive' : notification.isRead ? 'muted' : 'primary'}
            size="sm"
            className="h-9 w-9"
            round
          />
          {notification.isRead ? null : (
            <View className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />
          )}
        </View>
        <View className="flex-1 gap-0.5">
          <View className="min-h-5 flex-row items-center gap-2">
            <AppText
              variant="label"
              className={cn(
                'flex-1',
                notification.isRead ? 'font-geist-medium' : 'font-geist-semibold text-foreground',
              )}
              numberOfLines={2}
            >
              {notification.title}
            </AppText>
            {when ? (
              <AppText variant="caption" tone="muted" numberOfLines={1}>
                {when}
              </AppText>
            ) : null}
          </View>
          {notification.body ? (
            <AppText variant="label" tone="muted" className="font-geist" numberOfLines={2}>
              {notification.body}
            </AppText>
          ) : null}
          {urgent ? (
            <AppBadge
              label={t(
                `notifications.priority.${notification.priority === 'CRITICAL' ? 'critical' : 'high'}`,
              )}
              variant="destructive"
              size="sm"
              className="mt-1"
            />
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
});
