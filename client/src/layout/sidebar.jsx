'use client';

import { useEffect, useCallback, useState } from 'react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  LayoutDashboard, Users, FolderKanban, CalendarClock,
  FileText, Receipt, CheckSquare, Boxes, Settings,
  ChevronLeft, ChevronRight, ChevronDown, ShieldCheck, Sparkles, MonitorSmartphone, ScrollText, Activity,
  HeartPulse, Cog, Zap, LogOut, User, Wrench, Webhook,
  Contact, MapPinned, Flame, PanelLeftClose, PanelLeftOpen,
  BookOpen, ClipboardList, MessageSquare, Bell, Smartphone,
  FileCheck, Clock4, Files, LayoutTemplate,
  Type, TrendingUp, Ruler, RefreshCw,
  ShoppingCart,
} from 'lucide-react';
import { PERMISSIONS } from '@/shared/constants/permissions';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthStore } from '@/stores/auth-store';
import { useUnreadCount } from '@/modules/notifications/hooks/use-notification-feed';

// Nav model. A section item is either a leaf (link) or a group (parent w/ children).
const navSectionDefs = [
  {
    titleKey: 'sidebar.mainMenu',
    items: [
      { type: 'leaf', labelKey: 'sidebar.dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    titleKey: 'sidebar.business',
    items: [
      {
        type: 'group', key: 'crm', labelKey: 'sidebar.crm', icon: Contact,
        basePath: '/crm', permission: 'crm:read',
        children: [
          { type: 'leaf', labelKey: 'sidebar.customers', href: '/crm/customers', icon: Contact, permission: 'crm:read' },
          { type: 'leaf', labelKey: 'sidebar.contacts', href: '/crm/contacts', icon: Users, permission: 'crm:read' },
          { type: 'leaf', labelKey: 'sidebar.sites', href: '/crm/sites', icon: MapPinned, permission: 'crm:read' },
          { type: 'leaf', labelKey: 'sidebar.installations', href: '/crm/installations', icon: Flame, permission: 'crm:read' },
          { type: 'leaf', labelKey: 'sidebar.maintenance', href: '/crm/maintenance', icon: Wrench, permission: 'crm:read' },
          { type: 'leaf', labelKey: 'sidebar.procurement', href: '/crm/spare-parts/procurement', icon: ShoppingCart, permission: 'crm:read' },
          { type: 'leaf', labelKey: 'sidebar.addressBook', href: '/crm/address-book', icon: BookOpen, permission: 'crm:read' },
          { type: 'leaf', labelKey: 'sidebar.newsletters', href: '/crm/newsletters', icon: MessageSquare, permission: 'crm:read' },
        ],
      },
      {
        type: 'group', key: 'projects', labelKey: 'sidebar.projects', icon: FolderKanban,
        basePath: '/projects', permission: 'projects:read',
        children: [
          { type: 'leaf', labelKey: 'sidebar.projects', href: '/projects', icon: FolderKanban, permission: 'projects:read' },
        ],
      },
      { type: 'leaf', labelKey: 'sidebar.scheduling', href: '/scheduling', icon: CalendarClock, permission: 'scheduling:read' },
      {
        type: 'group', key: 'sales', labelKey: 'sidebar.sales', icon: FileText,
        basePath: '/quotes', permission: 'quotations:read',
        children: [
          { type: 'leaf', labelKey: 'sidebar.quotes', href: '/quotes', icon: FileText, permission: 'quotations:read' },
        ],
      },
      {
        type: 'group', key: 'finance', labelKey: 'sidebar.finance', icon: Receipt,
        basePath: '/accounting', permission: 'accounting:read',
        children: [
          { type: 'leaf', labelKey: 'sidebar.accounting', href: '/accounting', icon: Receipt, permission: 'accounting:read' },
        ],
      },
      {
        type: 'group', key: 'catalog', labelKey: 'sidebar.catalog', icon: Boxes,
        basePath: '/catalog', permission: PERMISSIONS.CATALOG_READ,
        children: [
          { type: 'leaf', labelKey: 'sidebar.catalog', href: '/catalog', icon: Boxes, permission: PERMISSIONS.CATALOG_READ },
          { type: 'leaf', labelKey: 'catalog.textBlocks.title', href: '/catalog/text-blocks', icon: Type, permission: PERMISSIONS.CATALOG_WRITE },
          { type: 'leaf', labelKey: 'catalog.prices.title', href: '/catalog/prices', icon: TrendingUp, permission: PERMISSIONS.CATALOG_PRICE },
          { type: 'leaf', labelKey: 'catalog.units.title', href: '/catalog/settings/units', icon: Ruler, permission: PERMISSIONS.CATALOG_ADMIN },
          { type: 'leaf', labelKey: 'catalog.igh.title', href: '/catalog/igh', icon: RefreshCw, permission: PERMISSIONS.CATALOG_ADMIN },
        ],
      },
      { type: 'leaf', labelKey: 'sidebar.documents', href: '/documents', icon: Files, permission: 'documents:read' },
      { type: 'leaf', labelKey: 'sidebar.tasks', href: '/tasks', icon: CheckSquare, permission: 'tasks:read' },
      { type: 'leaf', labelKey: 'sidebar.notifications', href: '/notifications', icon: Bell, permission: 'notifications:feed' },
      { type: 'leaf', labelKey: 'sidebar.ai', href: '/ai', icon: Sparkles },
    ],
  },
  {
    titleKey: 'sidebar.fieldOps',
    items: [
      { type: 'leaf', labelKey: 'sidebar.fieldOpsOrders', href: '/field-ops/orders', icon: ClipboardList, permission: 'mobile:read' },
      { type: 'leaf', labelKey: 'sidebar.fieldOpsReports', href: '/field-ops/reports', icon: FileCheck, permission: 'mobile:read' },
      { type: 'leaf', labelKey: 'sidebar.fieldOpsTime', href: '/field-ops/time', icon: Clock4, permission: 'mobile:read' },
      { type: 'leaf', labelKey: 'sidebar.fieldOpsChat', href: '/field-ops/chat', icon: MessageSquare, permission: 'mobile:read' },
      { type: 'leaf', labelKey: 'sidebar.fieldOpsNotifications', href: '/field-ops/notifications', icon: Bell, permission: 'mobile:read' },
    ],
  },
  {
    titleKey: 'sidebar.admin',
    items: [
      { type: 'leaf', labelKey: 'sidebar.users', href: '/settings/users', icon: Users, permission: 'users:read' },
      { type: 'leaf', labelKey: 'sidebar.roles', href: '/settings/roles', icon: ShieldCheck, permission: 'roles:read' },
      { type: 'leaf', labelKey: 'sidebar.sessions', href: '/settings/sessions', icon: MonitorSmartphone },
      { type: 'leaf', labelKey: 'sidebar.audit', href: '/settings/audit', icon: ScrollText, permission: 'audit:read' },
      { type: 'leaf', labelKey: 'sidebar.system', href: '/settings/system', icon: Activity, permission: 'settings:admin' },
      { type: 'leaf', labelKey: 'sidebar.health', href: '/admin/health', icon: HeartPulse, permission: 'system:read' },
      { type: 'leaf', labelKey: 'sidebar.jobs', href: '/admin/jobs', icon: Cog, permission: 'system:admin' },
      { type: 'leaf', labelKey: 'sidebar.templates', href: '/admin/templates', icon: LayoutTemplate, permission: 'settings:admin' },
      { type: 'leaf', labelKey: 'sidebar.widget', href: '/admin/integrations/widget/submissions', icon: Webhook, permission: 'integrations:widget:manage' },
      { type: 'leaf', labelKey: 'sidebar.settings', href: '/settings', icon: Settings, disabled: true, permission: 'settings:read' },
    ],
  },
];

// ── Nav helpers (pure) ──────────────────────────────────────

function isLeafVisible(leaf, hasPermission) {
  return !leaf.permission || hasPermission(leaf.permission);
}

function getVisibleChildren(group, hasPermission) {
  return group.children.filter((c) => isLeafVisible(c, hasPermission));
}

function isItemVisible(item, hasPermission) {
  if (item.type === 'group') return getVisibleChildren(item, hasPermission).length > 0;
  return isLeafVisible(item, hasPermission);
}

function isLeafActive(href, pathname) {
  return pathname === href || pathname.startsWith(href + '/');
}

function isGroupActive(group, pathname) {
  return pathname === group.basePath || pathname.startsWith(group.basePath + '/');
}

// ── Shared nav content (used by both desktop + mobile) ──────

function LeafLink({ leaf, collapsed, nested, onNavigate, unreadCount }) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const isActive = isLeafActive(leaf.href, pathname);
  const Icon = leaf.icon;
  const label = t(leaf.labelKey);

  const linkEl = (
    <Link
      href={leaf.disabled ? '#' : leaf.href}
      onClick={leaf.disabled ? undefined : onNavigate}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200',
        isActive
          ? 'bg-white/[0.08] text-white sidebar-active-glow'
          : 'text-white/45 hover:bg-white/[0.05] hover:text-white/80',
        leaf.disabled && 'opacity-20 pointer-events-none',
        collapsed && 'justify-center px-0 py-2.5',
        nested && !collapsed && 'pl-9 py-1.5'
      )}
    >
      {isActive && !nested && (
        <motion.div
          layoutId="sidebar-active-pill"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-primary-gradient shadow-[0_0_8px_oklch(0.65_0.22_292_/_50%)]"
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        />
      )}
      <span className="relative shrink-0">
        <Icon className={cn(
          'h-[18px] w-[18px] transition-all duration-200',
          isActive ? 'text-[oklch(0.75_0.18_292)]' : 'text-white/30 group-hover:text-white/55',
          nested && 'h-[15px] w-[15px]'
        )} />
        {leaf.href === '/notifications' && unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </span>
      <AnimatePresence mode="wait" initial={false}>
        {!collapsed && (
          <motion.span
            key="nav-label"
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
      {!collapsed && leaf.disabled && (
        <span className="ml-auto text-[8px] rounded-full bg-white/[0.06] px-1.5 py-0.5 text-white/15 uppercase tracking-widest font-bold">
          {t('common.soon', 'Soon')}
        </span>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={12} className="bg-[#1a1f2e] text-white border-white/10 text-xs font-medium px-3 py-1.5 shadow-lg">
          {label}
        </TooltipContent>
      </Tooltip>
    );
  }
  return linkEl;
}

function SidebarGroup({ group, collapsed, onNavigate, unreadCount }) {
  const pathname = usePathname();
  const { hasPermission } = usePermissions();
  const { t } = useLanguage();
  const { expandedGroups, toggleGroup } = useSidebarStore();

  const children = getVisibleChildren(group, hasPermission);
  const groupActive = isGroupActive(group, pathname);
  const expanded = groupActive || expandedGroups.includes(group.key);
  const Icon = group.icon;
  const label = t(group.labelKey);

  if (collapsed) {
    return (
      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  'group relative flex w-full items-center justify-center rounded-xl py-2.5 transition-all duration-200',
                  groupActive ? 'bg-white/[0.08] text-white sidebar-active-glow' : 'text-white/45 hover:bg-white/[0.05]'
                )}
              >
                <Icon className={cn('h-[18px] w-[18px]', groupActive ? 'text-[oklch(0.75_0.18_292)]' : 'text-white/30 group-hover:text-white/55')} />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={12} className="bg-[#1a1f2e] text-white border-white/10 text-xs font-medium px-3 py-1.5 shadow-lg">
            {label}
          </TooltipContent>
        </Tooltip>
        <PopoverContent side="right" sideOffset={12} align="start" className="w-52 p-1.5 bg-[#1a1f2e] border-white/10">
          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/30">{label}</p>
          <div className="space-y-0.5">
            {children.map((leaf) => (
              <LeafLink key={leaf.href} leaf={leaf} collapsed={false} nested={false} onNavigate={onNavigate} unreadCount={unreadCount} />
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`sidebar-group-${group.key}`}
        onClick={() => toggleGroup(group.key)}
        className={cn(
          'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold transition-all duration-200',
          groupActive ? 'text-white' : 'text-white/55 hover:bg-white/[0.05] hover:text-white/80'
        )}
      >
        <Icon className={cn('h-[18px] w-[18px] shrink-0', groupActive ? 'text-[oklch(0.75_0.18_292)]' : 'text-white/35 group-hover:text-white/60')} />
        <span className="truncate whitespace-nowrap flex-1 text-left">{label}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-white/30 transition-transform duration-200', expanded && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="group-children"
            id={`sidebar-group-${group.key}`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-0.5 space-y-0.5 border-l border-white/[0.06] ml-[19px]">
              {children.map((leaf) => (
                <LeafLink key={leaf.href} leaf={leaf} collapsed={false} nested onNavigate={onNavigate} unreadCount={unreadCount} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarNav({ collapsed, onNavigate }) {
  const { hasPermission } = usePermissions();
  const { t } = useLanguage();
  const notificationUnread = useUnreadCount();

  return (
    <LayoutGroup id={collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}>
      <nav className="space-y-1 px-2">
        {navSectionDefs.map((section, sIdx) => {
          const visibleItems = section.items.filter((item) => isItemVisible(item, hasPermission));
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.titleKey} className={cn(sIdx > 0 && 'pt-4')}>
              {!collapsed && (
                <div className="flex items-center gap-2.5 px-3 mb-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/20 select-none whitespace-nowrap">
                    {t(section.titleKey)}
                  </p>
                  <div className="flex-1 h-px bg-gradient-to-r from-white/[0.06] to-transparent" />
                </div>
              )}
              {collapsed && sIdx > 0 && <div className="mx-3 mb-2 h-px bg-white/[0.06]" />}

              <div className="space-y-0.5">
                {visibleItems.map((item) => {
                  if (item.type === 'group') {
                    const visibleKids = getVisibleChildren(item, hasPermission);
                    if (visibleKids.length === 1) {
                      return (
                        <LeafLink key={item.key} leaf={visibleKids[0]} collapsed={collapsed} nested={false} onNavigate={onNavigate} unreadCount={notificationUnread} />
                      );
                    }
                    return (
                      <SidebarGroup key={item.key} group={item} collapsed={collapsed} onNavigate={onNavigate} unreadCount={notificationUnread} />
                    );
                  }
                  return (
                    <LeafLink key={item.href} leaf={item} collapsed={collapsed} nested={false} onNavigate={onNavigate} unreadCount={notificationUnread} />
                  );
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
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Use default (expanded) until after hydration to prevent persisted-store mismatch
  const collapsed = mounted ? isCollapsed : false;

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        animate={{ width: collapsed ? 68 : 260 }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative flex flex-col h-screen overflow-hidden bg-sidebar text-sidebar-foreground border-r border-sidebar-border sidebar-inner-glow"
      >
        {/* Ambient gradient */}
        <div className="pointer-events-none absolute inset-0 sidebar-ambient" />

        <SidebarLogo collapsed={collapsed} />

        {/* Scrollable nav */}
        <div className="relative flex-1 overflow-y-auto overflow-x-hidden py-3 scrollbar-thin scrollbar-dark">
          <SidebarNav collapsed={collapsed} />
        </div>

        {/* Bottom section */}
        <div className="relative p-2.5 space-y-2 border-t border-white/[0.04]">
          <SidebarUserCard collapsed={collapsed} />

          {/* Collapse toggle */}
          <button
            onClick={toggleCollapsed}
            className={cn(
              'flex items-center justify-center w-full rounded-lg py-1.5 transition-all duration-200',
              'text-white/20 hover:text-white/50 hover:bg-white/[0.04]'
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <div className="flex items-center gap-2">
                <PanelLeftClose className="h-4 w-4" />
                <span className="text-[11px] font-medium">{t('sidebar.collapse', 'Collapse')}</span>
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
