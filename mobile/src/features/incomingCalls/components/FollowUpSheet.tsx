import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { CalendarDays } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppModal } from '@/components/ui/AppModal';
import { AppText } from '@/components/ui/AppText';
import { AppTimeField } from '@/components/ui/AppTimeField';
import { Icon } from '@/components/ui/Icon';
import { formatDateTime } from '@/utils/date';

import { useScheduleInboundFollowUp } from '../hooks/useIncomingCalls';
import type { LeadChoice } from '../types';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Wall-clock date + time on this phone → ISO instant. */
export function localDueAt(date: string, time: string): string | null {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if (!y || !m || !d || hh == null || mm == null) return null;
  const at = new Date(y, m - 1, d, hh, mm, 0, 0);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

const isPast = (iso: string) => new Date(iso).getTime() < Date.now();

/**
 * Schedule a follow-up task for this caller (POST /inbound-calls/:id/follow-up). Same picking
 * pattern as the campaign callback fields: the native date picker, then the native time picker,
 * in this phone's timezone, shown back in full before saving.
 */
export function FollowUpSheet({
  callId,
  visible,
  onClose,
  lead = null,
}: {
  callId: string;
  visible: boolean;
  onClose: () => void;
  /** The call has no lead yet: link this one / create one as part of scheduling. */
  lead?: LeadChoice | null;
}) {
  const { t, i18n } = useTranslation();
  const schedule = useScheduleInboundFollowUp(callId);
  const [date, setDate] = useState<string>(() => ymd(new Date(Date.now() + 24 * 3600 * 1000)));
  const [time, setTime] = useState('10:00');
  const [note, setNote] = useState('');
  const [iosOpen, setIosOpen] = useState(false);
  const dueAt = localDueAt(date, time);
  const inPast = dueAt ? isPast(dueAt) : true;

  const pickDate = (event: DateTimePickerEvent, picked?: Date) => {
    setIosOpen(false);
    if (event.type === 'set' && picked) setDate(ymd(picked));
  };
  const openDate = () => {
    const initial = new Date(`${date}T12:00:00`);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initial,
        mode: 'date',
        minimumDate: new Date(),
        onChange: pickDate,
      });
    } else {
      setIosOpen(true);
    }
  };
  const save = () => {
    if (!dueAt || inPast) return;
    schedule.mutate(
      { dueAt, note: note.trim() || null, lead },
      {
        onSuccess: () => {
          setNote('');
          onClose();
        },
      },
    );
  };

  return (
    <AppModal
      visible={visible}
      presentation="sheet"
      title={t('incomingCalls.followUp.title')}
      dismissible={!schedule.isPending}
      onClose={onClose}
      footer={
        <View className="flex-row gap-2">
          <AppButton
            title={t('common.cancel')}
            variant="ghost"
            onPress={onClose}
            disabled={schedule.isPending}
          />
          <AppButton
            title={t('incomingCalls.followUp.save')}
            className="flex-1"
            loading={schedule.isPending}
            disabled={!dueAt || inPast}
            onPress={save}
          />
        </View>
      }
    >
      <View className="gap-3">
        <View className="flex-row gap-3">
          <View className="flex-1 gap-1">
            <AppText variant="label">{t('incomingCalls.followUp.date')}</AppText>
            <Pressable
              onPress={openDate}
              accessibilityRole="button"
              accessibilityLabel={`${t('incomingCalls.followUp.date')}: ${date}`}
              className="h-12 flex-row items-center gap-2 rounded-xl border border-border bg-muted px-4"
            >
              <Icon icon={CalendarDays} size="sm" color="mutedForeground" />
              <AppText>{date}</AppText>
            </Pressable>
          </View>
          <AppTimeField
            label={t('incomingCalls.followUp.time')}
            accessibilityLabel={t('incomingCalls.followUp.time')}
            value={time}
            onChange={setTime}
          />
        </View>
        {iosOpen ? (
          <DateTimePicker
            value={new Date(`${date}T12:00:00`)}
            mode="date"
            minimumDate={new Date()}
            onChange={pickDate}
          />
        ) : null}
        <AppInput
          label={t('incomingCalls.followUp.note')}
          value={note}
          onChangeText={setNote}
          maxLength={2000}
          multiline
        />
        {dueAt ? (
          <AppText variant="caption" tone={inPast ? 'destructive' : 'muted'}>
            {inPast
              ? t('incomingCalls.followUp.inPast')
              : t('incomingCalls.followUp.when', { when: formatDateTime(dueAt, i18n.language) ?? '' })}
          </AppText>
        ) : null}
      </View>
    </AppModal>
  );
}
