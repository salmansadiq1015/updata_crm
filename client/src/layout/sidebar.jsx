'use client';

import { useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useSidebarStore } from '@/stores/sidebar-store';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useAuth } from '@/shared/hooks/use-auth';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  LayoutDashboard, Users, FolderKanban, CalendarClock,
  FileText, Receipt, CheckSquare, Boxes, Settings,
  ChevronLeft, ChevronRight, ShieldCheck, Sparkles, MonitorSmartphone, ScrollText, Activity,
  HeartPulse, Cog, Zap, LogOut, User, Wrench, Webhook,
  Contact, MapPinned, Flame, PanelLeftClose, PanelLeftOpen,
  BookOpen, ClipboardList, MessageSquare, Bell, Smartphone,
  FileCheck, Clock4,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/stores/auth-store';

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
      { labelKey: 'sidebar.crm', href: '/crm/customers', icon: Contact, permission: 'crm:read' },
      { labelKey: 'sidebar.sites', href: '/crm/sites', icon: MapPinned, permission: 'crm:read' },
      { labelKey: 'sidebar.installations', href: '/crm/installations', icon: Flame, permission: 'crm:read' },
      { labelKey: 'sidebar.maintenance', href: '/crm/maintenance', icon: Wrench, permission: 'crm:read' },
      { labelKey: 'sidebar.addressBook', href: '/crm/address-book', icon: BookOpen, permission: 'crm:read' },
      { labelKey: 'sidebar.projects', href: '/projects', icon: FolderKanban, permission: 'projects:read' },
      { labelKey: 'sidebar.scheduling', href: '/scheduling', icon: CalendarClock, permission: 'scheduling:read' },
      { labelKey: 'sidebar.quotes', href: '/quotes', icon: FileText, disabled: true, permission: 'quotations:read' },
      { labelKey: 'sidebar.accounting', href: '/accounting', icon: Receipt, disabled: true, permission: 'accounting:read' },
      { labelKey: 'sidebar.tasks', href: '/tasks', icon: CheckSquare, permission: 'tasks:read' },
      { labelKey: 'sidebar.catalog', href: '/catalog', icon: Boxes, permission: 'catalog:read' },
      { labelKey: 'sidebar.notifications', href: '/notifications', icon: Bell, permission: 'notifications:feed' },
      { labelKey: 'sidebar.ai', href: '/ai', icon: Sparkles },
    ],
  },
  {
    titleKey: 'sidebar.fieldOps',
    items: [
      { labelKey: 'sidebar.fieldOpsOrders',        href: '/field-ops/orders',        icon: ClipboardList,  permission: 'mobile:read' },
      { labelKey: 'sidebar.fieldOpsReports',       href: '/field-ops/reports',       icon: FileCheck,      permission: 'mobile:read' },
      { labelKey: 'sidebar.fieldOpsTime',          href: '/field-ops/time',          icon: Clock4,         permission: 'mobile:read' },
      { labelKey: 'sidebar.fieldOpsChat',          href: '/field-ops/chat',          icon: MessageSquare,  permission: 'mobile:read' },
      { labelKey: 'sidebar.fieldOpsNotifications', href: '/field-ops/notifications', icon: Bell,           permission: 'mobile:read' },
    ],
  },
  {
    titleKey: 'sidebar.admin',
    items: [
      { labelKey: 'sidebar.users', href: '/settings/users', icon: Users, permission: 'users:read' },
      { labelKey: 'sidebar.roles', href: '/settings/roles', icon: ShieldCheck, permission: 'roles:read' },
      { labelKey: 'sidebar.sessions', href: '/settings/sessions', icon: MonitorSmartphone },
      { labelKey: 'sidebar.audit', href: '/settings/audit', icon: ScrollText, permission: 'audit:read' },
      { labelKey: 'sidebar.system', href: '/settings/system', icon: Activity, permission: 'settings:admin' },
      { labelKey: 'sidebar.health', href: '/admin/health', icon: HeartPulse, permission: 'system:read' },
      { labelKey: 'sidebar.jobs', href: '/admin/jobs', icon: Cog, permission: 'system:admin' },
      { labelKey: 'sidebar.widget', href: '/admin/integrations/widget/submissions', icon: Webhook, permission: 'integrations:widget:manage' },
      { labelKey: 'sidebar.settings', href: '/settings', icon: Settings, disabled: true, permission: 'settings:read' },
    ],
  },
];

// ── Shared nav content (used by both desktop + mobile) ──────

function SidebarNav({ collapsed, onNavigate }) {
  const pathname = usePathname();
  const { hasPermission } = usePermissions();
  const { t } = useLanguage();

  return (
    <LayoutGroup id={collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}>
      <nav className="space-y-1 px-2">
        {navSectionDefs.map((section, sIdx) => {
          const visibleItems = section.items.filter(
            (item) => !item.permission || hasPermission(item.permission)
          );
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.titleKey} className={cn(sIdx > 0 && 'pt-4')}>
              {/* Section header */}
              {!collapsed && (
                <div className="flex items-center gap-2.5 px-3 mb-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/20 select-none whitespace-nowrap">
                    {t(section.titleKey)}
                  </p>
                  <div className="flex-1 h-px bg-gradient-to-r from-white/[0.06] to-transparent" />
                </div>
              )}
              {collapsed && sIdx > 0 && (
                <div className="mx-3 mb-2 h-px bg-white/[0.06]" />
              )}

              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  const Icon = item.icon;
                  const label = t(item.labelKey);

                  const linkEl = (
                    <Link
                      href={item.disabled ? '#' : item.href}
                      onClick={item.disabled ? undefined : onNavigate}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200',
                        isActive
                          ? 'bg-white/[0.08] text-white sidebar-active-glow'
                          : 'text-white/45 hover:bg-white/[0.05] hover:text-white/80',
                        item.disabled && 'opacity-20 pointer-events-none',
                        collapsed && 'justify-center px-0 py-2.5'
                      )}
                    >
                      {/* Active pill */}
                      {isActive && (
                        <motion.div
                          layoutId="sidebar-active-pill"
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-primary-gradient shadow-[0_0_8px_oklch(0.65_0.22_292_/_50%)]"
                          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                        />
                      )}

                      <Icon className={cn(
                        'h-[18px] w-[18px] shrink-0 transition-all duration-200',
                        isActive
                          ? 'text-[oklch(0.75_0.18_292)]'
                          : 'text-white/30 group-hover:text-white/55'
                      )} />

                      <AnimatePresence mode="wait">
                        {!collapsed && (
                          <motion.span
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: 'auto' }}
                            exit={{ opacity: 0, width: 0 }}
                            transition={{ duration: 0.15, ease: 'easeOut' }}
                            className="truncate whitespace-nowrap"
                          >
                            {label}
                          </motion.span>
                        )}
                      </AnimatePresence>

                      {!collapsed && item.disabled && (
                        <span className="ml-auto text-[8px] rounded-full bg-white/[0.06] px-1.5 py-0.5 text-white/15 uppercase tracking-widest font-bold">
                          Soon
                        </span>
                      )}
                    </Link>
                  );

                  if (collapsed) {
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
                        <TooltipContent
                          side="right"
                          sideOffset={12}
                          className="bg-[#1a1f2e] text-white border-white/10 text-xs font-medium px-3 py-1.5 shadow-lg"
                        >
                          {label}
                        </TooltipContent>
                      </Tooltip>
                    );
                  }

                  return <div key={item.href}>{linkEl}</div>;
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}

// ── Logo ────────────────────────────────────────────────────

function SidebarLogo({ collapsed }) {
  return (
    <div className={cn(
      'relative flex items-center h-14 px-4 border-b border-white/[0.06]',
      collapsed && 'justify-center px-0'
    )}>
      {collapsed ? (
        <div className="h-9 w-9 rounded-xl bg-primary-gradient flex items-center justify-center shadow-[0_0_20px_oklch(0.65_0.22_292_/_35%)] transition-shadow hover:shadow-[0_0_28px_oklch(0.65_0.22_292_/_50%)]">
          <Zap className="h-4.5 w-4.5 text-white" />
        </div>
      ) : (
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="h-9 w-9 rounded-xl bg-primary-gradient flex items-center justify-center shadow-[0_0_20px_oklch(0.65_0.22_292_/_35%)] transition-shadow group-hover:shadow-[0_0_28px_oklch(0.65_0.22_292_/_50%)]">
            <Zap className="h-4.5 w-4.5 text-white" />
          </div>
          <div className="min-w-0">
            <span className="font-bold text-[15px] tracking-tight text-white/90 block leading-tight">
              MB Boiler
            </span>
            <span className="text-[10px] font-semibold tracking-[0.15em] uppercase text-[oklch(0.65_0.22_292)] leading-none">
              ERP System
            </span>
          </div>
        </Link>
      )}
    </div>
  );
}

// ── User card ───────────────────────────────────────────────

function SidebarUserCard({ collapsed }) {
  const { user } = useAuth();
  const logout = useAuthStore((s) => s.logout);
  const { t } = useLanguage();

  const initials = `${(user?.firstName || '')[0] || ''}${(user?.lastName || '')[0] || ''}`.toUpperCase();
  const roleName = typeof user?.role === 'object' ? user.role.name : user?.role;

  const cardContent = (
    <button className={cn(
      'flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm transition-all duration-200',
      'bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-white/[0.10]',
      collapsed && 'justify-center px-0 py-2.5'
    )}>
      <Avatar className="h-8 w-8 ring-2 ring-[oklch(0.65_0.22_292_/_25%)] shadow-[0_0_12px_oklch(0.65_0.22_292_/_15%)]">
        <AvatarFallback className="text-[11px] font-bold bg-primary-gradient text-white">
          {initials}
        </AvatarFallback>
      </Avatar>
      {!collapsed && (
        <div className="text-left min-w-0 flex-1">
          <p className="text-[13px] font-semibold truncate text-white/85 leading-tight">
            {user?.firstName} {user?.lastName}
          </p>
          <p className="text-[11px] truncate text-white/30 leading-tight mt-0.5">
            {roleName || user?.email}
          </p>
        </div>
      )}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>{cardContent}</DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/profile" className="gap-2"><User className="h-3.5 w-3.5" />{t('userMenu.profile', 'Profile')}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/system" className="gap-2"><Settings className="h-3.5 w-3.5" />{t('userMenu.settings', 'Settings')}</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="gap-2 text-destructive focus:text-destructive">
                <LogOut className="h-3.5 w-3.5" />{t('userMenu.logout', 'Logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={12} className="bg-[#1a1f2e] text-white border-white/10 text-xs font-medium">
          {user?.firstName} {user?.lastName}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{cardContent}</DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-48">
        <DropdownMenuItem asChild>
          <Link href="/profile" className="gap-2"><User className="h-3.5 w-3.5" />{t('userMenu.profile', 'Profile')}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/system" className="gap-2"><Settings className="h-3.5 w-3.5" />{t('userMenu.settings', 'Settings')}</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="gap-2 text-destructive focus:text-destructive">
          <LogOut className="h-3.5 w-3.5" />{t('userMenu.logout', 'Logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Desktop sidebar ─────────────────────────────────────────

export function Sidebar() {
  const { isCollapsed, toggleCollapsed } = useSidebarStore();

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        animate={{ width: isCollapsed ? 68 : 260 }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative flex flex-col h-screen overflow-hidden bg-sidebar text-sidebar-foreground border-r border-sidebar-border sidebar-inner-glow"
      >
        {/* Ambient gradient */}
        <div className="pointer-events-none absolute inset-0 sidebar-ambient" />

        <SidebarLogo collapsed={isCollapsed} />

        {/* Scrollable nav */}
        <div className="relative flex-1 overflow-y-auto overflow-x-hidden py-3 scrollbar-thin scrollbar-dark">
          <SidebarNav collapsed={isCollapsed} />
        </div>

        {/* Bottom section */}
        <div className="relative p-2.5 space-y-2 border-t border-white/[0.04]">
          <SidebarUserCard collapsed={isCollapsed} />

          {/* Collapse toggle */}
          <button
            onClick={toggleCollapsed}
            className={cn(
              'flex items-center justify-center w-full rounded-lg py-1.5 transition-all duration-200',
              'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'
            )}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <div className="flex items-center gap-2">
                <PanelLeftClose className="h-4 w-4" />
                <span className="text-[11px] font-medium">Collapse</span>
              </div>
            )}
          </button>
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}

// ── Mobile sidebar (Sheet overlay) ──────────────────────────

export function MobileSidebar() {
  const { isMobileOpen, setMobileOpen } = useSidebarStore();
  const pathname = usePathname();

  // Auto-close on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  return (
    <Sheet open={isMobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-[280px] p-0 bg-sidebar border-r-0 text-sidebar-foreground gap-0 sidebar-inner-glow"
      >
        {/* Ambient gradient */}
        <div className="pointer-events-none absolute inset-0 sidebar-ambient" />

        <SidebarLogo collapsed={false} />

        <div className="relative flex-1 overflow-y-auto overflow-x-hidden py-3 scrollbar-thin scrollbar-dark">
          <TooltipProvider delayDuration={0}>
            <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
          </TooltipProvider>
        </div>

        <div className="relative p-2.5 border-t border-white/[0.04]">
          <TooltipProvider delayDuration={0}>
            <SidebarUserCard collapsed={false} />
          </TooltipProvider>
        </div>
      </SheetContent>
    </Sheet>
  );
}
