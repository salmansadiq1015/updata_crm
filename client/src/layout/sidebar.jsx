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
  HeartPulse, Cog, Hash, BellRing, Zap, LogOut, User, Wrench, Webhook,
  Contact, MapPinned, Flame, PanelLeftClose, PanelLeftOpen,
  BookOpen, ClipboardList, MessageSquare, Bell, Smartphone,
  FileCheck, Clock4, Files, LayoutTemplate,
  Type, TrendingUp, Ruler, RefreshCw, CalendarDays, Grid3X3, AlertTriangle,
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
      { type: 'leaf', labelKey: 'sidebar.projects', href: '/projects', icon: FolderKanban, permission: 'projects:read' },
      {
        type: 'group', key: 'scheduling', labelKey: 'sidebar.scheduling', icon: CalendarClock,
        basePath: '/scheduling', permission: 'scheduling:read',
        children: [
          { type: 'leaf', labelKey: 'deploy.tabs.calendar', href: '/scheduling/calendar', icon: CalendarDays, permission: 'scheduling:read' },
          { type: 'leaf', labelKey: 'deploy.tabs.dashboard', href: '/scheduling/dashboard', icon: LayoutDashboard, permission: 'scheduling:read' },
          { type: 'leaf', labelKey: 'deploy.tabs.coarse', href: '/scheduling/coarse', icon: Grid3X3, permission: 'scheduling:read' },
          { type: 'leaf', labelKey: 'deploy.tabs.conflicts', href: '/scheduling/conflicts', icon: AlertTriangle, permission: 'scheduling:read' },
        ],
      },
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
      { type: 'leaf', labelKey: 'sidebar.numbering', href: '/admin/numbering', icon: Hash, permission: 'quotations:admin' },
      { type: 'leaf', labelKey: 'sidebar.reminders', href: '/admin/reminders', icon: BellRing, permission: 'quotations:admin' },
      {
        type: 'group', key: 'ai-admin', labelKey: 'sidebar.aiAdmin', icon: Sparkles,
        basePath: '/admin/ai', permission: 'ai:analytics:read',
        children: [
          { type: 'leaf', labelKey: 'sidebar.aiMain', href: '/ai', icon: MessageSquare },
          { type: 'leaf', labelKey: 'sidebar.aiOverview', href: '/admin/ai', icon: Sparkles, permission: 'ai:analytics:read' },
          { type: 'leaf', labelKey: 'sidebar.aiAnalytics', href: '/admin/ai/analytics', icon: Activity, permission: 'ai:analytics:read' },
          { type: 'leaf', labelKey: 'sidebar.aiVocabulary', href: '/admin/ai/vocabulary', icon: BookOpen, permission: 'ai:vocabulary:manage' },
          { type: 'leaf', labelKey: 'sidebar.aiCommands', href: '/admin/ai/commands', icon: MonitorSmartphone, permission: 'ai:commands:manage' },
        ],
      },
      { type: 'leaf', labelKey: 'sidebar.templates', href: '/admin/templates', icon: LayoutTemplate, permission: 'templates:read' },
      { type: 'leaf', labelKey: 'sidebar.migration', href: '/admin/migration', icon: RefreshCw, permission: 'settings:admin' },
      { type: 'leaf', labelKey: 'sidebar.integrations', href: '/admin/integrations', icon: Zap, permission: 'integrations:admin' },
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
          ? 'bg-gradient-to-r from-[oklch(0.65_0.25_292_/_15%)] to-transparent text-white sidebar-active-glow'
          : 'text-white/35 hover:bg-white/[0.05] hover:text-white/65',
        leaf.disabled && 'opacity-20 pointer-events-none',
        collapsed && 'justify-center px-0 py-2.5',
        nested && !collapsed && 'pl-[28px] py-[7px]'
      )}
    >
      {isActive && !nested && (
        <motion.div
          layoutId="sidebar-active-pill"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-[oklch(0.75_0.25_292)] shadow-[0_0_8px_oklch(0.65_0.25_292/70%)]"
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        />
      )}
      {isActive && nested && (
        <span className="w-1.5 h-1.5 rounded-full bg-[oklch(0.75_0.25_292)] mr-1 shrink-0" />
      )}
      <span className="relative shrink-0">
        <Icon className={cn(
          'h-[18px] w-[18px] transition-all duration-200',
          isActive ? 'text-[oklch(0.78_0.22_292)]' : 'text-white/30 group-hover:text-white/55',
          nested && 'h-[14px] w-[14px]'
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
        <PopoverContent side="right" sideOffset={12} align="start" className="w-52 p-2 bg-[#0D1117] border border-white/[0.08] rounded-xl shadow-2xl">
          <p className="px-2 py-1 text-[10px] text-violet-400 uppercase tracking-wider font-semibold">{label}</p>
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
          'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200',
          groupActive ? 'text-white' : 'text-white/50 hover:bg-white/[0.05] hover:text-white/80'
        )}
      >
        <Icon className={cn('h-[18px] w-[18px] shrink-0', groupActive ? 'text-[oklch(0.75_0.22_292)]' : 'text-white/30 group-hover:text-white/55')} />
        <span className={cn('truncate whitespace-nowrap flex-1 text-left', groupActive ? 'text-white/85' : 'text-white/50')}>{label}</span>
        {groupActive && (
          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[oklch(0.75_0.25_292)] shadow-[0_0_6px_oklch(0.65_0.25_292)]" />
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-white/20 transition-transform duration-200 group-hover:text-white/40', expanded && 'rotate-180')} />
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
            <div className="mt-0.5 space-y-0.5 border-l border-[oklch(0.65_0.25_292_/_22%)] ml-[22px]">
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
                  <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-white/20 select-none whitespace-nowrap">
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
      'relative flex items-center h-15 px-4 border-b border-white/6 bg-linear-to-b from-white/2 to-transparent',
      collapsed && 'justify-center px-0'
    )}>
      {collapsed ? (
        <div className="h-10 w-10 rounded-xl bg-linear-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-[0_0_24px_oklch(0.65_0.25_292/40%)]">
          <Zap className="h-5 w-5 text-white" />
        </div>
      ) : (
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="h-10 w-10 rounded-xl bg-linear-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-[0_0_24px_oklch(0.65_0.25_292/40%)]">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <span className="text-[15px] font-bold tracking-tight text-white/90 block leading-tight">
              MB Boiler
            </span>
            <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[oklch(0.7_0.25_292)] leading-none">
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
      'flex items-center gap-3 w-full rounded-xl px-3 py-2.5 transition-all duration-200',
      'bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.10]',
      collapsed && 'justify-center px-0 py-2.5'
    )}>
      <Avatar className="h-8 w-8 ring-2 ring-[oklch(0.65_0.25_292/35%)] shadow-[0_0_16px_oklch(0.65_0.25_292/20%)]">
        <AvatarFallback className="text-[11px] font-bold bg-primary-gradient text-white">
          {initials}
        </AvatarFallback>
      </Avatar>
      {!collapsed && (
        <div className="text-left min-w-0 flex-1">
          <p className="text-[13px] font-semibold truncate text-white/85 leading-tight">
            {user?.firstName} {user?.lastName}
          </p>
          <span className="text-[10px] font-medium bg-violet-500/10 text-violet-400 px-2 py-0.5 rounded-full">
            {roleName || user?.email}
          </span>
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
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  // Use default (expanded) until after hydration to prevent persisted-store mismatch
  const collapsed = mounted ? isCollapsed : false;

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        animate={{ width: collapsed ? 68 : 256 }}
        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
        className="relative flex flex-col h-screen overflow-hidden bg-sidebar text-sidebar-foreground border-r border-[rgba(255,255,255,0.04)] sidebar-inner-glow"
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
          <div className="py-1 mt-1">
            <button
              onClick={toggleCollapsed}
              className={cn(
                'flex items-center justify-center w-full rounded-lg py-1.5 transition-all duration-200',
                'text-[11px] text-white/25 hover:text-white/55 hover:bg-white/[0.04]'
              )}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <div className="flex items-center gap-2">
                  <PanelLeftClose className="h-4 w-4" />
                  <span>{t('sidebar.collapse', 'Einklappen')}</span>
                </div>
              )}
            </button>
          </div>
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
