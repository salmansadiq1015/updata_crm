/**
 * Timezone helpers for follow-ups and the first-response SLA, built on the
 * runtime's Intl tz database (no extra dependency). All inputs/outputs are
 * absolute Date instants; zones are IANA names.
 */

const MINUTE = 60_000;
const DAY_MINUTES = 24 * 60;
const WEEKDAY = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const formatters = new Map();

export function isValidTimezone(tz) {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function formatter(tz) {
  if (!formatters.has(tz)) {
    formatters.set(tz, new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }));
  }
  return formatters.get(tz);
}

/** Wall-clock parts of `date` in `tz`: { isoWeekday, minuteOfDay, year, month, day }. */
export function zonedParts(date, tz) {
  const parts = Object.fromEntries(formatter(tz).formatToParts(date).map((p) => [p.type, p.value]));
  return {
    isoWeekday: WEEKDAY[parts.weekday],
    minuteOfDay: Number(parts.hour) * 60 + Number(parts.minute),
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

/** Instant of local wall time `minuteOfDay` on the same local day as `date`. */
function atLocalMinute(date, tz, minuteOfDay) {
  let guess = new Date(date.getTime() + (minuteOfDay - zonedParts(date, tz).minuteOfDay) * MINUTE);
  // One correction pass absorbs a DST shift between `date` and the target.
  const drift = minuteOfDay - zonedParts(guess, tz).minuteOfDay;
  if (drift !== 0 && Math.abs(drift) <= 120) guess = new Date(guess.getTime() + drift * MINUTE);
  return new Date(Math.floor(guess.getTime() / MINUTE) * MINUTE);
}

/** Start of the next local day (00:00) after `date` in `tz`. */
export function startOfNextZonedDay(date, tz) {
  const { minuteOfDay } = zonedParts(date, tz);
  const approx = new Date(date.getTime() + (DAY_MINUTES - minuteOfDay) * MINUTE);
  return atLocalMinute(new Date(approx.getTime() + 60 * MINUTE), tz, 0);
}

export function startOfZonedDay(date, tz) {
  return atLocalMinute(date, tz, 0);
}

const toMinute = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
};

/**
 * Add `minutes` of working time to `start`. Without business hours (or with an
 * invalid configuration) this is plain wall-clock time. With business hours,
 * only minutes inside [start, end) on the configured ISO weekdays count, in the
 * configured zone.
 */
export function addBusinessMinutes(start, minutes, businessHours = null) {
  const from = new Date(start);
  if (!businessHours?.enabled) return new Date(from.getTime() + minutes * MINUTE);
  const tz = isValidTimezone(businessHours.timezone) ? businessHours.timezone : 'UTC';
  const days = new Set((businessHours.days || []).filter((d) => d >= 1 && d <= 7));
  const open = toMinute(businessHours.start || '08:00');
  const close = toMinute(businessHours.end || '17:00');
  if (!days.size || !(close > open)) return new Date(from.getTime() + minutes * MINUTE);

  let cursor = from;
  let remaining = Math.max(0, Math.round(minutes));
  for (let guard = 0; guard < 400; guard += 1) {
    const { isoWeekday, minuteOfDay } = zonedParts(cursor, tz);
    if (!days.has(isoWeekday) || minuteOfDay >= close) {
      cursor = atLocalMinute(startOfNextZonedDay(cursor, tz), tz, open);
      continue;
    }
    if (minuteOfDay < open) {
      cursor = atLocalMinute(cursor, tz, open);
      continue;
    }
    if (remaining === 0) return cursor;
    const take = Math.min(close - minuteOfDay, remaining);
    cursor = new Date(cursor.getTime() + take * MINUTE);
    remaining -= take;
    if (remaining === 0) return cursor;
  }
  return cursor;
}
