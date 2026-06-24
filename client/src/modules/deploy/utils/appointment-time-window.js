export const TIME_WINDOW_PRESETS = [
  {
    key: 'morning',
    start: '08:00',
    end: '12:00',
    labelKey: 'deploy.form.timeWindowMorning',
    fallback: 'Morning',
  },
  {
    key: 'midday',
    start: '10:00',
    end: '14:00',
    labelKey: 'deploy.form.timeWindowMidday',
    fallback: 'Midday',
  },
  {
    key: 'afternoon',
    start: '13:00',
    end: '17:00',
    labelKey: 'deploy.form.timeWindowAfternoon',
    fallback: 'Afternoon',
  },
  {
    key: 'workday',
    start: '08:00',
    end: '17:00',
    labelKey: 'deploy.form.timeWindowWorkday',
    fallback: 'Work day',
  },
];

const TIME_WINDOW_PATTERN = /^\s*(\d{1,2}):([0-5]\d)\s*[-–]\s*(\d{1,2}):([0-5]\d)\s*$/;

function padHour(value) {
  return String(value).padStart(2, '0');
}

function isValidHour(value) {
  const hour = Number(value);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23;
}

export function formatAppointmentTimeWindow(start, end) {
  if (!start || !end) return '';
  return `${start}-${end}`;
}

export function parseAppointmentTimeWindow(value) {
  const match = String(value || '').match(TIME_WINDOW_PATTERN);
  if (!match) return null;

  const [, startHour, startMinute, endHour, endMinute] = match;
  if (!isValidHour(startHour) || !isValidHour(endHour)) return null;

  return {
    start: `${padHour(startHour)}:${startMinute}`,
    end: `${padHour(endHour)}:${endMinute}`,
  };
}

export function isValidAppointmentTimeRange(start, end) {
  if (!start || !end) return true;
  return start < end;
}

export function getAppointmentTimeWindowPresetKey(value) {
  const parsed = parseAppointmentTimeWindow(value);
  if (!parsed) return '';

  const match = TIME_WINDOW_PRESETS.find((preset) => (
    preset.start === parsed.start && preset.end === parsed.end
  ));
  return match?.key || 'custom';
}
