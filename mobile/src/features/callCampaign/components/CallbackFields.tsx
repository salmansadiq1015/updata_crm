import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, View } from 'react-native';

import { AppChip } from '@/components/ui/AppChip';
import { AppInput } from '@/components/ui/AppInput';
import { AppText } from '@/components/ui/AppText';
import { AppTimeField } from '@/components/ui/AppTimeField';
import { Icon } from '@/components/ui/Icon';
import { deviceTimezone } from '@/features/aiAgent/domain/agentDomain';

import { ymdInZone, zonedWallTimeToIso } from '../domain/campaignDomain';

type Value = { date: string | null; time: string | null; timezone: string | null; reason: string };
type Props = { value: Value; onChange: (v: Value) => void; campaignTimezone: string; error?: string | null };

/**
 * Callback date + time in an explicit timezone. "Tomorrow at 10" is never interpreted
 * silently: the caller picks the day and the time, and sees which timezone they mean
 * (the campaign's / lead's zone, or this phone's) before saving.
 */
export function CallbackFields({ value, onChange, campaignTimezone, error }: Props) {
  const { t, i18n } = useTranslation();
  const device = deviceTimezone();
  const tz = value.timezone ?? campaignTimezone;
  const [iosOpen, setIosOpen] = useState(false);
  const today = ymdInZone(new Date(), tz);
  const date = value.date ?? null;
  const iso = date && value.time ? zonedWallTimeToIso(date, value.time, tz) : null;

  const pickDate = (event: DateTimePickerEvent, picked?: Date) => {
    setIosOpen(false);
    if (event.type !== 'set' || !picked) return;
    const ymd = `${picked.getFullYear()}-${String(picked.getMonth() + 1).padStart(2, '0')}-${String(picked.getDate()).padStart(2, '0')}`;
    onChange({ ...value, date: ymd, timezone: tz });
  };
  const openDate = () => {
    const initial = date ? new Date(`${date}T12:00:00`) : new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initial,
        mode: 'date',
        minimumDate: new Date(`${today}T00:00:00`),
        onChange: pickDate,
      });
    } else {
      setIosOpen(true);
    }
  };

  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <View className="flex-1 gap-1">
          <AppText variant="label">{t('callCampaign.callback.date')}</AppText>
          <Pressable
            onPress={openDate}
            accessibilityRole="button"
            accessibilityLabel={`${t('callCampaign.callback.date')}: ${date ?? t('common.notSet')}`}
            className="h-12 flex-row items-center gap-2 rounded-xl border border-border bg-muted px-4"
          >
            <Icon icon={CalendarDays} size="sm" color="mutedForeground" />
            <AppText>{date ?? t('callCampaign.callback.pickDate')}</AppText>
          </Pressable>
        </View>
        <AppTimeField
          label={t('callCampaign.callback.time')}
          accessibilityLabel={t('callCampaign.callback.time')}
          value={value.time ?? '10:00'}
          onChange={(time) => onChange({ ...value, time, timezone: tz })}
        />
      </View>
      {iosOpen ? <DateTimePicker value={new Date()} mode="date" onChange={pickDate} /> : null}
      <View className="gap-1">
        <AppText variant="label">{t('callCampaign.callback.timezone')}</AppText>
        <View className="flex-row flex-wrap gap-2">
          <AppChip
            label={t('callCampaign.callback.campaignZone', { tz: campaignTimezone })}
            selected={tz === campaignTimezone}
            onPress={() => onChange({ ...value, timezone: campaignTimezone })}
          />
          {device !== campaignTimezone ? (
            <AppChip
              label={t('callCampaign.callback.phoneZone', { tz: device })}
              selected={tz === device}
              onPress={() => onChange({ ...value, timezone: device })}
            />
          ) : null}
        </View>
      </View>
      <AppInput
        label={t('callCampaign.callback.reason')}
        value={value.reason}
        onChangeText={(reason) => onChange({ ...value, reason })}
        maxLength={500}
      />
      {iso ? (
        <AppText variant="caption" tone="muted">
          {t('callCampaign.callback.summary', {
            when: new Intl.DateTimeFormat(i18n.language, {
              timeZone: tz,
              dateStyle: 'full',
              timeStyle: 'short',
            }).format(new Date(iso)),
            tz,
          })}
        </AppText>
      ) : null}
      {error ? (
        <AppText variant="caption" tone="destructive">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
