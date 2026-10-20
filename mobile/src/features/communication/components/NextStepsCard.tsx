import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { CalendarClock, Check, MessageSquare, Tag } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import type { RootStackParamList } from '@/navigation/navigationTypes';

import { suggestNextSteps, type NextStep } from '../domain/callGuide';
import type { OutcomeDraft } from '../domain/operations';

type Props = {
  leadId: string;
  draft: OutcomeDraft;
  followUpIn: (days: number) => string;
  onChange: (change: Partial<OutcomeDraft>) => void;
};

/** Next steps suggested by the answers; each is applied only by an explicit tap. */
export function NextStepsCard({ leadId, draft, followUpIn, onChange }: Props) {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const steps = suggestNextSteps(draft.answers, draft.disposition);
  if (!steps.length) return null;

  const row = (step: NextStep) => {
    if (step.kind === 'follow_up') {
      const at = followUpIn(step.days);
      const applied = draft.followUpAt?.slice(0, 10) === at.slice(0, 10);
      const text =
        step.reason === 'timeline'
          ? t('communication.nextSteps.followUp_timeline', { days: step.days })
          : t(`communication.nextSteps.followUp_${step.reason}`);
      return { icon: CalendarClock, text, applied, apply: () => onChange({ followUpAt: at }) };
    }
    if (step.kind === 'status') {
      return {
        icon: Tag,
        text: t(`communication.nextSteps.status_${step.status}`),
        applied: draft.statusChange === step.status,
        apply: () => onChange({ statusChange: step.status }),
      };
    }
    return {
      icon: MessageSquare,
      text: t(`communication.nextSteps.sms_${step.reason}`),
      applied: false,
      sms: true,
      apply: () => navigation.navigate('SmsCompose', { leadId }),
    };
  };

  return (
    <AppCard className="gap-3">
      <AppText variant="label">{t('communication.nextSteps.title')}</AppText>
      {steps.map((step) => {
        const r = row(step);
        return (
          <View
            key={`${step.kind}-${'reason' in step ? step.reason : step.status}`}
            className="flex-row items-center gap-2"
          >
            <Icon icon={r.icon} size="sm" color="primary" />
            <AppText className="flex-1">{r.text}</AppText>
            <AppButton
              size="sm"
              variant={r.applied ? 'ghost' : 'soft'}
              leftIcon={r.applied ? Check : undefined}
              title={
                r.applied
                  ? t('communication.nextSteps.applied')
                  : 'sms' in r
                    ? t('communication.nextSteps.openSms')
                    : t('communication.nextSteps.apply')
              }
              disabled={r.applied}
              onPress={r.apply}
            />
          </View>
        );
      })}
    </AppCard>
  );
}
