import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppModal } from '@/components/ui/AppModal';
import { AppRadioGroup } from '@/components/ui/AppRadioGroup';
import { AppText } from '@/components/ui/AppText';

import type { InboundCallDetail, LeadChoice } from '../types';

const CREATE = '__create__';

/** The call needs a lead before this action and has none linked yet. */
export function needsLeadChoice(call: Pick<InboundCallDetail, 'lead' | 'leadDetail'>): boolean {
  return !(call.lead?.id ?? call.leadDetail?.id);
}

/**
 * "Which lead is this caller?" — one of the leads whose number matched (e.g. several leads share
 * it), or a new lead for this caller. A new lead needs the caller's number, so it is not offered
 * for a withheld number.
 */
export function LeadChooserSheet({
  call,
  visible,
  onChoose,
  onClose,
}: {
  call: InboundCallDetail;
  visible: boolean;
  onChoose: (choice: LeadChoice) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const candidates = call.match.candidates;
  const canCreate = Boolean(call.caller.number);
  const [value, setValue] = useState<string>(candidates[0]?.id ?? (canCreate ? CREATE : ''));

  const options = [
    ...candidates.map((c) => ({
      value: c.id,
      label: c.name ?? c.number ?? t('incomingCalls.leadChooser.unnamed'),
      description: c.name && c.number ? c.number : undefined,
    })),
    {
      value: CREATE,
      label: t('incomingCalls.leadChooser.createNew'),
      description: canCreate ? undefined : t('incomingCalls.leadChooser.createNeedsNumber'),
      disabled: !canCreate,
    },
  ];

  return (
    <AppModal
      visible={visible}
      presentation="sheet"
      title={t('incomingCalls.leadChooser.title')}
      description={
        candidates.length > 1
          ? t('incomingCalls.leadChooser.bodySeveral')
          : candidates.length === 1
            ? t('incomingCalls.leadChooser.bodyOne')
            : t('incomingCalls.leadChooser.bodyNone')
      }
      onClose={onClose}
      footer={
        <View className="flex-row gap-2">
          <AppButton title={t('common.cancel')} variant="ghost" onPress={onClose} />
          <AppButton
            title={t('common.continue')}
            className="flex-1"
            disabled={!value}
            onPress={() => onChoose(value === CREATE ? { createLead: true } : { leadId: value })}
          />
        </View>
      }
    >
      <View className="gap-2">
        {options.length === 1 && !canCreate ? (
          <AppText tone="muted">{t('incomingCalls.leadChooser.createNeedsNumber')}</AppText>
        ) : null}
        <AppRadioGroup
          accessibilityLabel={t('incomingCalls.leadChooser.title')}
          value={value}
          onChange={setValue}
          options={options}
        />
      </View>
    </AppModal>
  );
}
