'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';

export type IntelT = (key: string, fallback?: string, vars?: Record<string, unknown>) => string;

const interpolate = (text: string, vars?: Record<string, unknown>) => (vars ? text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m)) : text);
const fallbackT: IntelT = (key, fallback, vars) => interpolate(fallback ?? key, vars);

/**
 * The app's t() for calling-intelligence UI. Other aiCalling screens are also
 * rendered outside a LanguageProvider (tests, embedded drawers); there the English
 * fallback strings are used instead of throwing.
 */
export function useIntelT(): IntelT {
  try {
    return useLanguage().t as IntelT;
  } catch {
    return fallbackT;
  }
}

const readPermissions = usePermissions;
const canManage = ({ isAdmin, hasPermission }: { isAdmin: boolean; hasPermission: (p: string) => boolean }) => Boolean(isAdmin || ['ai-calling:write', 'crm:write', 'crm:admin'].some(hasPermission));

/** ai-calling:write (or legacy CRM write) for review actions; read-only where auth is not mounted. The API enforces it either way. */
export function useCanManageCalls(): boolean {
  try {
    // Always called exactly once per render (same order); it only throws where no auth store is mounted.
    return canManage(readPermissions());
  } catch {
    return false;
  }
}
