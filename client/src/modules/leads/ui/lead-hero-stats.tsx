'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { AlarmClock, CalendarClock, Flame, UserX, Users } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { intlLocaleFor } from '@/lib/i18n/locale-config';
import { HeroStat } from '@/shared/components/hero-art';
import { useLeadStats } from '../hooks/use-leads';

type Translate = (key: string, fallback?: string, vars?: Record<string, string | number>) => string;
const tileButton = 'rounded-2xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/50';

/**
 * KPI tiles for the Leads header. Counts cover every lead the user may see (not the current
 * page or filters). `listUpdatedAt` is the main list's dataUpdatedAt: when the list refetches
 * after a write, the stats follow (the server answer is cached and invalidated on writes).
 */
export function LeadHeroStats({ listUpdatedAt, onOverdue, onHot }: { listUpdatedAt?: number; onOverdue: () => void; onHot: () => void }) {
  const { t: translate, locale } = useLanguage() as unknown as { t: Translate; locale: string };
  const stats = useLeadStats();
  const { refetch } = stats;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (listUpdatedAt) void refetch();
  }, [listUpdatedAt, refetch]);

  const t = translate;
  const s = stats.data;
  const nf = new Intl.NumberFormat(intlLocaleFor(locale));
  const n = (v: number | undefined) => (v == null ? '—' : nf.format(v));
  const loading = stats.isLoading;

  return (
    <>
      <HeroStat icon={Users} label={t('hero.leads.total', 'All leads')} value={n(s?.total)} hint={t('hero.leads.newThisWeek', '{count} new this week', { count: n(s?.newThisWeek) })} loading={loading} />
      <button type="button" onClick={onHot} className={tileButton}>
        <HeroStat icon={Flame} tone="text-amber-300" label={t('hero.leads.hot', 'Hot leads')} value={n(s?.hot)} hint={t('hero.leads.hotHint', 'Top score band')} loading={loading} />
      </button>
      <button type="button" onClick={onOverdue} className={tileButton}>
        <HeroStat icon={AlarmClock} tone={s?.slaOverdue ? 'text-rose-300' : 'text-emerald-300'} label={t('hero.leads.overdue', 'Response overdue')} value={n(s?.slaOverdue)} hint={t('hero.leads.overdueHint', 'Past the first-response SLA')} loading={loading} />
      </button>
      <Link href="/leads/follow-ups" className={tileButton}>
        <HeroStat icon={CalendarClock} tone="text-cyan-300" label={t('hero.leads.followUps', 'Follow-ups today')} value={n(s?.followUpsDueToday)} hint={t('hero.leads.followUpsHint', 'Open and due by tonight')} loading={loading} />
      </Link>
      <div className="col-span-2 lg:col-span-1">
        <HeroStat icon={UserX} label={t('hero.leads.unassigned', 'Unassigned')} value={n(s?.unassigned)} hint={t('hero.leads.unassignedHint', '{count} without a phone number', { count: n(s?.withoutPhone) })} loading={loading} />
      </div>
    </>
  );
}
