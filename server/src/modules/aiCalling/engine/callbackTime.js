/**
 * Resolve WHEN a follow-up call should happen — pure and unit-tested.
 *
 * Input is what the voice agent passed to request_callback (`when`): ideally an
 * ISO 8601 instant it computed from the local time in its context, otherwise
 * the lead's words ("in 10 minutes", "tomorrow morning", "Friday at 3").
 *
 * Rules (never fabricate precision):
 *  - an ISO instant with offset is used as is                → kind 'exact'
 *  - "in N minutes/hours"                                     → kind 'relative'
 *  - a day + clock time                                       → kind 'exact'
 *  - a day + part of day ("tomorrow morning")                 → kind 'part_of_day' (approximate)
 *  - a day alone / "later" / nothing usable                   → kind 'default_delay' (approximate)
 * The lead's words are always kept as evidence. The result is then fitted into
 * the permitted calling window; a shift is reported, never hidden.
 */
import { parseCallbackTime, zonedTimeToUtc } from '../../simSms/engine/smsInsights.js';
import { nextWindowOpen, windowState, isValidTimezone } from './callWindow.js';

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;
const MAX_HORIZON_MS = 90 * 24 * 60 * 60_000;

// Target local clock time for a part of the day. Approximate by design.
const PARTS_OF_DAY = [
  { key: 'morning', h: 10, min: 0, re: /\b(morning|this morning|früh|morgens|vormittag|matin|matinée|subah|sobah)\b|الصبح|صباح/i },
  { key: 'noon', h: 12, min: 30, re: /\b(noon|midday|lunch(time)?|mittag|midi)\b|الظهر/i },
  { key: 'afternoon', h: 15, min: 0, re: /\b(afternoon|nachmittag|après-midi|apres-midi|dopahar)\b|بعد الظهر|العصر/i },
  { key: 'evening', h: 17, min: 30, re: /\b(evening|tonight|abend|abends|soir|soirée|ce soir|sham|shaam)\b|المساء|مساء|الليلة/i },
];
const LATER = /\b(later|later today|another time|some other time|not now|busy now|call (me )?back|später|plus tard|baad mein)\b|لاحقا|لاحقاً|بعدين/i;
const NEXT_WEEK = /\b(next week|nächste woche|semaine prochaine)\b|الأسبوع القادم/i;
const TOMORROW_ML = /\b(morgen|demain)\b|بكرة|بكره|غدا|غداً/i;
const DAY_AFTER_ML = /\b(übermorgen|après-demain|apres-demain)\b|بعد بكرة/i;

function zonedYmd(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = (t) => Number(parts.find((p) => p.type === t)?.value);
  return { y: get('year'), m: get('month'), d: get('day') };
}
function addDays({ y, m, d }, days) {
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** Day offset for multilingual words parseCallbackTime does not cover ("morgen", "demain", "بكرة"). */
function multilingualDay(text, now, timezone) {
  // German "morgen früh" = tomorrow morning; bare "morgens" = in the morning (no day).
  if (DAY_AFTER_ML.test(text)) return addDays(zonedYmd(now, timezone), 2);
  if (/\bmorgens\b/i.test(text) && !/\bmorgen\b/i.test(text)) return null;
  if (TOMORROW_ML.test(text)) return addDays(zonedYmd(now, timezone), 1);
  if (NEXT_WEEK.test(text)) return addDays(zonedYmd(now, timezone), 7);
  return null;
}

/**
 * @param {string|null} when       what the agent recorded
 * @param {object} opts
 * @param {Date}   opts.now
 * @param {string} opts.timezone   lead/agent IANA zone used to read local phrases
 * @param {object} [opts.schedule] calling window ({timezone, callWindow, daysOfWeek}) the call must fit in
 * @param {number} [opts.defaultDelayMinutes] when no usable time was given
 * @param {number} [opts.minLeadMinutes] never earlier than now + this (gives the line time to clear)
 * @returns {{ at: Date, kind: string, approximate: boolean, evidence: string|null, requestedText: string|null,
 *             shifted: boolean, shiftedFrom: Date|null, timezone: string }}
 */
export function resolveCallbackTime(when, {
  now = new Date(), timezone = 'UTC', schedule = null, defaultDelayMinutes = 120, minLeadMinutes = 2,
} = {}) {
  const tz = isValidTimezone(timezone) ? timezone : 'UTC';
  const text = typeof when === 'string' ? when.trim().slice(0, 300) : '';
  const earliest = new Date(now.getTime() + Math.max(0, minLeadMinutes) * 60_000);
  let at = null; let kind = 'default_delay'; let approximate = true; let evidence = null;

  if (text && ISO.test(text)) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) { at = parsed; kind = 'exact'; approximate = false; evidence = text; }
  }
  if (!at && text) {
    const parsed = parseCallbackTime(text, { now, timezone: tz });
    if (parsed.at) {
      at = parsed.at; approximate = false; evidence = parsed.evidence;
      kind = /\bin\s+\d|baad|bad|mein|main|بعد|میں/i.test(parsed.evidence || '') ? 'relative' : 'exact';
    } else {
      const part = PARTS_OF_DAY.find((p) => p.re.test(text));
      const day = parsed.dayOnly || multilingualDay(text, now, tz);
      if (part) {
        let target = day || zonedYmd(now, tz);
        let candidate = zonedTimeToUtc({ ...target, h: part.h, min: part.min }, tz);
        // "this evening" said at 19:00 → tomorrow evening, never the past.
        if (!day && candidate <= now) { target = addDays(target, 1); candidate = zonedTimeToUtc({ ...target, h: part.h, min: part.min }, tz); }
        at = candidate; kind = 'part_of_day'; evidence = [parsed.evidence, text.match(part.re)?.[0]].filter(Boolean).join(' … ');
      } else if (day) {
        // A day without a time: the start of that day's calling window, flagged approximate.
        at = zonedTimeToUtc({ ...day, h: 9, min: 0 }, tz); kind = 'day_only'; evidence = parsed.evidence || text;
      } else if (LATER.test(text)) {
        evidence = text.match(LATER)?.[0] || null;
      }
    }
  }
  if (!at) at = new Date(now.getTime() + Math.max(5, defaultDelayMinutes) * 60_000);
  if (at < earliest) at = earliest;
  if (at.getTime() - now.getTime() > MAX_HORIZON_MS) { at = new Date(now.getTime() + MAX_HORIZON_MS); approximate = true; }

  let shifted = false; let shiftedFrom = null;
  if (schedule && !windowState(schedule, at).open) {
    const open = nextWindowOpen(schedule, at);
    if (open) { shiftedFrom = at; at = open; shifted = true; }
  }
  return { at, kind, approximate, evidence, requestedText: text || null, shifted, shiftedFrom, timezone: tz };
}

/** Local "now" line given to the voice agent so it can turn "in 10 minutes" into an ISO instant itself. */
export function localTimeLine(now = new Date(), timezone = 'UTC') {
  const tz = isValidTimezone(timezone) ? timezone : 'UTC';
  const local = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset' }).format(now);
  return `Current local time for the lead: ${local} (${tz}). When a callback is requested, pass "when" as an ISO 8601 time with offset if you can compute it, otherwise the lead's exact words.`;
}
