'use client';

import '@/bones/registry';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ErrorBoundary } from '@/shared/components/error-boundary';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { PageBand, pageTabs } from '@/shared/components/page-hero';
import { CalendarDays, LayoutDashboard, Grid3X3, AlertTriangle, Video } from 'lucide-react';

const TABS = [
  { href: '/scheduling/calendar', labelKey: 'deploy.tabs.calendar', fallback: 'Kalender', icon: CalendarDays },
  { href: '/scheduling/meetings', labelKey: 'deploy.tabs.meetings', fallback: 'Meetings', icon: Video },
  { href: '/scheduling/dashboard', labelKey: 'deploy.tabs.dashboard', fallback: 'Dashboard', icon: LayoutDashboard },
  { href: '/scheduling/coarse', labelKey: 'deploy.tabs.coarse', fallback: 'Grobplanung', icon: Grid3X3 },
  { href: '/scheduling/conflicts', labelKey: 'deploy.tabs.conflicts', fallback: 'Konflikte', icon: AlertTriangle },
];

export default function SchedulingLayout({ children }) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const active = TABS.find(({ href }) => pathname === href || pathname?.startsWith(`${href}/`)) ?? TABS[0];

  return (
    <ErrorBoundary>
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="shrink-0 space-y-4 print:hidden">
          <PageBand
            id="scheduling-title"
            art="/hero/calendar"
            icon={CalendarDays}
            eyebrow={t('schedulingHero.eyebrow', 'Scheduling')}
            title={t(active.labelKey, active.fallback)}
            subtitle={t('schedulingHero.subtitle', 'Plan crews, meetings and field work — and catch conflicts before they happen.')}
          />
          <nav aria-label={t('schedulingHero.sections', 'Scheduling sections')} className={pageTabs.list}>
            {TABS.map(({ href, labelKey, fallback, icon: Icon }) => {
              const isActive = href === active.href;
              return (
                <Link key={href} href={href} aria-current={isActive ? 'page' : undefined} className={cn(pageTabs.tab, isActive && pageTabs.active)}>
                  <Icon aria-hidden="true" />
                  {t(labelKey, fallback)}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </ErrorBoundary>
  );
}
