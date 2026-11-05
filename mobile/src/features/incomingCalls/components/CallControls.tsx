import { Bot, Hand, PhoneOff, PhoneMissed, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { AppButton, type ButtonVariant } from '@/components/ui/AppButton';
import { AppText } from '@/components/ui/AppText';

import { availableControls } from '../domain/incomingCallDomain';
import { useInboundControl } from '../hooks/useIncomingCalls';
import type { ControlKind } from '../types';

const BUTTONS: Record<ControlKind, { icon: LucideIcon; variant: ButtonVariant }> = {
  answer: { icon: Bot, variant: 'primary' },
  reject: { icon: PhoneMissed, variant: 'outline' },
  takeover: { icon: Hand, variant: 'outline' },
  hangup: { icon: PhoneOff, variant: 'destructive' },
};

/**
 * Owner controls for a live incoming call. Every action is confirmed first: they act on a real
 * phone call through the bridge (answer / decline / move audio to the handset / end).
 */
export function CallControls({
  call,
}: {
  call: { id: string; status: string; handling: string | null; pendingCommand?: string | null };
}) {
  const { t } = useTranslation();
  const control = useInboundControl(call.id);
  const [confirm, setConfirm] = useState<ControlKind | null>(null);
  const kinds = availableControls(call);
  if (kinds.length === 0 && !call.pendingCommand) return null;

  return (
    <View className="gap-2">
      {call.pendingCommand ? (
        <AppText variant="caption" tone="muted" accessibilityLiveRegion="polite">
          {t('incomingCalls.control.pending', {
            command: t(`incomingCalls.control.${call.pendingCommand as ControlKind}`, {
              defaultValue: call.pendingCommand,
            }),
          })}
        </AppText>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        {kinds.map((kind) => (
          <AppButton
            key={kind}
            title={t(`incomingCalls.control.${kind}`)}
            leftIcon={BUTTONS[kind].icon}
            variant={BUTTONS[kind].variant}
            size="sm"
            disabled={control.isPending}
            onPress={() => setConfirm(kind)}
          />
        ))}
      </View>
      <ConfirmDialog
        visible={confirm !== null}
        title={confirm ? t(`incomingCalls.control.confirm.${confirm}.title`) : ''}
        description={confirm ? t(`incomingCalls.control.confirm.${confirm}.body`) : undefined}
        confirmLabel={confirm ? t(`incomingCalls.control.${confirm}`) : ''}
        destructive={confirm === 'hangup' || confirm === 'reject'}
        loading={control.isPending}
        onConfirm={() => {
          if (confirm) control.mutate(confirm, { onSettled: () => setConfirm(null) });
        }}
        onCancel={() => setConfirm(null)}
      />
    </View>
  );
}
