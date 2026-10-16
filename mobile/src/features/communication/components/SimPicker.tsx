import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppRadioGroup } from '@/components/ui/AppRadioGroup';
import { AppText } from '@/components/ui/AppText';
import type { SimInfo } from '@/services/telephony/types';

export function simDisplayName(sim: SimInfo, t: TFunction): string {
  return sim.displayName || sim.carrierName || t('communication.sim.slot', { slot: sim.slotIndex + 1 });
}

/**
 * Only SIMs Android reports as active. The number shown is what the SIM reports
 * (often nothing) and is labelled as such: it is not proof of the caller ID the lead sees.
 */
export function SimPicker({
  sims,
  selected,
  onSelect,
}: {
  sims: SimInfo[];
  selected: number | null;
  onSelect: (subscriptionId: number) => void;
}) {
  const { t } = useTranslation();
  const options = sims.map((sim) => ({
    value: String(sim.subscriptionId),
    label: `${simDisplayName(sim, t)} · ${t('communication.sim.slot', { slot: sim.slotIndex + 1 })}${sim.isEmbedded ? ' · eSIM' : ''}`,
    description: [
      sim.carrierName,
      sim.number ? t('communication.sim.reportedNumber', { number: sim.number }) : null,
      sim.isDefaultVoice ? t('communication.sim.defaultVoice') : null,
    ]
      .filter(Boolean)
      .join(' · '),
  }));

  return (
    <View className="gap-2">
      <AppText variant="label">{t('communication.sim.title')}</AppText>
      <AppRadioGroup
        options={options}
        value={selected === null ? '' : String(selected)}
        onChange={(value) => onSelect(Number(value))}
        accessibilityLabel={t('communication.sim.title')}
      />
    </View>
  );
}
