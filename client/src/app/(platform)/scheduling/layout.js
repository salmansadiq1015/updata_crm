'use client';

import '@/bones/registry';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ErrorBoundary } from '@/shared/components/error-boundary';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
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

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-full">
        <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 print:hidden">
          <div className="flex items-center gap-1 px-4 h-10">
            {TABS.map(({ href, labelKey, fallback, icon: Icon }) => {
              const isActive = pathname === href || (href === '/scheduling/calendar' && pathname === '/scheduling');
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t(labelKey, fallback)}
                </Link>
              );
            })}
          </div>
        </nav>
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </div>
    </ErrorBoundary>
  );
}
