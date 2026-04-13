'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useSidebarStore } from '@/stores/sidebar-store';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useAuth } from '@/shared/hooks/use-auth';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  LayoutDashboard, Users, Building2, FolderKanban, Calendar,
  FileText, Receipt, ClipboardList, Package, Settings,
  ChevronLeft, ChevronRight, Shield, Bot, Monitor, ScrollText, Activity,
  HeartPulse, Cog, Zap, LogOut, User,
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
      { labelKey: 'sidebar.health', href: '/admin/health', icon: HeartPulse, permission: 'system:read' },
      { labelKey: 'sidebar.jobs', href: '/admin/jobs', icon: Cog, permission: 'system:admin' },
      { labelKey: 'sidebar.settings', href: '/settings', icon: Settings, disabled: true, permission: 'settings:read' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isCollapsed, toggleCollapsed } = useSidebarStore();
  const { hasPermission } = usePermissions();
  const { user } = useAuth();
  const { t } = useLanguage();
  const logout = useAuthStore((s) => s.logout);

  const initials = `${(user?.firstName || '')[0] || ''}${(user?.lastName || '')[0] || ''}`.toUpperCase();

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        animate={{ width: isCollapsed ? 64 : 260 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="relative flex flex-col h-screen overflow-hidden bg-sidebar text-sidebar-foreground border-r border-sidebar-border"
      >
        {/* Logo */}
        <div className={cn('flex items-center h-12 px-4 border-b border-sidebar-border', isCollapsed && 'justify-center px-2')}>
          {isCollapsed ? (
            <div className="h-8 w-8 rounded-lg bg-primary-gradient flex items-center justify-center">
              <Zap className="h-4 w-4 text-white" />
            </div>
          ) : (
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary-gradient flex items-center justify-center shadow-sm">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="font-bold text-sm tracking-tight text-sidebar-foreground">
                MB Boiler <span className="text-primary">ERP</span>
              </span>
            </Link>
          )}
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 scrollbar-thin">
          <nav className="space-y-5 px-2">
            {navSectionDefs.map((section) => (
              <div key={section.titleKey}>
                {!isCollapsed && (
                  <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
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
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-150',
                          isActive
                            ? 'bg-sidebar-accent text-sidebar-primary font-medium border-l-2 border-sidebar-primary ml-0.5'
                            : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                          item.disabled && 'opacity-30 pointer-events-none',
                          isCollapsed && 'justify-center px-2'
                        )}
                      >
                        <Icon className={cn('h-4 w-4 flex-shrink-0', isActive && 'text-sidebar-primary')} />
                        <AnimatePresence>
                          {!isCollapsed && (
                            <motion.span
                              initial={{ opacity: 0, width: 0 }}
                              animate={{ opacity: 1, width: 'auto' }}
                              exit={{ opacity: 0, width: 0 }}
                              transition={{ duration: 0.15 }}
                              className="truncate"
                            >
                              {label}
                            </motion.span>
                          )}
                        </AnimatePresence>
                        {!isCollapsed && item.disabled && (
                          <span className="ml-auto text-[9px] text-sidebar-foreground/25 uppercase tracking-wider">Soon</span>
                        )}
                      </Link>
                    );

                    if (isCollapsed) {
                      return (
                        <Tooltip key={item.href}>
                          <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                          <TooltipContent side="right" className="bg-card text-card-foreground border">
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
        </div>

        {/* Bottom: User + Collapse */}
        <div className="border-t border-sidebar-border p-2 space-y-1">
          {/* User section */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                'flex items-center gap-3 w-full rounded-lg px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent/50',
                isCollapsed && 'justify-center px-2'
              )}>
                <Avatar className="h-8 w-8 border border-sidebar-border">
                  <AvatarFallback className="text-xs font-semibold bg-primary-gradient text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                {!isCollapsed && (
                  <div className="text-left min-w-0">
                    <p className="text-sm font-medium truncate text-sidebar-foreground">
                      {user?.firstName} {user?.lastName}
                    </p>
                    <p className="text-[11px] truncate text-sidebar-foreground/40">{user?.email}</p>
                  </div>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side={isCollapsed ? 'right' : 'top'} align="start" className="w-48">
              <DropdownMenuItem asChild>
                <Link href="/profile" className="gap-2">
                  <User className="h-3.5 w-3.5" />
                  Profil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/system" className="gap-2">
                  <Settings className="h-3.5 w-3.5" />
                  Einstellungen
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="gap-2 text-destructive focus:text-destructive">
                <LogOut className="h-3.5 w-3.5" />
                Abmelden
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Collapse toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            onClick={toggleCollapsed}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}
