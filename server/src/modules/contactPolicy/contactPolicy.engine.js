/**
 * Pure contact-policy evaluation (no I/O) — unit-tested exhaustively.
 *
 * Windows are ROLLING (last 24 h / last 7 days), not calendar days, so a
 * policy can't be dodged by sending at 23:59 and 00:01. Quiet hours are
 * evaluated in the LEAD's local time (country → single-zone timezone); when the
 * timezone is unknown, the quiet-hours rule cannot be applied and is reported
 * as such (each channel still applies its own campaign window).
 */
import { nextWindowOpen, recipientTimezone, windowState } from '../aiCalling/engine/callWindow.js';
import { DAY_MS, DEFAULT_POLICY, WEEK_MS } from './contactPolicy.constants.js';

const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/** Fill a stored settings doc with defaults. `null` → disabled legacy policy. */
export function normalizePolicy(stored) {
  if (!stored) return { ...structuredClone(DEFAULT_POLICY), enabled: false, configured: false };
  const channels = {};
  for (const [channel, def] of Object.entries(DEFAULT_POLICY.channels)) {
    channels[channel] = {
      perDay: num(stored.channels?.[channel]?.perDay, def.perDay),
      perWeek: num(stored.channels?.[channel]?.perWeek, def.perWeek),
    };
  }
  return {
    enabled: stored.enabled !== false,
    configured: true,
    maxTouchesPerDay: num(stored.maxTouchesPerDay, DEFAULT_POLICY.maxTouchesPerDay),
    maxTouchesPerWeek: num(stored.maxTouchesPerWeek, DEFAULT_POLICY.maxTouchesPerWeek),
    minGapMinutes: num(stored.minGapMinutes, DEFAULT_POLICY.minGapMinutes),
    channels,
    quietHours: {
      enabled: stored.quietHours?.enabled !== false,
      start: stored.quietHours?.start || DEFAULT_POLICY.quietHours.start,
      end: stored.quietHours?.end || DEFAULT_POLICY.quietHours.end,
    },
  };
}

/** How long the ledger must keep events for this policy. */
export function horizonMs(policy) {
  return Math.max(WEEK_MS, num(policy.minGapMinutes, 0) * 60_000);
}

export function leadTimezone(lead) {
  return recipientTimezone(lead?.address?.country) || null;
}

/**
 * Quiet hours in the lead's local time. The allowed window is end → start
 * (e.g. 08:00 → 20:00), so the next allowed instant is that window's opening.
 */
export function quietHoursState(policy, timezone, now = new Date()) {
  if (!policy.quietHours?.enabled) return { applies: false, quiet: false, until: null };
  if (!timezone) return { applies: false, quiet: false, until: null, unknownTimezone: true };
  const allowed = { timezone, callWindow: { start: policy.quietHours.end, end: policy.quietHours.start }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] };
  if (windowState(allowed, now).open) return { applies: true, quiet: false, until: null };
  return { applies: true, quiet: true, until: nextWindowOpen(allowed, now) };
}

/** The k-th oldest event time + period = when one slot frees up. */
function slotFreesAt(times, max, periodMs) {
  const sorted = [...times].sort((a, b) => a - b);
  const idx = sorted.length - max; // the oldest event that must age out
  return new Date(sorted[Math.max(0, idx)] + periodMs);
}

/**
 * Frequency limits against the ledger events (rolling windows).
 * @param {object} policy normalized policy
 * @param {{channel:string, at:Date}[]} events recent events for the lead
 * @returns {{ allowed:boolean, reason:string|null, nextAllowedAt:Date|null, counts:object }}
 */
export function evaluateLimits(policy, events, channel, now = new Date(), { extraLastContactAt = null } = {}) {
  const t = now.getTime();
  const at = (e) => new Date(e.at).getTime();
  const day = events.filter((e) => at(e) > t - DAY_MS).map(at);
  const week = events.filter((e) => at(e) > t - WEEK_MS).map(at);
  const chDay = events.filter((e) => e.channel === channel && at(e) > t - DAY_MS).map(at);
  const chWeek = events.filter((e) => e.channel === channel && at(e) > t - WEEK_MS).map(at);
  const latest = Math.max(...events.map(at), extraLastContactAt ? new Date(extraLastContactAt).getTime() : -Infinity);
  const counts = { day: day.length, week: week.length, channelDay: chDay.length, channelWeek: chWeek.length, lastTouchAt: Number.isFinite(latest) ? new Date(latest) : null };
  if (!policy.enabled) return { allowed: true, reason: null, nextAllowedAt: null, counts };

  const violations = [];
  const gapMs = num(policy.minGapMinutes, 0) * 60_000;
  if (gapMs > 0 && Number.isFinite(latest) && latest > t - gapMs) violations.push(['min_gap', new Date(latest + gapMs)]);
  if (policy.maxTouchesPerDay > 0 && day.length >= policy.maxTouchesPerDay) violations.push(['daily_limit', slotFreesAt(day, policy.maxTouchesPerDay, DAY_MS)]);
  if (policy.maxTouchesPerWeek > 0 && week.length >= policy.maxTouchesPerWeek) violations.push(['weekly_limit', slotFreesAt(week, policy.maxTouchesPerWeek, WEEK_MS)]);
  const ch = policy.channels?.[channel] || { perDay: 0, perWeek: 0 };
  if (ch.perDay > 0 && chDay.length >= ch.perDay) violations.push(['channel_daily_limit', slotFreesAt(chDay, ch.perDay, DAY_MS)]);
  if (ch.perWeek > 0 && chWeek.length >= ch.perWeek) violations.push(['channel_weekly_limit', slotFreesAt(chWeek, ch.perWeek, WEEK_MS)]);
  if (!violations.length) return { allowed: true, reason: null, nextAllowedAt: null, counts };
  // The binding constraint is the one that frees up last.
  violations.sort((a, b) => b[1] - a[1]);
  return { allowed: false, reason: violations[0][0], nextAllowedAt: violations[0][1], counts };
}

/**
 * MongoDB $expr conditions equivalent to evaluateLimits (ledger events only),
 * so the reservation is a single atomic conditional update.
 */
export function limitConditions(policy, channel, now = new Date()) {
  if (!policy.enabled) return [];
  const t = now.getTime();
  const events = { $ifNull: ['$events', []] };
  const countWhere = (cond) => ({ $size: { $filter: { input: events, as: 'e', cond } } });
  const since = (ms) => ({ $gt: ['$$e.at', new Date(t - ms)] });
  const conditions = [];
  const gapMs = num(policy.minGapMinutes, 0) * 60_000;
  if (gapMs > 0) {
    conditions.push({ $or: [
      { $eq: [{ $size: events }, 0] },
      { $lte: [{ $max: { $map: { input: events, as: 'e', in: '$$e.at' } } }, new Date(t - gapMs)] },
    ] });
  }
  if (policy.maxTouchesPerDay > 0) conditions.push({ $lt: [countWhere(since(DAY_MS)), policy.maxTouchesPerDay] });
  if (policy.maxTouchesPerWeek > 0) conditions.push({ $lt: [countWhere(since(WEEK_MS)), policy.maxTouchesPerWeek] });
  const ch = policy.channels?.[channel] || {};
  if (ch.perDay > 0) conditions.push({ $lt: [countWhere({ $and: [{ $eq: ['$$e.channel', channel] }, since(DAY_MS)] }), ch.perDay] });
  if (ch.perWeek > 0) conditions.push({ $lt: [countWhere({ $and: [{ $eq: ['$$e.channel', channel] }, since(WEEK_MS)] }), ch.perWeek] });
  return conditions;
}
