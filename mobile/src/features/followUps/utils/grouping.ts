// Pure agenda helpers. All "day" logic uses the DEVICE time zone (the Date
// local getters), which is where the user is when they act on a follow-up.
import { INTL_LOCALES, isLocale } from '@/i18n/locales';

import type { FollowUp } from '../types';

export type FollowUpGroups = { overdue: FollowUp[]; today: FollowUp[]; upcoming: FollowUp[] };

function endOfLocalDay(now: Date): number {
  const end = new Date(now);
  end.setHours(24, 0, 0, 0);
  return end.getTime();
}

/**
 * Overdue: due before now. Today: still ahead today (local day). Upcoming:
 * any later day. Each group is sorted ascending; unparseable dates are dropped.
 */
export function groupFollowUps(items: readonly FollowUp[], now: Date = new Date()): FollowUpGroups {
  const groups: FollowUpGroups = { overdue: [], today: [], upcoming: [] };
  const nowMs = now.getTime();
  const tomorrow = endOfLocalDay(now);
  const sorted = items
    .map((item) => ({ item, at: new Date(item.followUpAt).getTime() }))
    .filter(({ at }) => !Number.isNaN(at))
    .sort((a, b) => a.at - b.at);
  for (const { item, at } of sorted) {
    if (at < nowMs) groups.overdue.push(item);
    else if (at < tomorrow) groups.today.push(item);
    else groups.upcoming.push(item);
  }
  return groups;
}

/** `Thu, 15 Oct, 14:30` in the device time zone and the app language. */
export function formatFollowUpTime(value: string, language: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(isLocale(language) ? INTL_LOCALES[language] : INTL_LOCALES.en, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function deviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}
