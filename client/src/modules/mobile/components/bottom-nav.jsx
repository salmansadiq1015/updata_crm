'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  ClipboardList,
  MessageSquare,
  Timer,
  Bell,
  Settings,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { useMobileUIStore } from '../stores/mobile-ui-store';
import { cn } from '@/lib/utils';

const ICON_MAP = {
  ClipboardList,
  MessageSquare,
  Timer,
  Bell,
  Settings,
};

const NAV_ITEMS = [
  { key: 'orders', href: '/orders', icon: 'ClipboardList', labelKey: 'mobile.nav.orders', labelFallback: 'Aufträge' },
  { key: 'chat', href: '/chat', icon: 'MessageSquare', labelKey: 'mobile.nav.chat', labelFallback: 'Chat' },
  { key: 'timer', href: '/timer', icon: 'Timer', labelKey: 'mobile.nav.timer', labelFallback: 'Timer' },
  { key: 'notifications', href: '/m/notifications', icon: 'Bell', labelKey: 'mobile.nav.notifications', labelFallback: 'Meldungen' },
  { key: 'settings', href: '/settings', icon: 'Settings', labelKey: 'mobile.nav.settings', labelFallback: 'Einstellungen' },
];

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const isTimerRunning = useMobileUIStore((s) => s.isTimerRunning);
  const unreadCount = useMobileUIStore((s) => s.unreadCount);

  return (
    <nav
      className={cn(
        'fixed bottom-0 inset-x-0 z-50',
        'bg-background/95 backdrop-blur-md border-t border-border',
        'pb-[env(safe-area-inset-bottom)]'
      )}
    >
      <div className="flex items-center justify-around h-16">
        {NAV_ITEMS.map((item) => {
          const Icon = ICON_MAP[item.icon];
          const isActive = pathname?.startsWith(item.href);
          const showBadge =
            (item.key === 'notifications' && unreadCount > 0) ||
            (item.key === 'timer' && isTimerRunning);

          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5',
                'min-w-[64px] min-h-[44px] px-2 py-1',
                'transition-colors duration-150',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className="relative">
                <Icon
                  className={cn('h-5 w-5', isActive && 'stroke-[2.5]')}
                />
                {showBadge && (
                  <span
                    className={cn(
                      'absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1',
                      'rounded-full text-[10px] font-bold leading-4 text-center',
                      item.key === 'timer'
                        ? 'bg-green-500 text-white animate-pulse'
                        : 'bg-destructive text-destructive-foreground'
                    )}
                  >
                    {item.key === 'notifications' ? (unreadCount > 99 ? '99+' : unreadCount) : ''}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium leading-tight">
                {t(item.labelKey, item.labelFallback)}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
