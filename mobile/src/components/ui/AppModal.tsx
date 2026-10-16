import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import Animated, { Easing, FadeIn, SlideInDown, useReducedMotion, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';
import { motion } from '@/theme/tokens';
import { cn } from '@/utils/cn';

import { AppText } from './AppText';

export type AppModalProps = {
  visible: boolean;
  title: string;
  description?: string;
  children?: ReactNode;
  /** Action row, typically AppButtons (ConfirmDialog builds this for you). */
  footer?: ReactNode;
  onClose: () => void;
  /** Backdrop tap and Android back close the modal. Turn off while an action is running. */
  dismissible?: boolean;
  /**
   * `dialog` (default): centered card for confirmations. `sheet`: anchored to the
   * bottom edge with a grab handle — for pickers and filter panels.
   */
  presentation?: 'dialog' | 'sheet';
};

/** Modal surface (rounded like the web CRM's modals), as a centered dialog or a bottom sheet. */
export function AppModal({
  visible,
  title,
  description,
  children,
  footer,
  onClose,
  dismissible = true,
  presentation = 'dialog',
}: AppModalProps) {
  const { shadows } = useTheme();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const sheet = presentation === 'sheet';
  const close = () => {
    if (dismissible) onClose();
  };

  const entering = reduceMotion
    ? undefined
    : sheet
      ? SlideInDown.duration(motion.duration.slow).easing(Easing.out(Easing.cubic))
      : ZoomIn.duration(motion.duration.base)
          .easing(Easing.out(Easing.cubic))
          .withInitialValues({ transform: [{ scale: 0.96 }] });

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={close}>
      <Animated.View
        entering={reduceMotion ? undefined : FadeIn.duration(motion.duration.fast)}
        style={{ flex: 1 }}
      >
        <View
          className={cn('flex-1 bg-black/50', sheet ? 'justify-end' : 'justify-center px-4')}
          style={{ paddingTop: insets.top + 16, paddingBottom: sheet ? 0 : insets.bottom + 16 }}
        >
          <Pressable
            className="absolute inset-0"
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel={title}
            importantForAccessibility="no"
            accessibilityElementsHidden
          />
          <Animated.View
            entering={entering}
            style={
              sheet
                ? { maxHeight: '92%' }
                : { maxHeight: '100%', width: '100%', maxWidth: 448, alignSelf: 'center' }
            }
          >
            <View
              accessibilityViewIsModal
              style={[shadows.xl, sheet ? { paddingBottom: insets.bottom + 16 } : undefined]}
              className={cn(
                'w-full shrink border border-border bg-card',
                sheet ? 'rounded-t-4xl border-b-0 px-4 pt-2' : 'rounded-3xl p-5',
              )}
            >
              {sheet ? (
                <View
                  className="mb-3 h-1.5 w-10 self-center rounded-full bg-border"
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                />
              ) : null}
              <AppText variant="h2">{title}</AppText>
              {description ? (
                <AppText tone="muted" className="mt-1.5">
                  {description}
                </AppText>
              ) : null}
              {children ? (
                <ScrollView className="mt-4 shrink" bounces={false}>
                  {children}
                </ScrollView>
              ) : null}
              {footer ? (
                <View
                  className={cn(
                    'mt-4 flex-row flex-wrap justify-end gap-2',
                    sheet && 'border-t border-border pt-3',
                  )}
                >
                  {footer}
                </View>
              ) : null}
            </View>
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
}
