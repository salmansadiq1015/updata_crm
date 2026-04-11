'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebarStore } from '@/stores/sidebar-store';
import { usePermissions } from '@/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  LayoutDashboard, Users, Building2, FolderKanban, Calendar,
  FileText, Receipt, ClipboardList, Package, Settings,
  ChevronLeft, ChevronRight, Shield, Bot, Monitor, ScrollText, Activity,
} from 'lucide-react';

const navSectionDefs = [
  {
    titleKey: 'sidebar.mainMenu',
    items: [
      { labelKey: 'sidebar.dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    titleKey: 'sidebar.business',
    items: [
      { labelKey: 'sidebar.crm', href: '/crm', icon: Building2, disabled: true, permission: 'crm:read' },
      { labelKey: 'sidebar.projects', href: '/projects', icon: FolderKanban, disabled: true, permission: 'projects:read' },
      { labelKey: 'sidebar.scheduling', href: '/scheduling', icon: Calendar, disabled: true, permission: 'scheduling:read' },
      { labelKey: 'sidebar.quotes', href: '/quotes', icon: FileText, disabled: true, permission: 'quotations:read' },
      { labelKey: 'sidebar.accounting', href: '/accounting', icon: Receipt, disabled: true, permission: 'accounting:read' },
      { labelKey: 'sidebar.tasks', href: '/tasks', icon: ClipboardList, disabled: true },
      { labelKey: 'sidebar.catalog', href: '/catalog', icon: Package, disabled: true },
      { labelKey: 'sidebar.ai', href: '/ai', icon: Bot, disabled: true },
    ],
  },
  {
    titleKey: 'sidebar.admin',
    items: [
      { labelKey: 'sidebar.users', href: '/settings/users', icon: Users, permission: 'users:read' },
      { labelKey: 'sidebar.roles', href: '/settings/roles', icon: Shield, permission: 'roles:read' },
      { labelKey: 'sidebar.sessions', href: '/settings/sessions', icon: Monitor },
      { labelKey: 'sidebar.audit', href: '/settings/audit', icon: ScrollText, permission: 'audit:read' },
      { labelKey: 'sidebar.system', href: '/settings/system', icon: Activity, permission: 'settings:admin' },
      { labelKey: 'sidebar.settings', href: '/settings', icon: Settings, disabled: true, permission: 'settings:read' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleCollapsed } = useSidebarStore();
  const { hasPermission } = usePermissions();
  const { t } = useLanguage();

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          'relative flex flex-col border-r bg-card transition-all duration-300',
          isCollapsed ? 'w-16' : 'w-64'
        )}
      >
        {/* Logo */}
        <div className={cn('flex items-center border-b h-14 px-4', isCollapsed && 'justify-center px-2')}>
          {isCollapsed ? (
            <span className="font-bold text-primary text-lg">MB</span>
          ) : (
            <span className="font-bold text-lg">MB Boiler <span className="text-primary">ERP</span></span>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-2">
          <nav className="space-y-4 px-2">
            {navSectionDefs.map((section) => (
              <div key={section.titleKey}>
                {!isCollapsed && (
                  <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t(section.titleKey)}
                  </p>
                )}
                <div className="space-y-0.5">
                  {section.items
                    .filter((item) => !item.permission || hasPermission(item.permission))
                    .map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                    const Icon = item.icon;
                    const label = t(item.labelKey);

                    const linkContent = (
                      <Link
                        href={item.disabled ? '#' : item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                          isActive
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                          item.disabled && 'opacity-40 pointer-events-none',
                          isCollapsed && 'justify-center px-2'
                        )}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        {!isCollapsed && <span>{label}</span>}
                        {!isCollapsed && item.disabled && (
                          <span className="ml-auto text-[10px] text-muted-foreground">{t('sidebar.comingSoon')}</span>
                        )}
                      </Link>
                    );

                    if (isCollapsed) {
                      return (
                        <Tooltip key={item.href}>
                          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                          <TooltipContent side="right">
                            <p>{label}</p>
                          </TooltipContent>
                        </Tooltip>
                      );
                    }

                    return <div key={item.href}>{linkContent}</div>;
                  })}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* Collapse toggle */}
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            onClick={toggleCollapsed}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
