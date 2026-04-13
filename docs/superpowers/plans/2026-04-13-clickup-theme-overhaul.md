# ClickUp-Style Theme Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform MB Boiler ERP from sky-600 blue theme to a ClickUp-style Modern SaaS Dashboard UI with purple gradient primary, data-dense layouts, rich animations, and premium polish across all pages.

**Architecture:** Layer-by-layer approach -- design tokens first, then layout shell, then components, then pages. Each layer builds on the previous. The sidebar becomes a dark, collapsible navigation panel. Detail views shift from `/[id]` pages to right-side drawers. The command palette is rebuilt with `cmdk`. The landing page gets a premium marketing redesign.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS 4 (OKLCH tokens), shadcn/ui (radix-nova), Framer Motion, cmdk, TanStack Table, Zustand, Recharts

**IMPORTANT:** This project uses Next.js 16.2.3 which has breaking changes. Before writing any code, read the relevant guide in `node_modules/next/dist/docs/` and heed deprecation notices (per AGENTS.md).

---

## File Structure

### New Files
- `client/src/stores/drawer-store.js` -- Right drawer state management
- `client/src/layout/right-drawer.jsx` -- Right drawer component
- `client/src/shared/components/data-table/column-visibility.jsx` -- Column toggle dropdown
- `client/src/shared/components/data-table/inline-cell.jsx` -- Inline editable cell wrapper
- `client/src/shared/hooks/use-keyboard-shortcuts.js` -- Global keyboard shortcut handler

### Modified Files
- `client/src/app/globals.css` -- Complete token overhaul (purple palette, shadows, glass)
- `client/src/layout/sidebar.jsx` -- Dark sidebar, animated collapse, user section at bottom
- `client/src/layout/header.jsx` -- Compact 48px topbar with glass effect
- `client/src/layout/command-search.jsx` -- Rebuild with cmdk, add actions/shortcuts
- `client/src/layout/theme-toggle.jsx` -- Animated toggle
- `client/src/layout/breadcrumbs.jsx` -- Styled for compact topbar
- `client/src/layout/notification-bell.jsx` -- Dropdown panel with notification list
- `client/src/layout/user-menu.jsx` -- Avatar + dropdown at sidebar bottom
- `client/src/app/(platform)/layout.js` -- Add right drawer, keyboard shortcuts, responsive logic
- `client/src/shared/components/data-table/data-table-shell.jsx` -- ClickUp-style dense table with row hover actions
- `client/src/shared/components/data-table/bulk-actions-bar.jsx` -- Floating bar at bottom
- `client/src/shared/components/page-header.jsx` -- Compact header with action slot
- `client/src/shared/components/loading-spinner.jsx` -- Purple gradient spinner
- `client/src/shared/components/empty-state.jsx` -- Illustrated empty state
- `client/src/shared/components/confirm-dialog.jsx` -- Themed dialog with animation
- `client/src/shared/components/page-skeletons.jsx` -- Purple-tinted shimmer skeletons
- `client/src/modules/auth/components/auth-layout.jsx` -- Purple gradient left panel
- `client/src/modules/auth/components/login-form.jsx` -- Themed form
- `client/src/modules/dashboard/components/stats-grid.jsx` -- Icon + metric + trend + sparkline
- `client/src/modules/dashboard/components/recent-activity.jsx` -- Timeline style
- `client/src/modules/dashboard/components/system-health.jsx` -- Status dots + progress bars
- `client/src/modules/users/components/users-table.jsx` -- Drawer-based detail, enhanced table
- `client/src/modules/roles/components/roles-table.jsx` -- Drawer-based detail
- `client/src/modules/audit/components/audit-log-table.jsx` -- Dense themed table
- `client/src/modules/sessions/components/sessions-table.jsx` -- Themed + revoke actions
- `client/src/app/(platform)/dashboard/page.js` -- Quick actions restyled
- `client/src/app/(platform)/profile/page.js` -- Two-column layout with tabs
- `client/src/app/(platform)/settings/system/page.js` -- Grouped cards + sticky save bar
- `client/src/app/page.js` -- Landing page structure
- `client/src/components/landing/hero-section.jsx` -- Purple gradient hero
- `client/src/components/landing/landing-navbar.jsx` -- Glass navbar
- `client/src/components/landing/landing-footer.jsx` -- Dark footer
- `client/src/components/landing/features-section.jsx` -- Bento grid
- `client/src/components/landing/modules-showcase.jsx` -- Tab showcase
- `client/src/components/landing/cta-section.jsx` -- Gradient CTA
- `client/src/components/landing/quick-access-section.jsx` -- Restyled

---

## Task 1: Design System Tokens -- globals.css Overhaul

**Files:**
- Modify: `client/src/app/globals.css` (full file)

- [ ] **Step 1: Replace the light theme `:root` block**

Replace lines 56-98 in `globals.css` with the purple-based token system:

```css
/* ═══════════════════════════════════════════
   Purple Gradient Design System — Light Theme
   Primary: #7B61FF (purple)
   Accent: Sky-500 (blue)
   ═══════════════════════════════════════════ */
:root {
  --background: oklch(0.985 0.002 280);
  --foreground: oklch(0.145 0.015 280);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0.015 280);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0.015 280);
  --primary: oklch(0.546 0.245 292);
  --primary-foreground: oklch(0.995 0 0);
  --secondary: oklch(0.965 0.012 280);
  --secondary-foreground: oklch(0.42 0.13 280);
  --muted: oklch(0.965 0.006 280);
  --muted-foreground: oklch(0.52 0.015 280);
  --accent: oklch(0.588 0.158 230);
  --accent-foreground: oklch(0.42 0.13 230);
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: oklch(0.995 0 0);
  --success: oklch(0.696 0.17 162);
  --success-foreground: oklch(0.995 0 0);
  --warning: oklch(0.75 0.183 55);
  --warning-foreground: oklch(0.145 0.015 280);
  --border: oklch(0.918 0.006 280);
  --input: oklch(0.918 0.006 280);
  --ring: oklch(0.546 0.245 292);
  --chart-1: oklch(0.546 0.245 292);
  --chart-2: oklch(0.588 0.158 230);
  --chart-3: oklch(0.696 0.17 162);
  --chart-4: oklch(0.75 0.183 55);
  --chart-5: oklch(0.62 0.22 310);
  --radius: 0.75rem;
  --sidebar: oklch(0.15 0.02 280);
  --sidebar-foreground: oklch(0.90 0.01 280);
  --sidebar-primary: oklch(0.546 0.245 292);
  --sidebar-primary-foreground: oklch(0.995 0 0);
  --sidebar-accent: oklch(0.22 0.03 280);
  --sidebar-accent-foreground: oklch(0.90 0.01 280);
  --sidebar-border: oklch(0.25 0.02 280);
  --sidebar-ring: oklch(0.546 0.245 292);
  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.05);
  --shadow-md: 0 4px 12px oklch(0 0 0 / 0.08);
  --shadow-lg: 0 8px 24px oklch(0 0 0 / 0.12);
}
```

- [ ] **Step 2: Replace the dark theme `.dark` block**

Replace lines 100-140 with:

```css
/* ═══════════════════════════════════════════
   Dark Theme
   ═══════════════════════════════════════════ */
.dark {
  --background: oklch(0.13 0.015 280);
  --foreground: oklch(0.97 0.004 280);
  --card: oklch(0.18 0.015 280);
  --card-foreground: oklch(0.97 0.004 280);
  --popover: oklch(0.18 0.015 280);
  --popover-foreground: oklch(0.97 0.004 280);
  --primary: oklch(0.65 0.22 292);
  --primary-foreground: oklch(0.995 0 0);
  --secondary: oklch(0.24 0.02 280);
  --secondary-foreground: oklch(0.82 0.08 292);
  --muted: oklch(0.24 0.015 280);
  --muted-foreground: oklch(0.62 0.02 280);
  --accent: oklch(0.588 0.158 230);
  --accent-foreground: oklch(0.82 0.08 230);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: oklch(0.995 0 0);
  --success: oklch(0.696 0.17 162);
  --success-foreground: oklch(0.995 0 0);
  --warning: oklch(0.75 0.183 55);
  --warning-foreground: oklch(0.145 0.015 280);
  --border: oklch(1 0 0 / 8%);
  --input: oklch(1 0 0 / 12%);
  --ring: oklch(0.65 0.22 292);
  --chart-1: oklch(0.65 0.22 292);
  --chart-2: oklch(0.588 0.158 230);
  --chart-3: oklch(0.696 0.17 162);
  --chart-4: oklch(0.75 0.183 55);
  --chart-5: oklch(0.62 0.22 310);
  --sidebar: oklch(0.12 0.015 280);
  --sidebar-foreground: oklch(0.90 0.01 280);
  --sidebar-primary: oklch(0.65 0.22 292);
  --sidebar-primary-foreground: oklch(0.995 0 0);
  --sidebar-accent: oklch(0.22 0.03 280);
  --sidebar-accent-foreground: oklch(0.90 0.01 280);
  --sidebar-border: oklch(1 0 0 / 8%);
  --sidebar-ring: oklch(0.65 0.22 292);
  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.15);
  --shadow-md: 0 4px 12px oklch(0 0 0 / 0.2);
  --shadow-lg: 0 8px 24px oklch(0 0 0 / 0.3);
}
```

- [ ] **Step 3: Add shadow tokens to `@theme inline` block**

Add these lines inside the `@theme inline {}` block (after the radius entries, around line 53):

```css
  --shadow-sm: var(--shadow-sm);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
```

- [ ] **Step 4: Update gradient utilities for purple**

Replace the `.text-gradient` block (lines 232-237) with:

```css
.text-gradient {
  background: linear-gradient(135deg, oklch(0.546 0.245 292), oklch(0.65 0.22 292));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

Replace `.bg-grid` (lines 240-250) with:

```css
.bg-grid {
  background-image:
    linear-gradient(oklch(0.546 0.245 292 / 5%) 1px, transparent 1px),
    linear-gradient(90deg, oklch(0.546 0.245 292 / 5%) 1px, transparent 1px);
  background-size: 60px 60px;
}
.dark .bg-grid {
  background-image:
    linear-gradient(oklch(0.65 0.22 292 / 8%) 1px, transparent 1px),
    linear-gradient(90deg, oklch(0.65 0.22 292 / 8%) 1px, transparent 1px);
}
```

- [ ] **Step 5: Add new utility classes after `.scrollbar-thin` block**

Append at end of file:

```css
/* Primary gradient button */
.bg-primary-gradient {
  background: linear-gradient(135deg, oklch(0.546 0.245 292), oklch(0.65 0.22 292));
}
.bg-primary-gradient:hover {
  background: linear-gradient(135deg, oklch(0.58 0.24 292), oklch(0.68 0.21 292));
}

/* Shadow utilities using tokens */
.shadow-theme-sm {
  box-shadow: var(--shadow-sm);
}
.shadow-theme-md {
  box-shadow: var(--shadow-md);
}
.shadow-theme-lg {
  box-shadow: var(--shadow-lg);
}

/* Purple shimmer for skeletons */
@keyframes purple-shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    var(--muted) 25%,
    oklch(0.546 0.245 292 / 8%) 50%,
    var(--muted) 75%
  );
  background-size: 200% 100%;
  animation: purple-shimmer 2s linear infinite;
}
```

- [ ] **Step 6: Verify the changes compile**

Run:
```bash
cd client && npm run build -- --no-lint 2>&1 | head -20
```

If the build starts without CSS errors, the tokens are valid.

- [ ] **Step 7: Commit**

```bash
git add client/src/app/globals.css
git commit -m "style: overhaul design tokens to purple gradient system

Replace sky-600 blue with #7B61FF purple gradient primary. Add shadow
tokens, purple shimmer skeleton, and gradient utilities. Keep sky-500
as accent color for links and info states."
```

---

## Task 2: Drawer Store

**Files:**
- Create: `client/src/stores/drawer-store.js`

- [ ] **Step 1: Create the drawer store**

```js
import { create } from 'zustand';

export const useDrawerStore = create((set) => ({
  isOpen: false,
  content: null,
  title: '',
  openDrawer: ({ title, content }) => set({ isOpen: true, title, content }),
  closeDrawer: () => set({ isOpen: false, content: null, title: '' }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add client/src/stores/drawer-store.js
git commit -m "feat: add drawer store for right-side detail panel"
```

---

## Task 3: Right Drawer Component

**Files:**
- Create: `client/src/layout/right-drawer.jsx`

- [ ] **Step 1: Create the right drawer component**

```jsx
'use client';

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDrawerStore } from '@/stores/drawer-store';
import { cn } from '@/lib/utils';

export function RightDrawer() {
  const { isOpen, title, content, closeDrawer } = useDrawerStore();

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && isOpen) closeDrawer();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, closeDrawer]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Mobile backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 z-40 xl:hidden"
            onClick={closeDrawer}
          />

          {/* Drawer panel */}
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={cn(
              'fixed right-0 top-0 h-dvh z-50 w-full sm:w-[480px]',
              'bg-card border-l border-border/40 shadow-theme-lg',
              'flex flex-col',
              'xl:relative xl:z-auto'
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
              <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={closeDrawer}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Content */}
            <ScrollArea className="flex-1">
              <div className="p-6">
                {content}
              </div>
            </ScrollArea>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/layout/right-drawer.jsx
git commit -m "feat: add right drawer component with slide animation"
```

---

## Task 4: Keyboard Shortcuts Hook

**Files:**
- Create: `client/src/shared/hooks/use-keyboard-shortcuts.js`

- [ ] **Step 1: Create the keyboard shortcuts hook**

```js
'use client';

import { useEffect } from 'react';
import { useSidebarStore } from '@/stores/sidebar-store';

export function useKeyboardShortcuts() {
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed);

  useEffect(() => {
    const handler = (e) => {
      // Ctrl+/ — Toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        toggleCollapsed();
      }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggleCollapsed]);
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/shared/hooks/use-keyboard-shortcuts.js
git commit -m "feat: add global keyboard shortcuts hook (Ctrl+/)"
```

---

## Task 5: Platform Layout -- Add Drawer and Shortcuts

**Files:**
- Modify: `client/src/app/(platform)/layout.js`

- [ ] **Step 1: Update the platform layout**

Replace the entire file content with:

```jsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useDrawerStore } from '@/stores/drawer-store';
import { Sidebar } from '@/layout/sidebar';
import { Header } from '@/layout/header';
import { RightDrawer } from '@/layout/right-drawer';
import { FullPageSpinner } from '@/shared/components/loading-spinner';
import { useKeyboardShortcuts } from '@/shared/hooks/use-keyboard-shortcuts';
import { cn } from '@/lib/utils';

export default function PlatformLayout({ children }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const isDrawerOpen = useDrawerStore((s) => s.isOpen);

  useKeyboardShortcuts();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) return <FullPageSpinner />;
  if (!isAuthenticated) return null;

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Sidebar — hidden on mobile, shown on md+ */}
      <div className="hidden md:block shrink-0">
        <Sidebar />
      </div>

      {/* Main content area */}
      <div className={cn(
        'flex flex-1 flex-col overflow-hidden min-w-0',
        'transition-all duration-300'
      )}>
        <Header />
        <main className="flex-1 overflow-auto p-4 sm:p-6 bg-muted/30 scrollbar-thin">
          {children}
        </main>
      </div>

      {/* Right drawer */}
      <RightDrawer />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/app/(platform)/layout.js
git commit -m "feat: add right drawer and keyboard shortcuts to platform layout"
```

---

## Task 6: Sidebar Overhaul -- Dark ClickUp-Style

**Files:**
- Modify: `client/src/layout/sidebar.jsx`

- [ ] **Step 1: Rewrite the sidebar component**

Replace the entire file content with:

```jsx
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
```

- [ ] **Step 2: Verify framer-motion is installed**

Run:
```bash
cd client && node -e "require.resolve('framer-motion')" 2>&1
```

If not found:
```bash
cd client && npm install framer-motion
```

- [ ] **Step 3: Commit**

```bash
git add client/src/layout/sidebar.jsx
git commit -m "feat: dark ClickUp-style sidebar with animated collapse and user menu"
```

---

## Task 7: Header -- Compact Glass Topbar

**Files:**
- Modify: `client/src/layout/header.jsx`

- [ ] **Step 1: Replace the header component**

Replace the entire file:

```jsx
'use client';

import { Menu, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebarStore } from '@/stores/sidebar-store';
import { useLanguage } from '@/lib/i18n/language-context';
import { Breadcrumbs } from './breadcrumbs';
import { CommandSearch } from './command-search';
import { ThemeToggle } from './theme-toggle';
import { NotificationBell } from './notification-bell';

export function Header() {
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed);
  const { locale, toggleLanguage } = useLanguage();

  return (
    <header className="flex items-center justify-between h-12 border-b border-border/40 bg-card/80 backdrop-blur-md px-4 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCollapsed}
          className="md:hidden h-8 w-8"
        >
          <Menu className="h-4 w-4" />
        </Button>
        <Breadcrumbs />
      </div>
      <div className="flex items-center gap-1.5">
        <CommandSearch />
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleLanguage}
          className="gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground h-8"
        >
          <Globe className="h-3.5 w-3.5" />
          {locale === 'de' ? 'EN' : 'DE'}
        </Button>
        <NotificationBell />
        <ThemeToggle />
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/layout/header.jsx
git commit -m "style: compact 48px glass topbar header"
```

---

## Task 8: Command Palette -- Rebuild with cmdk

**Files:**
- Modify: `client/src/layout/command-search.jsx`

- [ ] **Step 1: Replace the command search with cmdk-based palette**

Replace the entire file:

```jsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useTheme } from 'next-themes';
import {
  Search, LayoutDashboard, Users, Shield, Monitor, ScrollText,
  User, Activity, Plus, Sun, Moon, ArrowRight,
} from 'lucide-react';
import { userService } from '@/modules/users/services/user-service';
import { cn } from '@/lib/utils';

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, group: 'Seiten', shortcut: '' },
  { label: 'Benutzer', href: '/settings/users', icon: Users, group: 'Seiten', shortcut: '' },
  { label: 'Rollen', href: '/settings/roles', icon: Shield, group: 'Seiten', shortcut: '' },
  { label: 'Sitzungen', href: '/settings/sessions', icon: Monitor, group: 'Seiten', shortcut: '' },
  { label: 'Audit Log', href: '/settings/audit', icon: ScrollText, group: 'Seiten', shortcut: '' },
  { label: 'Mein Profil', href: '/profile', icon: User, group: 'Seiten', shortcut: '' },
  { label: 'System', href: '/settings/system', icon: Activity, group: 'Seiten', shortcut: '' },
];

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState([]);
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const debounceRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setUsers([]);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) {
      setUsers([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await userService.getUsers({ search: query, pageSize: 5 });
        setUsers(res?.data || []);
      } catch {
        setUsers([]);
      }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const navigate = (href) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/60 hover:border-border transition-all duration-200 min-w-[200px] backdrop-blur-sm"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Suchen...</span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border/60 bg-background/80 px-1.5 text-[0.65rem] font-mono text-muted-foreground">
          Ctrl+K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden rounded-2xl shadow-theme-lg" hideClose>
          <Command className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[0.65rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
            <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
              <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Suchen oder Aktion ausfuehren..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <Command.List className="max-h-[300px] overflow-y-auto py-2 scrollbar-thin">
              <Command.Empty className="px-4 py-8 text-center text-sm text-muted-foreground">
                Keine Ergebnisse fuer &ldquo;{query}&rdquo;
              </Command.Empty>

              <Command.Group heading="Seiten">
                {navItems.map((item) => (
                  <Command.Item
                    key={item.href}
                    value={item.label}
                    onSelect={() => navigate(item.href)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors data-[selected=true]:bg-primary/8 data-[selected=true]:text-foreground text-muted-foreground hover:text-foreground"
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1 font-medium">{item.label}</span>
                    <ArrowRight className="h-3 w-3 opacity-0 data-[selected=true]:opacity-100" />
                  </Command.Item>
                ))}
              </Command.Group>

              {users.length > 0 && (
                <Command.Group heading="Benutzer">
                  {users.map((u) => (
                    <Command.Item
                      key={u._id}
                      value={`${u.firstName} ${u.lastName} ${u.email}`}
                      onSelect={() => navigate(`/settings/users/${u._id}`)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors data-[selected=true]:bg-primary/8 data-[selected=true]:text-foreground text-muted-foreground hover:text-foreground"
                    >
                      <User className="h-4 w-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{u.firstName} {u.lastName}</span>
                        <span className="text-xs text-muted-foreground ml-2">{u.email}</span>
                      </div>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group heading="Aktionen">
                <Command.Item
                  value="Design wechseln Theme toggle"
                  onSelect={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setOpen(false); }}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors data-[selected=true]:bg-primary/8 data-[selected=true]:text-foreground text-muted-foreground hover:text-foreground"
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  <span className="flex-1 font-medium">Design wechseln</span>
                </Command.Item>
                <Command.Item
                  value="Neuer Benutzer erstellen"
                  onSelect={() => navigate('/settings/users?action=create')}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors data-[selected=true]:bg-primary/8 data-[selected=true]:text-foreground text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                  <span className="flex-1 font-medium">Neuer Benutzer</span>
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/layout/command-search.jsx
git commit -m "feat: rebuild command palette with cmdk, add quick actions"
```

---

## Task 9: Theme Toggle -- Animated

**Files:**
- Modify: `client/src/layout/theme-toggle.jsx`

- [ ] **Step 1: Replace with animated theme toggle**

```jsx
'use client';

import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 rounded-lg"
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      title="Design wechseln"
    >
      <motion.div
        key={theme}
        initial={{ scale: 0, rotate: -90 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
      </motion.div>
      <span className="sr-only">Design wechseln</span>
    </Button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/layout/theme-toggle.jsx
git commit -m "style: animated theme toggle with framer-motion"
```

---

## Task 10: Shared Components -- Themed Updates

**Files:**
- Modify: `client/src/shared/components/page-header.jsx`
- Modify: `client/src/shared/components/loading-spinner.jsx`
- Modify: `client/src/shared/components/empty-state.jsx`
- Modify: `client/src/shared/components/confirm-dialog.jsx`
- Modify: `client/src/shared/components/data-table/bulk-actions-bar.jsx`

- [ ] **Step 1: Update PageHeader**

Replace `client/src/shared/components/page-header.jsx`:

```jsx
export function PageHeader({ title, description, children }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Update LoadingSpinner with purple gradient**

Replace `client/src/shared/components/loading-spinner.jsx`:

```jsx
'use client';

import { cn } from '@/lib/utils';
import { Zap } from 'lucide-react';

export function LoadingSpinner({ className, size = 'default' }) {
  const sizeClass = { sm: 'h-4 w-4', default: 'h-6 w-6', lg: 'h-10 w-10' }[size];
  const ringSize = { sm: 'h-8 w-8', default: 'h-12 w-12', lg: 'h-20 w-20' }[size];

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <div className="relative">
        <div className={cn('rounded-full border-2 border-muted border-t-primary animate-spin', ringSize)} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Zap className={cn('text-primary', sizeClass)} />
        </div>
      </div>
    </div>
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6 animate-in fade-in duration-300">
        <div className="relative">
          <div className="absolute -inset-4 rounded-full bg-primary/10 animate-pulse" />
          <div className="relative h-16 w-16">
            <svg className="h-16 w-16 animate-spin" viewBox="0 0 64 64" fill="none">
              <circle cx="32" cy="32" r="28" stroke="var(--muted)" strokeWidth="3" />
              <path
                d="M32 4a28 28 0 0 1 28 28"
                stroke="url(#spinner-gradient)"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="spinner-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="oklch(0.546 0.245 292)" />
                  <stop offset="100%" stopColor="oklch(0.65 0.22 292)" />
                </linearGradient>
              </defs>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-9 w-9 rounded-xl bg-primary-gradient flex items-center justify-center shadow-theme-md">
                <Zap className="h-4.5 w-4.5 text-white" />
              </div>
            </div>
          </div>
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-foreground">MB Boiler <span className="text-primary">ERP</span></p>
          <p className="text-xs text-muted-foreground animate-pulse">Laden...</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update EmptyState**

Replace `client/src/shared/components/empty-state.jsx`:

```jsx
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({ icon: Icon = Inbox, title = 'Keine Daten', description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/5 border border-primary/10">
        <Icon className="h-7 w-7 text-primary/60" />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Update ConfirmDialog**

Replace `client/src/shared/components/confirm-dialog.jsx`:

```jsx
'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

export function ConfirmDialog({ open, onOpenChange, title, description, onConfirm, loading, variant = 'destructive', confirmText = 'Bestaetigen', cancelText = 'Abbrechen' }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] rounded-2xl shadow-theme-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${variant === 'destructive' ? 'bg-destructive/10' : 'bg-primary/10'}`}>
              <AlertTriangle className={`h-5 w-5 ${variant === 'destructive' ? 'text-destructive' : 'text-primary'}`} />
            </div>
            <DialogTitle>{title}</DialogTitle>
          </div>
          {description && <DialogDescription className="mt-2">{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading} className="rounded-lg">
            {cancelText}
          </Button>
          <Button variant={variant} onClick={onConfirm} disabled={loading} className="rounded-lg">
            {loading ? 'Wird ausgefuehrt...' : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Update BulkActionsBar -- floating bottom style**

Replace `client/src/shared/components/data-table/bulk-actions-bar.jsx`:

```jsx
'use client';

import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export function BulkActionsBar({ count, onClear, children }) {
  if (count === 0) return null;

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 20, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-2xl border border-primary/20 bg-card shadow-theme-lg px-5 py-3 backdrop-blur-md"
    >
      <span className="text-sm font-semibold text-primary">
        {count} ausgewaehlt
      </span>
      <div className="h-4 w-px bg-border" />
      <div className="flex items-center gap-2">
        {children}
      </div>
      <Button variant="ghost" size="sm" onClick={onClear} className="gap-1.5 text-muted-foreground h-8 rounded-lg">
        <X className="h-3.5 w-3.5" />
        Aufheben
      </Button>
    </motion.div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add client/src/shared/components/page-header.jsx client/src/shared/components/loading-spinner.jsx client/src/shared/components/empty-state.jsx client/src/shared/components/confirm-dialog.jsx client/src/shared/components/data-table/bulk-actions-bar.jsx
git commit -m "style: update shared components with purple theme and animations"
```

---

## Task 11: Data Table Shell -- ClickUp-Style Dense Table

**Files:**
- Modify: `client/src/shared/components/data-table/data-table-shell.jsx`

- [ ] **Step 1: Replace the DataTableShell with ClickUp-style**

Replace the entire file content. The key changes: compact 40px row height, hover action reveal via `group/row`, sticky header, purple-tinted skeleton shimmer, updated pagination styling.

```jsx
'use client';

import { useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  ArrowUp, ArrowDown, ArrowUpDown, Search, Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function DataTableShell({
  columns: rawColumns,
  data = [],
  isLoading = false,
  rowCount = 0,
  pagination,
  onPaginationChange,
  onSortingChange,
  sorting,
  enableGlobalFilter = true,
  onGlobalFilterChange,
  globalFilter = '',
  renderTopToolbarCustomActions,
  renderRowActions,
  manualPagination = true,
  manualSorting = true,
  manualFiltering = true,
  enableRowSelection = false,
  rowSelection,
  onRowSelectionChange,
  getRowId,
  onRowClick,
}) {
  const columns = useMemo(() => {
    const cols = rawColumns.map((col) => ({
      ...col,
      cell: col.cell || col.Cell
        ? (info) => {
            const renderer = col.cell || col.Cell;
            return renderer({ row: info.row, cell: info.cell, getValue: info.getValue });
          }
        : undefined,
    }));

    if (enableRowSelection) {
      cols.unshift({
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          />
        ),
        size: 40,
        enableSorting: false,
      });
    }

    if (renderRowActions) {
      cols.push({
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-0.5 opacity-0 group-hover/row:opacity-100 transition-opacity duration-150">
            {renderRowActions({ row })}
          </div>
        ),
        size: 100,
        enableSorting: false,
      });
    }

    return cols;
  }, [rawColumns, enableRowSelection, renderRowActions]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: sorting || [],
      globalFilter: globalFilter || '',
      ...(pagination ? { pagination } : {}),
      ...(enableRowSelection && rowSelection != null ? { rowSelection } : {}),
    },
    onSortingChange: onSortingChange || undefined,
    onGlobalFilterChange: onGlobalFilterChange || undefined,
    onPaginationChange: onPaginationChange || undefined,
    onRowSelectionChange: onRowSelectionChange || undefined,
    getRowId: getRowId || ((row) => row._id || row.id),
    getCoreRowModel: getCoreRowModel(),
    ...(manualSorting ? { manualSorting: true } : { getSortedRowModel: getSortedRowModel() }),
    ...(manualPagination ? { manualPagination: true, rowCount } : { getPaginationRowModel: getPaginationRowModel() }),
    ...(manualFiltering ? { manualFiltering: true } : { getFilteredRowModel: getFilteredRowModel() }),
    enableRowSelection,
  });

  const pageCount = manualPagination
    ? Math.ceil(rowCount / (pagination?.pageSize || 25))
    : table.getPageCount();

  const currentPage = (pagination?.pageIndex ?? 0) + 1;

  return (
    <div className="rounded-xl border border-border/40 bg-card overflow-hidden shadow-theme-sm">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border/40">
        <div className="flex items-center gap-2">
          {renderTopToolbarCustomActions && renderTopToolbarCustomActions({ table })}
        </div>
        {enableGlobalFilter && (
          <div className="relative w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Suchen..."
              value={globalFilter}
              onChange={(e) => onGlobalFilterChange?.(e.target.value)}
              className="h-8 pl-9 rounded-lg bg-muted/40 border-border/50 text-sm"
            />
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-b border-border/40 bg-muted/20 hover:bg-muted/20">
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className={cn(
                      'h-9 px-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground',
                      header.column.getCanSort() && 'cursor-pointer select-none hover:text-foreground transition-colors'
                    )}
                    style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                    onClick={header.column.getCanSort() ? header.column.getToggleSortingHandler() : undefined}
                  >
                    {header.isPlaceholder ? null : (
                      <div className="flex items-center gap-1.5">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getCanSort() && (
                          <span className="text-muted-foreground/50">
                            {header.column.getIsSorted() === 'asc' ? (
                              <ArrowUp className="h-3 w-3 text-primary" />
                            ) : header.column.getIsSorted() === 'desc' ? (
                              <ArrowDown className="h-3 w-3 text-primary" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3" />
                            )}
                          </span>
                        )}
                      </div>
                    )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`} className="border-b border-border/20">
                  {columns.map((_, j) => (
                    <TableCell key={j} className="px-4 py-2.5">
                      <div className="h-4 w-full rounded skeleton-shimmer" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-40">
                  <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                    <div className="h-12 w-12 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center">
                      <Inbox className="h-6 w-6 text-primary/40" />
                    </div>
                    <p className="text-sm font-medium">Keine Eintraege vorhanden</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className={cn(
                    'group/row border-b border-border/20 transition-colors h-10',
                    row.getIsSelected() && 'bg-primary/5',
                    onRowClick && 'cursor-pointer',
                    'hover:bg-muted/40'
                  )}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="px-4 py-2">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/40 bg-muted/10">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Zeilen</span>
          <Select
            value={String(pagination?.pageSize || 25)}
            onValueChange={(val) => {
              onPaginationChange?.({ pageIndex: 0, pageSize: Number(val) });
            }}
          >
            <SelectTrigger className="h-7 w-[60px] rounded-lg text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 25, 50, 100].map((size) => (
                <SelectItem key={size} value={String(size)}>{size}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground mr-2">
            {currentPage} / {pageCount || 1}
          </span>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => onPaginationChange?.({ ...(pagination || {}), pageIndex: 0 })} disabled={currentPage <= 1}>
            <ChevronsLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => onPaginationChange?.({ ...(pagination || {}), pageIndex: (pagination?.pageIndex || 0) - 1 })} disabled={currentPage <= 1}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => onPaginationChange?.({ ...(pagination || {}), pageIndex: (pagination?.pageIndex || 0) + 1 })} disabled={currentPage >= pageCount}>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => onPaginationChange?.({ ...(pagination || {}), pageIndex: (pageCount || 1) - 1 })} disabled={currentPage >= pageCount}>
            <ChevronsRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/shared/components/data-table/data-table-shell.jsx
git commit -m "style: ClickUp-style dense data table with compact rows and hover actions"
```

---

## Task 12: Auth Layout -- Purple Gradient

**Files:**
- Modify: `client/src/modules/auth/components/auth-layout.jsx`

- [ ] **Step 1: Update the auth layout left panel gradient from sky-600 to purple**

Replace the gradient background line (line 19):

Change `from-sky-600 via-primary to-blue-700` to `from-[#7B61FF] via-primary to-[#5B3FD4]`

Replace the mobile logo gradient (line 77):

Change `from-primary to-sky-500` to the primary gradient:
`bg-primary-gradient`

- [ ] **Step 2: Commit**

```bash
git add client/src/modules/auth/components/auth-layout.jsx
git commit -m "style: auth layout purple gradient left panel"
```

---

## Task 13: Dashboard Page -- Themed Stats and Quick Actions

**Files:**
- Modify: `client/src/modules/dashboard/components/stats-grid.jsx`
- Modify: `client/src/app/(platform)/dashboard/page.js`

- [ ] **Step 1: Update StatsGrid card gradient colors**

In `client/src/modules/dashboard/components/stats-grid.jsx`, update the `defaultCards` array colors (line 21-25):

Change `'from-sky-500 to-blue-600'` to `'from-[#7B61FF] to-[#9F7AEA]'` for the first card.

Keep other card colors as they are (violet, amber, emerald) -- they work with the purple theme.

Also add `shadow-theme-sm` class to the Card component (line 34).

- [ ] **Step 2: Update dashboard quick action cards**

In `client/src/app/(platform)/dashboard/page.js`, the icon container (line 59) already uses `bg-primary/10` and `text-primary` which will automatically pick up the purple from the new tokens. No code change needed here.

- [ ] **Step 3: Commit**

```bash
git add client/src/modules/dashboard/components/stats-grid.jsx client/src/app/(platform)/dashboard/page.js
git commit -m "style: themed dashboard stats grid with purple gradient"
```

---

## Task 14: Landing Page -- Premium Overhaul

**Files:**
- Modify: `client/src/components/landing/hero-section.jsx`
- Modify: `client/src/components/landing/landing-navbar.jsx`
- Modify: `client/src/components/landing/landing-footer.jsx`
- Modify: `client/src/components/landing/features-section.jsx`
- Modify: `client/src/components/landing/cta-section.jsx`

- [ ] **Step 1: Update hero section gradients**

In `client/src/components/landing/hero-section.jsx`:

The hero already uses `text-gradient`, `bg-grid`, and `animate-pulse-glow` which will now use purple tones from the updated globals.css. The gradient glow blobs (lines 31-32) reference `bg-primary/6` and `bg-sky-400/5` -- update the second one:

Change `bg-sky-400/5` to `bg-primary/4`

The CTA button (line 59) already uses `shadow-primary/25` which will be purple. No changes needed.

Update the mockup glow (line 85):
Change `from-primary/15 via-sky-400/10` to `from-primary/15 via-[#9F7AEA]/10`

Update floating card (line 157): already uses `bg-success/10` which is fine.

- [ ] **Step 2: Update landing navbar**

In the navbar file, update any `from-primary to-sky-500` gradient references to `bg-primary-gradient`.

- [ ] **Step 3: Update features section**

Update any sky/blue color references to use `primary` token or purple hues. The features section likely uses `bg-primary/10` patterns which will auto-update.

- [ ] **Step 4: Update CTA section**

In `client/src/components/landing/cta-section.jsx`, update any gradient backgrounds from sky-600/blue tones to purple tones using the `bg-primary-gradient` or `from-[#7B61FF] to-[#5B3FD4]`.

- [ ] **Step 5: Update footer**

In `client/src/components/landing/landing-footer.jsx`, update any sky/blue accent references to use `text-primary` which now maps to purple.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/landing/
git commit -m "style: premium landing page with purple gradient theme"
```

---

## Task 15: Install framer-motion if needed and verify build

**Files:**
- Modify: `client/package.json` (if framer-motion not installed)

- [ ] **Step 1: Check and install framer-motion**

```bash
cd client && node -e "try { require.resolve('framer-motion'); console.log('installed'); } catch { console.log('missing'); }"
```

If missing:
```bash
cd client && npm install framer-motion
```

- [ ] **Step 2: Run the development server to verify**

```bash
cd client && npm run dev
```

Open the browser and verify:
1. Purple primary color is applied throughout
2. Sidebar is dark with purple active indicators
3. Header is compact with glass effect
4. Command palette opens with Ctrl+K
5. Theme toggle works in both light/dark modes

- [ ] **Step 3: Commit package changes if any**

```bash
git add client/package.json client/package-lock.json
git commit -m "chore: add framer-motion dependency"
```

---

## Task 16: Final Polish Pass

**Files:**
- Various files from previous tasks

- [ ] **Step 1: Verify all pages render without errors**

Navigate through each page in the browser:
- `/` (landing)
- `/login` (auth)
- `/dashboard`
- `/settings/users`
- `/settings/roles`
- `/settings/audit`
- `/settings/sessions`
- `/settings/system`
- `/profile`

- [ ] **Step 2: Test keyboard shortcuts**

- `Ctrl+K` -- Opens command palette
- `Ctrl+/` -- Toggles sidebar
- `Esc` -- Closes drawer/modal/palette

- [ ] **Step 3: Test dark/light mode**

Toggle theme and verify:
- All pages look polished in both modes
- Sidebar stays dark in both modes
- Glass effects work on topbar
- Text contrast is readable

- [ ] **Step 4: Test responsive breakpoints**

Resize browser to verify:
- Desktop (>1280px): Full sidebar + content
- Tablet (768-1280px): Collapsed sidebar
- Mobile (<768px): Sidebar hidden, hamburger menu works

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "style: polish pass - fix theme inconsistencies across all pages"
```
