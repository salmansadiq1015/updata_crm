/**
 * Delay / timer computation (pure). All local times are evaluated in the lead's
 * timezone (derived from the lead's country, the same rule contactPolicy and
 * aiCalling use) unless the node pins a fixed timezone.
 */
import { windowState, nextWindowOpen, recipientTimezone } from '../../aiCalling/engine/callWindow.js';
import { isValidTimezone } from './nodeConfig.js';

const UNIT_MS = { minutes: 60_000, hours: 3_600_000, days: 86_400_000 };

export function zonedParts(date, tz) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(date).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day), h: Number(parts.hour), min: Number(parts.minute), dow };
}

/** Local wall time in `tz` → UTC instant (two-pass offset correction handles DST). */
export function zonedToUtc({ y, m, d, h = 0, min = 0 }, tz) {
  let guess = Date.UTC(y, m - 1, d, h, min);
  for (let i = 0; i < 2; i += 1) {
    const p = zonedParts(new Date(guess), tz);
    const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min);
    guess += Date.UTC(y, m - 1, d, h, min) - asUtc;
  }
  return new Date(guess);
}

function addLocalDays({ y, m, d }, n) {
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), dow: t.getUTCDay() };
}

export function resolveTimezone(config = {}, lead = null) {
  if (config.timezoneMode === 'fixed' && isValidTimezone(config.timezone)) return { timezone: config.timezone, source: 'fixed' };
  const fromLead = recipientTimezone(lead?.address?.country);
  if (fromLead) return { timezone: fromLead, source: 'lead' };
  if (isValidTimezone(config.timezone)) return { timezone: config.timezone, source: 'fallback' };
  return { timezone: 'UTC', source: 'utc' };
}

const [hh, mm] = [(t) => Number(String(t).slice(0, 2)), (t) => Number(String(t).slice(3, 5))];

/**
 * @returns {{ at: Date, timezone: string, timezoneSource: string, shifted: boolean }}
 */
export function computeDelayUntil(config, { now = new Date(), lead = null } = {}) {
  const { timezone, source } = resolveTimezone(config, lead);
  let at;
  switch (config.mode) {
    case 'until': at = new Date(config.until); break;
    case 'time_of_day': {
      const today = zonedParts(now, timezone);
      at = zonedToUtc({ ...today, h: hh(config.time), min: mm(config.time) }, timezone);
      if (at <= now) at = zonedToUtc({ ...addLocalDays(today, 1), h: hh(config.time), min: mm(config.time) }, timezone);
      break;
    }
    case 'next_business_day': {
      const days = config.businessHours?.days?.length ? config.businessHours.days : [1, 2, 3, 4, 5];
      let day = addLocalDays(zonedParts(now, timezone), 1);
      for (let i = 0; i < 8 && !days.includes(day.dow); i += 1) day = addLocalDays(day, 1);
      at = zonedToUtc({ ...day, h: hh(config.time), min: mm(config.time) }, timezone);
      break;
    }
    case 'duration':
    default:
      at = new Date(now.getTime() + Number(config.amount || 0) * (UNIT_MS[config.unit] || UNIT_MS.minutes));
  }
  if (Number.isNaN(at.getTime()) || at < now) at = new Date(now);

  let shifted = false;
  if (config.businessHours?.enabled && config.mode !== 'next_business_day') {
    const schedule = { timezone, callWindow: { start: config.businessHours.start, end: config.businessHours.end }, daysOfWeek: config.businessHours.days };
    if (!windowState(schedule, at).open) {
      const open = nextWindowOpen(schedule, at);
      if (open) { at = open; shifted = true; }
    }
  }
  return { at, timezone, timezoneSource: source, shifted };
}

/** Next firing instant for a schedule trigger ({time, days, timezone}) strictly after `after`. */
export function nextScheduleFire(config, after = new Date()) {
  const tz = isValidTimezone(config.timezone) ? config.timezone : 'UTC';
  const start = zonedParts(after, tz);
  for (let i = 0; i < 8; i += 1) {
    const day = addLocalDays(start, i);
    if (!config.days?.includes(day.dow)) continue;
    const at = zonedToUtc({ ...day, h: hh(config.time), min: mm(config.time) }, tz);
    if (at > after) return at;
  }
  return null;
}
