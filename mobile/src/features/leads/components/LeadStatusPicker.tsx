import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppButton } from '@/components/ui/AppButton';
import { AppModal } from '@/components/ui/AppModal';
import { AppRadioGroup } from '@/components/ui/AppRadioGroup';

import { ASSIGNABLE_LEAD_STATUSES, type AssignableLeadStatus } from '../types';

type Props = {
  visible: boolean;
  current: AssignableLeadStatus;
  saving: boolean;
  onSave: (status: AssignableLeadStatus) => void;
  onClose: () => void;
};

export function LeadStatusPicker({ visible, current, saving, onSave, onClose }: Props) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<AssignableLeadStatus>(current);
  const options = ASSIGNABLE_LEAD_STATUSES.map((value) => ({ value, label: t(`leads.status.${value}`) }));

  return (
    <AppModal
      visible={visible}
      title={t('leads.changeStatus')}
      presentation="sheet"
      onClose={onClose}
      dismissible={!saving}
      footer={
        <>
          <AppButton title={t('common.cancel')} variant="ghost" disabled={saving} onPress={onClose} />
          <AppButton
            title={t('common.save')}
            loading={saving}
            disabled={selected === current}
            onPress={() => onSave(selected)}
          />
        </>
      }
    >
      <AppRadioGroup
        options={options}
        value={selected}
        onChange={setSelected}
        disabled={saving}
        accessibilityLabel={t('leads.changeStatus')}
      />
    </AppModal>
  );
}
