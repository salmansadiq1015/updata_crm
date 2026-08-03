'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useUiPreviewStore } from '@/stores/ui-preview-store';

/**
 * Role-dependent UI configuration (Rollenabhängige Startseite).
 *
 * Resolution order:
 *  1. Testmodus preview (Key User "Als Rolle anzeigen") — wins while active.
 *  2. The logged-in user's role uiConfig.desktop (set by the Key User).
 * The personal start page (user.preferences.startPage) overrides the role's
 * start page — individual users may adapt despite the role default.
 */
export function useUiConfig() {
  const user = useAuthStore((s) => s.user);
  const preview = useUiPreviewStore((s) => s.preview);

  return useMemo(() => {
    const roleConfig = user?.role?.uiConfig?.desktop || null;
    const active = preview?.config?.desktop || preview?.config || roleConfig || {};
    const userStartPage = user?.preferences?.startPage || null;
    return {
      // In preview mode the role's start page is shown as-is (the Key User wants
      // to see what that role gets); otherwise the personal override wins.
      startPage: (preview ? active.startPage : (userStartPage || active.startPage)) || '/dashboard',
      sidebarOrder: active.sidebarOrder || null,
      hiddenModules: active.hiddenModules || null,
      taskDefaults: active.taskDefaults || null,
      previewRoleName: preview?.roleName || null,
    };
  }, [user, preview]);
}

/** Sort + filter top-level sidebar items per the role config. Permission gating stays upstream. */
export function applySidebarConfig(items, { sidebarOrder, hiddenModules }) {
  const idOf = (item) => item.key || item.href;
  let visible = items;
  if (hiddenModules?.length) {
    visible = visible.filter((item) => !hiddenModules.includes(idOf(item)));
  }
  if (sidebarOrder?.length) {
    const rank = new Map(sidebarOrder.map((id, i) => [id, i]));
    visible = [...visible].sort((a, b) => {
      const ra = rank.has(idOf(a)) ? rank.get(idOf(a)) : 1000 + items.indexOf(a);
      const rb = rank.has(idOf(b)) ? rank.get(idOf(b)) : 1000 + items.indexOf(b);
      return ra - rb;
    });
  }
  return visible;
}
