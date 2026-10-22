/**
 * Call-window evaluation — pure, so calling-hour rules are unit-tested.
 *
 * Two independent gates apply before every dial:
 *   1. the campaign's configured window (campaign timezone, days, hours);
 *   2. the RECIPIENT's local quiet hours, derived from the lead's country.
 * A campaign scheduled in Zurich must not ring a lead in Karachi at night.
 *
 * Only countries with a single civil timezone are mapped. For multi-zone
 * countries (US, CA, AU, BR, RU, MX, …) the recipient's local time cannot be
 * known from the country alone, so gate 2 reports `known: false` and the
 * campaign window is the only protection — operators calling those countries
 * must set a conservative campaign window (documented in LEAD-VOICE-CALLING.md).
 *
 * The defaults (Mon–Sat, 08:00–20:00 local) are a conservative baseline, NOT
 * legal advice: telemarketing hours differ by jurisdiction and must be verified
 * by the operator (AI_CALLING_RECIPIENT_HOURS / AI_CALLING_RECIPIENT_DAYS).
 */

const COUNTRY_TIMEZONE = Object.freeze({
  CH: 'Europe/Zurich', LI: 'Europe/Vaduz', DE: 'Europe/Berlin', AT: 'Europe/Vienna',
  FR: 'Europe/Paris', IT: 'Europe/Rome', NL: 'Europe/Amsterdam', BE: 'Europe/Brussels',
  LU: 'Europe/Luxembourg', GB: 'Europe/London', IE: 'Europe/Dublin', DK: 'Europe/Copenhagen',
  SE: 'Europe/Stockholm', NO: 'Europe/Oslo', FI: 'Europe/Helsinki', PL: 'Europe/Warsaw',
  CZ: 'Europe/Prague', SK: 'Europe/Bratislava', HU: 'Europe/Budapest', SI: 'Europe/Ljubljana',
  HR: 'Europe/Zagreb', GR: 'Europe/Athens', RO: 'Europe/Bucharest', BG: 'Europe/Sofia',
  TR: 'Europe/Istanbul', PK: 'Asia/Karachi', IN: 'Asia/Kolkata', AE: 'Asia/Dubai',
  SA: 'Asia/Riyadh', QA: 'Asia/Qatar', KW: 'Asia/Kuwait', BH: 'Asia/Bahrain', OM: 'Asia/Muscat',
  EG: 'Africa/Cairo', MA: 'Africa/Casablanca', JP: 'Asia/Tokyo', KR: 'Asia/Seoul',
  SG: 'Asia/Singapore', HK: 'Asia/Hong_Kong', CN: 'Asia/Shanghai', BD: 'Asia/Dhaka',
});

const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function parseMinutes(value) {
  const [h, m] = String(value || '00:00').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** Local-time window evaluation. Returns { open, delayMs } in the schedule's tz. */
export function windowState(schedule, now = new Date()) {
  const tz = schedule?.timezone || 'UTC';
  let hour = 0; let minute = 0; let weekday = 1;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(now);
    hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
    weekday = WEEKDAY[parts.find((p) => p.type === 'weekday')?.value] ?? 1;
  } catch {
    // An invalid timezone must not silently open the window: fail closed and
    // re-check in an hour (campaign validation rejects unknown zones up front).
    return { open: false, delayMs: 60 * 60_000, invalidTimezone: true };
  }

  const days = schedule?.daysOfWeek?.length ? schedule.daysOfWeek : [0, 1, 2, 3, 4, 5, 6];
  const start = parseMinutes(schedule?.callWindow?.start);
  const end = parseMinutes(schedule?.callWindow?.end);
  const nowMin = hour * 60 + minute;
  const dayOk = days.includes(weekday);
  const inWindow = start <= end ? (nowMin >= start && nowMin < end) : (nowMin >= start || nowMin < end);
  if (dayOk && inWindow) return { open: true, delayMs: 0 };
  // Not open — delay to the next window start today, else ~1h and re-check.
  let minutesUntil = start - nowMin;
  if (minutesUntil <= 0) minutesUntil += 24 * 60;
  return { open: false, delayMs: Math.min(minutesUntil, 60) * 60_000 };
}

/**
 * The first instant (to the minute) at or after `now` when the window is open, or null if it
 * never opens within 8 days (e.g. no days selected). `windowState().delayMs` is only a re-check
 * hint capped at one hour; this is the time to show people. Steps in local time, so DST and
 * day-of-week rules come from the same evaluation as the dial gate.
 */
export function nextWindowOpen(schedule, now = new Date()) {
  if (windowState(schedule, now).open) return now;
  const STEP = 15 * 60_000;
  const start = Math.ceil(now.getTime() / 60_000) * 60_000;
  for (let t = start; t <= start + 8 * 24 * 60 * 60_000; t += STEP) {
    if (!windowState(schedule, new Date(t)).open) continue;
    let first = t;
    while (first - 60_000 > now.getTime() && windowState(schedule, new Date(first - 60_000)).open) first -= 60_000;
    return new Date(first);
  }
  return null;
}

export function isValidTimezone(tz) {
  try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return true; } catch { return false; }
}

export function recipientTimezone(country) {
  return COUNTRY_TIMEZONE[String(country || '').toUpperCase()] || null;
}

/** Parse "08:00-20:00" → { start, end }; falls back to the default on bad input. */
export function parseHours(value, fallback = '08:00-20:00') {
  const match = /^(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(String(value || '').trim());
  if (!match) return parseHours(fallback, '08:00-20:00');
  return { start: match[1], end: match[2] };
}

export function parseDays(value, fallback = [1, 2, 3, 4, 5, 6]) {
  // Note: Number('') === 0, so blank entries must be dropped before parsing.
  const days = String(value || '').split(',').map((d) => d.trim()).filter(Boolean).map(Number)
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return days.length ? days : fallback;
}

/**
 * Recipient-local quiet-hours gate.
 * @returns {{ known: boolean, open: boolean, delayMs: number, timezone: string|null }}
 */
export function recipientWindow(country, {
  hours = process.env.AI_CALLING_RECIPIENT_HOURS,
  days = process.env.AI_CALLING_RECIPIENT_DAYS,
  now = new Date(),
} = {}) {
  const timezone = recipientTimezone(country);
  if (!timezone) return { known: false, open: true, delayMs: 0, timezone: null };
  const state = windowState({ timezone, callWindow: parseHours(hours), daysOfWeek: parseDays(days) }, now);
  return { known: true, open: state.open, delayMs: state.delayMs, timezone };
}
