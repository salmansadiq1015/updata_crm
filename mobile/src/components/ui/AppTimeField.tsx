import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Clock } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { AppText } from './AppText';
import { Icon } from './Icon';

type Props = {
  /** "HH:MM" (24h). */
  value: string;
  onChange: (value: string) => void;
  label?: string;
  accessibilityLabel: string;
};

const pad = (n: number) => String(n).padStart(2, '0');
const toDate = (hhmm: string) => {
  const [h = 9, m = 0] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
};

/** A time value picked with the platform's native time picker (no free-text typing). */
export function AppTimeField({ value, onChange, label, accessibilityLabel }: Props) {
  const [iosOpen, setIosOpen] = useState(false);
  const apply = (event: DateTimePickerEvent, date?: Date) => {
    setIosOpen(false);
    if (event.type === 'set' && date) onChange(`${pad(date.getHours())}:${pad(date.getMinutes())}`);
  };
  const open = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: toDate(value), mode: 'time', is24Hour: true, onChange: apply });
    } else {
      setIosOpen(true);
    }
  };
  return (
    <View className="flex-1 gap-1">
      {label ? <AppText variant="label">{label}</AppText> : null}
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${accessibilityLabel}: ${value}`}
        className="h-12 flex-row items-center gap-2 rounded-xl border border-border bg-muted px-4"
      >
        <Icon icon={Clock} size="sm" color="mutedForeground" />
        <AppText variant="body">{value}</AppText>
      </Pressable>
      {iosOpen ? <DateTimePicker value={toDate(value)} mode="time" is24Hour onChange={apply} /> : null}
    </View>
  );
}
