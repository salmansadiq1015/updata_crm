import { CheckSquare, Square } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { AppButton } from '@/components/ui/AppButton';
import { AppModal } from '@/components/ui/AppModal';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';

import type { SegmentEstimate } from '../domain/agentDomain';
import type { AgentChannel } from '../types';

type Props = {
  visible: boolean;
  channel: AgentChannel;
  /** Calls go out through the user's paired phone (ESP32 gateway), not the cloud number. */
  pairedPhone?: boolean;
  eligible: number;
  excluded: number;
  segments?: SegmentEstimate | null;
  starting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The only way to start a campaign. States who is contacted and what it costs,
 * and requires an explicit acknowledgement before the confirm button works.
 */
export function StartConfirmSheet({
  pairedPhone = false,
  visible,
  channel,
  eligible,
  excluded,
  segments,
  starting,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(false);
  const close = () => {
    setAcknowledged(false);
    onCancel();
  };

  return (
    <AppModal
      visible={visible}
      title={t(channel === 'call' ? 'aiAgent.confirm.callTitle' : 'aiAgent.confirm.smsTitle')}
      onClose={close}
      dismissible={!starting}
      footer={
        <>
          <AppButton title={t('common.cancel')} variant="ghost" disabled={starting} onPress={close} />
          <AppButton
            title={t(channel === 'call' ? 'aiAgent.confirm.confirmCall' : 'aiAgent.confirm.confirmSms')}
            variant="destructive"
            disabled={!acknowledged}
            loading={starting}
            onPress={onConfirm}
          />
        </>
      }
    >
      <View className="gap-3">
        <AppText variant="title">
          {t(
            channel === 'call'
              ? pairedPhone
                ? 'aiAgent.confirm.callBodyPaired'
                : 'aiAgent.confirm.callBody'
              : 'aiAgent.confirm.smsBody',
            {
              count: eligible,
            },
          )}
        </AppText>
        {channel === 'sms' && segments ? (
          <AppText>
            {t(segments.exact ? 'aiAgent.confirm.segments' : 'aiAgent.confirm.segmentsApprox', {
              count: segments.segments,
            })}
          </AppText>
        ) : null}
        {excluded > 0 ? (
          <AppText tone="muted">{t('aiAgent.confirm.excluded', { count: excluded })}</AppText>
        ) : null}
        <AppAlert
          tone="warning"
          message={t(
            channel === 'call'
              ? pairedPhone
                ? 'aiAgent.channel.callPaired'
                : 'aiAgent.channel.callCloud'
              : 'aiAgent.channel.smsReal',
          )}
        />
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acknowledged, disabled: starting }}
          accessibilityLabel={t('aiAgent.confirm.acknowledge')}
          disabled={starting}
          onPress={() => setAcknowledged((value) => !value)}
          className="min-h-12 flex-row items-center gap-3 rounded-lg px-1 py-2 active:bg-muted"
        >
          <Icon
            icon={acknowledged ? CheckSquare : Square}
            size="md"
            color={acknowledged ? 'primary' : 'mutedForeground'}
          />
          <AppText className="flex-1">{t('aiAgent.confirm.acknowledge')}</AppText>
        </Pressable>
      </View>
    </AppModal>
  );
}
