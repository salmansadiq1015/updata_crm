'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useSidebarStore } from '@/stores/sidebar-store';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useAuth } from '@/shared/hooks/use-auth';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { VersionBadge } from './version-badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import {
  ChevronDown,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  User,
} from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { authService } from '@/modules/auth/services/auth-service';
import { useUnreadCount } from '@/modules/notifications/hooks/use-notification-feed';
import { SmsRecoveryNavBadge } from '@/modules/smsOps/ui/sms-recovery-nav-badge';
import { useUiConfig, applySidebarConfig } from '@/shared/hooks/use-ui-config';
import { UiPreviewBanner } from '@/shared/components/ui-preview-banner';
import { isNavigationLeafActive, navSectionDefs } from './navigation';
import { useSidebarVisibility, filterSidebarMenus } from '@/modules/settings/hooks/use-sidebar-visibility';
import { APP_LOGOS, APP_NAME, APP_PRODUCT_NAME } from '@/shared/constants/application';

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

function isGroupActive(group, pathname) {
  return pathname === group.basePath || pathname.startsWith(group.basePath + '/');
}

// ── Shared nav content (used by both desktop + mobile) ──────

function LeafLink({ leaf, collapsed, nested, onNavigate, unreadCount }) {
  const pathname = usePathname();
  const { t, isRTL } = useLanguage();
  const isActive = isNavigationLeafActive(leaf.href, pathname);
  const Icon = leaf.icon;
  const label = t(leaf.labelKey);

  const ref = useRef(null);
  useEffect(() => {
    if (isActive && ref.current) ref.current.scrollIntoView({ block: 'nearest' });
  }, [isActive]);

  const linkEl = (
    <Link
      ref={ref}
      aria-current={isActive ? 'page' : undefined}
      href={leaf.disabled ? '#' : leaf.href}
      onClick={leaf.disabled ? undefined : onNavigate}
      className={cn(
        'group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all duration-200',
        isActive
          ? 'bg-sidebar-primary/10 text-sidebar-primary'
          : 'text-sidebar-foreground/70 hover:bg-sidebar-foreground/[0.05] hover:text-sidebar-foreground/65',
        leaf.disabled && 'opacity-20 pointer-events-none',
        collapsed && 'justify-center px-0 py-2.5',
        nested && !collapsed && 'ps-[26px] py-1.5'
      )}
    >
      {isActive && !nested && (
        <motion.div
          layoutId="sidebar-active-pill"
          className="absolute start-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-sidebar-primary shadow-[0_0_8px_color-mix(in_oklab,var(--sidebar-primary)_70%,transparent)]"
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        />
      )}
      {isActive && nested && (
        <span className="w-1.5 h-1.5 rounded-full bg-sidebar-primary shadow-[0_0_6px_color-mix(in_oklab,var(--sidebar-primary)_60%,transparent)] me-1 shrink-0" />
      )}
      <span className="relative shrink-0">
        <Icon className={cn(
          'h-[18px] w-[18px] transition-all duration-200',
          isActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground/55',
          nested && 'h-[14px] w-[14px]'
        )} />
        {leaf.href === '/sms-ops' && <SmsRecoveryNavBadge />}
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
        <span className="ms-auto text-[8px] rounded-full bg-sidebar-foreground/[0.06] px-1.5 py-0.5 text-sidebar-foreground/15 uppercase tracking-widest font-bold">
          {t('common.soon', 'Soon')}
        </span>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkEl}</TooltipTrigger>
        <TooltipContent side={isRTL ? 'left' : 'right'} sideOffset={12} className="bg-popover text-popover-foreground border-border text-xs font-medium px-3 py-1.5 shadow-lg">
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
  const { t, isRTL } = useLanguage();
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
                  groupActive ? 'bg-sidebar-foreground/[0.08] text-sidebar-foreground sidebar-active-glow' : 'text-sidebar-foreground/45 hover:bg-sidebar-foreground/[0.05]'
                )}
              >
                <Icon className={cn('h-[18px] w-[18px]', groupActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground/55')} />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side={isRTL ? 'left' : 'right'} sideOffset={12} className="bg-popover text-popover-foreground border-border text-xs font-medium px-3 py-1.5 shadow-lg">
            {label}
          </TooltipContent>
        </Tooltip>
        <PopoverContent side={isRTL ? 'left' : 'right'} sideOffset={12} align="start" className="w-52 p-2 bg-popover border border-border rounded-xl shadow-2xl">
          <p className="px-2 py-1 text-[10px] text-sidebar-primary uppercase tracking-wider font-semibold">{label}</p>
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
          groupActive ? 'text-sidebar-foreground' : 'text-sidebar-foreground/70 hover:bg-sidebar-foreground/[0.05] hover:text-sidebar-foreground/80'
        )}
      >
        <Icon className={cn('h-[18px] w-[18px] shrink-0', groupActive ? 'text-sidebar-primary' : 'text-sidebar-foreground/60 group-hover:text-sidebar-foreground/55')} />
        <span className={cn('truncate whitespace-nowrap flex-1 text-start', groupActive ? 'text-sidebar-foreground/85' : 'text-sidebar-foreground/70')}>{label}</span>
        {groupActive && (
          <span className="ms-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary shadow-[0_0_6px_var(--sidebar-primary)]" />
        )}
        <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60 transition-transform duration-200 group-hover:text-sidebar-foreground/40', expanded && 'rotate-180')} />
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
            <div className="mt-0.5 space-y-0.5 border-s-2 border-sidebar-primary/20 ms-[22px]">
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
  const { t, isRTL } = useLanguage();
  const notificationUnread = useUnreadCount();
  const uiConfig = useUiConfig();
  const { data: visibility } = useSidebarVisibility();

  return (
    <LayoutGroup id={collapsed ? 'sidebar-collapsed' : 'sidebar-expanded'}>
      <UiPreviewBanner collapsed={collapsed} />
      <nav className="space-y-1 px-2">
        {navSectionDefs.map((section, sIdx) => {
          // Permission gating first, then the role's Key-User config (hide/order).
          const permitted = filterSidebarMenus(section.items, visibility?.hiddenMenus).filter((item) => isItemVisible(item, hasPermission));
          const visibleItems = applySidebarConfig(permitted, uiConfig);
          if (visibleItems.length === 0) return null;

          return (
            <div key={section.titleKey} className={cn(sIdx > 0 && 'pt-4')}>
              {!collapsed && (
                <div className="flex items-center gap-2.5 px-3 mb-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/60 select-none whitespace-nowrap">
                    {t(section.titleKey)}
                  </p>
                  <div className="flex-1 h-px bg-gradient-to-r from-sidebar-foreground/[0.06] to-transparent" />
                </div>
              )}
              {collapsed && sIdx > 0 && <div className="mx-3 mb-2 h-px bg-sidebar-foreground/[0.06]" />}

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
      'relative flex items-center h-15 px-4 border-b border-sidebar-border bg-linear-to-b from-white/2 to-transparent',
      collapsed && 'justify-center px-0'
    )}>
      {collapsed ? (
        <Link href="/dashboard" className="flex items-center justify-center" aria-label={APP_NAME}>
          <Image
            src={APP_LOGOS.mark}
            alt={APP_NAME}
            priority
            width={64}
            height={64}
            className="block h-10 w-10 object-contain dark:hidden"
          />
          <Image
            src={APP_LOGOS.markDark}
            alt={APP_NAME}
            priority
            width={64}
            height={64}
            className="hidden h-10 w-10 object-contain dark:block"
          />
        </Link>
      ) : (
        <Link href="/dashboard" className="flex items-center group" aria-label={APP_PRODUCT_NAME}>
          <Image
            src={APP_LOGOS.full}
            alt={APP_PRODUCT_NAME}
            priority
            width={220}
            height={56}
            className="block h-9 w-auto object-contain dark:hidden"
          />
          <Image
            src={APP_LOGOS.fullDark}
            alt={APP_PRODUCT_NAME}
            priority
            width={220}
            height={56}
            className="hidden h-9 w-auto object-contain dark:block"
          />
        </Link>
      )}
    </div>
  );
}

// ── User card ───────────────────────────────────────────────

function SidebarUserCard({ collapsed }) {
  const { user } = useAuth();
  const router = useRouter();
  const { t, isRTL } = useLanguage();

  const logout = async () => {
    await authService.logout();
    router.push('/login');
  };

  const initials = `${(user?.firstName || '')[0] || ''}${(user?.lastName || '')[0] || ''}`.toUpperCase();
  const roleName = typeof user?.role === 'object' ? user.role.name : user?.role;

  const cardContent = (
    <button className={cn(
      'flex items-center gap-3 w-full rounded-xl px-3 py-2.5 transition-all duration-200',
      'bg-sidebar-foreground/[0.03] hover:bg-sidebar-foreground/[0.06] border border-sidebar-border hover:border-sidebar-border',
      collapsed && 'justify-center px-0 py-2.5'
    )}>
      <Avatar className="h-8 w-8 ring-2 ring-sidebar-primary/35 shadow-[0_0_16px_color-mix(in_oklab,var(--sidebar-primary)_20%,transparent)]">
        <AvatarFallback className="text-[11px] font-bold bg-primary-gradient text-white">
          {initials}
        </AvatarFallback>
      </Avatar>
      {!collapsed && (
        <div className="text-start min-w-0 flex-1">
          <p className="text-[13px] font-semibold truncate text-sidebar-foreground/85 leading-tight">
            {user?.firstName} {user?.lastName}
          </p>
          <span className="text-[10px] font-medium bg-sidebar-primary/10 text-sidebar-primary px-2 py-0.5 rounded-full">
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
        <TooltipContent side={isRTL ? 'left' : 'right'} sideOffset={12} className="bg-popover text-popover-foreground border-border text-xs font-medium">
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
  const { t, isRTL } = useLanguage();
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
        className="relative flex flex-col h-screen overflow-hidden bg-sidebar text-sidebar-foreground border-e border-sidebar-border sidebar-inner-glow"
      >
        {/* Ambient gradient */}
        <div className="pointer-events-none absolute inset-0 sidebar-ambient" />

        <SidebarLogo collapsed={collapsed} />

        {/* Scrollable nav */}
        <div className="relative flex-1 min-h-0">
          <div className="h-full overflow-y-auto overflow-x-hidden py-3 scrollbar-thin scrollbar-dark">
            <SidebarNav collapsed={collapsed} />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-sidebar to-transparent" />
        </div>

        {/* Bottom section */}
        <div className="relative p-2.5 space-y-2 border-t border-sidebar-border">
          <SidebarUserCard collapsed={collapsed} />

          {/* Collapse toggle */}
          <div className="py-1 mt-1">
            <button
              onClick={toggleCollapsed}
              aria-label={t(collapsed ? 'experience.navigation.expand' : 'sidebar.collapse')}
              className={cn(
                'flex items-center justify-center w-full rounded-lg py-1.5 transition-all duration-200',
                'text-[11px] text-sidebar-foreground/65 hover:text-sidebar-foreground/55 hover:bg-sidebar-foreground/[0.04]'
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

          <VersionBadge collapsed={collapsed} />
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}

// ── Mobile sidebar (Sheet overlay) ──────────────────────────

export function MobileSidebar() {
  const { isMobileOpen, setMobileOpen } = useSidebarStore();
  const pathname = usePathname();
  const { t, isRTL } = useLanguage();

  // Auto-close on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  return (
    <Sheet open={isMobileOpen} onOpenChange={setMobileOpen}>
      <SheetContent
        side={isRTL ? 'right' : 'left'}
        aria-label={t('experience.navigation.title')}
        showCloseButton={false}
        className="updata-sidebar w-[min(320px,90vw)] p-0 bg-sidebar border-r-0 text-sidebar-foreground gap-0 sidebar-inner-glow"
      >
        <SheetTitle className="sr-only">{t('experience.navigation.title')}</SheetTitle>
        {/* Ambient gradient */}
        <div className="pointer-events-none absolute inset-0 sidebar-ambient" />

        <SidebarLogo collapsed={false} />

        <div className="relative flex-1 min-h-0">
          <div className="h-full overflow-y-auto overflow-x-hidden py-3 scrollbar-thin scrollbar-dark">
            <TooltipProvider delayDuration={0}>
              <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </TooltipProvider>
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-sidebar to-transparent" />
        </div>

        <div className="relative space-y-2 p-2.5 border-t border-sidebar-border">
          <TooltipProvider delayDuration={0}>
            <SidebarUserCard collapsed={false} />
          </TooltipProvider>
          <VersionBadge />
        </div>
      </SheetContent>
    </Sheet>
  );
}
