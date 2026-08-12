'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { INSTALLATION_STATUS_META } from '@/modules/crm/constants/crm-constants';

/**
 * Status of a component (Komponente), rendered the same way everywhere it is
 * listed — Objekt tab, component list, component detail. Colours come from
 * INSTALLATION_STATUS_META so "Defekt" (red) and "Stillgelegt" (violet) never
 * look alike.
 */
export function InstallationStatusBadge({ status, className, size = 'sm' }) {
  const { t } = useLanguage();
  const key = status || 'active';
  const meta = INSTALLATION_STATUS_META[key] || INSTALLATION_STATUS_META.active;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md font-medium ring-1 ring-inset',
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-xs',
        meta.bg, meta.color, meta.ring,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', meta.dot)} aria-hidden />
      {t(`crm.installations.status.${key}`, meta.label)}
    </span>
  );
}
