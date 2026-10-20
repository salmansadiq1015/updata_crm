import { BatteryCharging, Bell, CheckCircle2, MessageSquare } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { getEnv } from '@/config/env';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { requestSmsAgentPermissions, telephony } from '@/services/telephony/telephonyService';

import { smsAgentReadiness, type ReadinessItem } from '../domain/smsAgentDomain';
import { useSmsReadiness } from '../hooks/useSmsAgent';

const ICONS = { smsPermission: MessageSquare, notifications: Bell, battery: BatteryCharging } as const;

/** What this phone still needs before the agent can send, each fixable with one tap. */
export function SmsReadinessCard() {
  const { t } = useTranslation();
  const query = useSmsReadiness();
  const readiness = smsAgentReadiness(
    getEnv().distribution,
    query.data,
    query.data?.batteryUnrestricted ?? false,
  );

  const grant = useSingleFlight(async (item: ReadinessItem) => {
    if (item === 'battery') await telephony.requestIgnoreBatteryOptimizations();
    else {
      await requestSmsAgentPermissions({
        sendSms: {
          title: t('smsAgent.permission.sendTitle'),
          message: t('smsAgent.permission.sendBody'),
          buttonPositive: t('smsAgent.permission.allow'),
          buttonNegative: t('smsAgent.permission.deny'),
        },
        receiveSms: {
          title: t('smsAgent.permission.receiveTitle'),
          message: t('smsAgent.permission.receiveBody'),
          buttonPositive: t('smsAgent.permission.allow'),
          buttonNegative: t('smsAgent.permission.deny'),
        },
        notifications: {
          title: t('smsAgent.permission.notifyTitle'),
          message: t('smsAgent.permission.notifyBody'),
          buttonPositive: t('smsAgent.permission.allow'),
          buttonNegative: t('smsAgent.permission.deny'),
        },
      });
    }
    await query.refetch();
  });

  if (readiness.blocked === 'unsupported')
    return <AppAlert tone="warning" message={t('smsAgent.unsupported')} />;
  if (readiness.blocked === 'noTelephony')
    return <AppAlert tone="destructive" message={t('smsAgent.readiness.noTelephony')} />;

  return (
    <AppCard className="gap-3">
      <AppText variant="label">{t('smsAgent.readiness.title')}</AppText>
      {readiness.missing.length === 0 && query.data ? (
        <View className="flex-row items-center gap-2">
          <Icon icon={CheckCircle2} color="success" size="sm" />
          <AppText tone="success">{t('smsAgent.readiness.ready')}</AppText>
        </View>
      ) : null}
      {readiness.missing.map((item) => (
        <View key={item} className="gap-1">
          <View className="flex-row items-center gap-2">
            <Icon icon={ICONS[item]} color="warning" size="sm" />
            <AppText className="flex-1">{t(`smsAgent.readiness.${item}`)}</AppText>
            <AppButton
              size="sm"
              variant="soft"
              title={t('smsAgent.readiness.grant')}
              onPress={() => void grant(item)}
            />
          </View>
          {item === 'battery' ? (
            <AppText variant="caption" tone="muted">
              {t('smsAgent.readiness.batteryHelp')}
            </AppText>
          ) : null}
        </View>
      ))}
    </AppCard>
  );
}
